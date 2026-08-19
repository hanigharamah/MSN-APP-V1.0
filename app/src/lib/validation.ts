/**
 * Form validation.
 *
 * Every validator returns `string | null` — the message, or null when valid.
 * That shape drops straight into `<Input error={...} />` and into a
 * `Record<string, string>` of field errors.
 *
 * Client validation is a courtesy, never a guarantee. The real rules live in
 * the database's check constraints and in Supabase Auth; these exist so the
 * user hears about a problem before a round trip, not so the server can trust
 * the input.
 */

/**
 * Deliberately permissive. Strict email regexes reject valid addresses
 * (apostrophes, new TLDs, plus-addressing edge cases) and the only real
 * confirmation is the code we send anyway.
 */
export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'That does not look like an email address.';
  return null;
}

/**
 * Matches Supabase's default minimum of 8. If the project raises it in the
 * dashboard, raise it here too — otherwise the server rejects a password this
 * accepted and the user gets the vaguer message.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(value: string): string | null {
  if (value.length === 0) return 'Enter a password.';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) return 'Re-enter your password.';
  if (password !== confirmation) return 'Those passwords do not match.';
  return null;
}

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter your name.';
  if (trimmed.length < 2) return 'That name is too short.';
  if (trimmed.length > 80) return 'That name is too long.';
  return null;
}

/** Supabase email OTPs are 6 digits. */
export const OTP_LENGTH = 6;

export function validateOtp(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter the code we sent you.';
  if (!/^\d+$/.test(trimmed)) return 'The code is 6 digits.';
  if (trimmed.length !== OTP_LENGTH) return `The code is ${OTP_LENGTH} digits.`;
  return null;
}

/** `profiles.handle` is a unique citext. Keep it URL-safe. */
export function validateHandle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null; // optional
  if (trimmed.length < 3) return 'Handles are at least 3 characters.';
  if (trimmed.length > 30) return 'Handles are at most 30 characters.';
  if (!/^[a-z0-9._-]+$/i.test(trimmed)) {
    return 'Use letters, numbers, dots, dashes and underscores only.';
  }
  return null;
}

/** True when every value in a field-error map is null. */
export function isValid(errors: Record<string, string | null>): boolean {
  return Object.values(errors).every((error) => error === null);
}

/** Strips the nulls, leaving only fields that actually failed. */
export function compactErrors(errors: Record<string, string | null>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(errors)) {
    if (message !== null) result[field] = message;
  }
  return result;
}
