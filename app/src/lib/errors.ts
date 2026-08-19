import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Error handling.
 *
 * Two rules:
 *
 * 1. **Every function in `lib/queries` throws `AppError` on failure.** Nothing
 *    returns `{ data, error }` past that boundary — React Query's `isError`
 *    branch is where errors are handled, and it only works if the promise
 *    rejects.
 * 2. **`message` is safe to show a user; `cause` is not.** Postgres constraint
 *    text and RLS messages leak schema detail and read like a stack trace.
 *    Render `error.message`, log `error.cause`.
 */

export type AppErrorKind =
  /** No network, DNS failure, request aborted. Retryable. */
  | 'network'
  /** Not signed in, or the session expired. Send them to `(auth)`. */
  | 'auth'
  /** Signed in but RLS said no. Not retryable — do not offer "try again". */
  | 'forbidden'
  /** The row does not exist, or RLS hides it (indistinguishable by design). */
  | 'not_found'
  /** A check constraint, unique index or validation rejected the write. */
  | 'validation'
  /** Rate limited. Retryable after a delay. */
  | 'rate_limited'
  /** A feature that has not been built yet. */
  | 'not_implemented'
  /** Anything else. */
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** True when a retry has a plausible chance of succeeding. */
  readonly retryable: boolean;
  /** Postgres SQLSTATE or Supabase auth code, when there is one. */
  readonly code: string | undefined;

  constructor(
    kind: AppErrorKind,
    message: string,
    options?: { cause?: unknown; code?: string; retryable?: boolean },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.kind = kind;
    this.code = options?.code;
    this.retryable = options?.retryable ?? (kind === 'network' || kind === 'rate_limited');
  }
}

export class NotImplementedError extends AppError {
  constructor(what: string) {
    super('not_implemented', `${what} is not implemented yet.`, { retryable: false });
    this.name = 'NotImplementedError';
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Maps a PostgREST error onto an `AppError`.
 *
 * SQLSTATE codes worth knowing for this schema:
 *   23505  unique_violation      — duplicate handle, double-follow, double-save
 *   23514  check_violation       — e.g. `events_online_needs_link`, `no_self_follow`
 *   23503  foreign_key_violation — referencing a row that is gone
 *   42501  insufficient_privilege — RLS refused the write
 *   PGRST116 — `.single()` matched zero rows
 */
export function fromPostgrestError(error: PostgrestError, context: string): AppError {
  const code = error.code;

  switch (code) {
    case 'PGRST116':
      return new AppError('not_found', 'We could not find that.', { cause: error, code });
    case '42501':
      return new AppError('forbidden', 'You do not have permission to do that.', {
        cause: error,
        code,
      });
    case '23505':
      return new AppError('validation', 'That already exists.', { cause: error, code });
    case '23514':
      return new AppError('validation', 'Some of those details are not valid.', {
        cause: error,
        code,
      });
    case '23503':
      return new AppError('validation', 'Something this refers to no longer exists.', {
        cause: error,
        code,
      });
    case 'PGRST301':
      return new AppError('auth', 'Your session expired. Please sign in again.', {
        cause: error,
        code,
      });
    default:
      return new AppError('unknown', `Could not ${context}. Please try again.`, {
        cause: error,
        code,
      });
  }
}

/**
 * Maps a Supabase Auth error onto an `AppError`.
 *
 * Note the deliberate vagueness on bad credentials: the message does not
 * distinguish "no such account" from "wrong password", because doing so lets
 * anyone enumerate which emails are registered.
 */
export function fromAuthError(error: { message: string; status?: number; code?: string }): AppError {
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return new AppError('auth', 'That email and password do not match.', {
      cause: error,
      code: error.code,
    });
  }
  if (message.includes('email not confirmed')) {
    return new AppError('auth', 'Please confirm your email address first.', {
      cause: error,
      code: error.code,
    });
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return new AppError('validation', 'An account with that email already exists.', {
      cause: error,
      code: error.code,
    });
  }
  // Match on `error.code`, never on the message. The substring 'otp' also
  // appears in "Signups not allowed for otp" — the response for requesting a
  // code with an unregistered email — which produced "That code has expired"
  // before any code had been requested.
  if (error.code === 'otp_disabled' || message.includes('signups not allowed for otp')) {
    return new AppError(
      'validation',
      'We could not find an account for that email. Check it, or create an account.',
      { cause: error, code: error.code },
    );
  }
  if (error.code === 'email_address_invalid') {
    return new AppError('validation', 'That email address is not one we can deliver to.', {
      cause: error,
      code: error.code,
    });
  }
  // Supabase returns `otp_expired` for BOTH a wrong code and a genuinely
  // expired one — it cannot distinguish them, so the copy must not claim to.
  if (error.code === 'otp_expired' || message.includes('expired') || message.includes('otp')) {
    return new AppError(
      'validation',
      'That code is not right, or it has expired. Check it, or request a new one.',
      { cause: error, code: error.code },
    );
  }
  if (error.status === 429 || message.includes('rate limit')) {
    return new AppError('rate_limited', 'Too many attempts. Try again in a few minutes.', {
      cause: error,
      code: error.code,
    });
  }
  if (message.includes('password') && message.includes('should be')) {
    return new AppError('validation', error.message, { cause: error, code: error.code });
  }
  if (message.includes('network') || message.includes('fetch')) {
    return new AppError('network', 'No connection. Check your network and try again.', {
      cause: error,
      code: error.code,
    });
  }

  return new AppError('auth', error.message, { cause: error, code: error.code });
}

/** Last resort for a `catch (e: unknown)` block. */
export function toAppError(value: unknown, context: string): AppError {
  if (isAppError(value)) return value;
  if (value instanceof TypeError && /network|fetch/i.test(value.message)) {
    return new AppError('network', 'No connection. Check your network and try again.', {
      cause: value,
    });
  }
  if (value instanceof Error) {
    return new AppError('unknown', `Could not ${context}. Please try again.`, { cause: value });
  }
  return new AppError('unknown', `Could not ${context}. Please try again.`, { cause: value });
}

/** Message to render. Never let a raw `unknown` reach a `<Text>`. */
export function errorMessage(value: unknown): string {
  if (isAppError(value)) return value.message;
  return 'Something went wrong. Please try again.';
}
