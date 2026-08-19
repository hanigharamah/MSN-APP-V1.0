import type { PostgrestError } from '@supabase/supabase-js';

import { AppError, fromPostgrestError } from '@/lib/errors';

/**
 * Internal plumbing for the query layer. Not exported from `queries/index.ts` —
 * screens should never see a `PostgrestError`.
 */

export interface PostgrestLike<T> {
  data: T | null;
  error: PostgrestError | null;
}

/**
 * Runs a Supabase query builder and either returns its data or throws an
 * `AppError`. This is the boundary: `{ data, error }` exists below it and
 * never above it.
 *
 *   const events = await unwrap(
 *     supabase.from('events').select('*').eq('status', 'published'),
 *     'load events',
 *   );
 *
 * `context` completes the sentence "Could not ___." in the fallback message,
 * so write it as a lowercase verb phrase.
 */
export async function unwrap<T>(
  builder: PromiseLike<PostgrestLike<T>>,
  context: string,
): Promise<NonNullable<T>> {
  const { data, error } = await builder;
  if (error) throw fromPostgrestError(error, context);
  if (data === null || data === undefined) {
    // `.single()` on zero rows. PostgREST usually reports this as PGRST116,
    // but a `head: true` or a filtered-away embed can produce a null body with
    // no error, and a null slipping into a screen is worse than a throw.
    throw new AppError('not_found', 'We could not find that.', { code: 'PGRST116' });
  }
  // NonNullable in the signature so callers do not have to re-narrow: the
  // builder's data type already includes null, which would otherwise infect T.
  return data as NonNullable<T>;
}

/**
 * Same, but a missing row is a legitimate answer rather than an error.
 * Pair it with `.maybeSingle()`.
 */
export async function unwrapMaybe<T>(
  builder: PromiseLike<PostgrestLike<T>>,
  context: string,
): Promise<T | null> {
  const { data, error } = await builder;
  if (error) throw fromPostgrestError(error, context);
  return data;
}

/** Standard page size for infinite lists. */
export const PAGE_SIZE = 20;

/** Converts a zero-based page number into a PostgREST inclusive range. */
export function rangeFor(page: number, pageSize: number = PAGE_SIZE): [number, number] {
  const from = page * pageSize;
  return [from, from + pageSize - 1];
}

/**
 * `nextPageParam` for `useInfiniteQuery`: `undefined` stops the list.
 * A short final page means there is nothing after it.
 */
export function nextPage<T>(lastPage: T[], allPages: T[][], pageSize: number = PAGE_SIZE) {
  return lastPage.length < pageSize ? undefined : allPages.length;
}

/**
 * Makes a user-typed string safe inside a PostgREST `or=(...)` ilike filter.
 *
 * Two separate hazards, both confirmed against the live project:
 *
 *  1. **The logic-tree parser.** `or=(a.ilike.%term%,b.ilike.%term%)` is parsed
 *     by PostgREST itself, so a comma in `term` starts a new condition and the
 *     request fails with `PGRST100 failed to parse logic tree` — HTTP 400.
 *     Searching `yoga, london` is an ordinary thing to type. Parentheses,
 *     double quotes and dots break it the same way.
 *  2. **LIKE wildcards.** `%` and `_` are wildcards in the pattern, so
 *     searching `%` matched every row.
 *
 * Wildcards are escaped so they match literally; parser metacharacters are
 * dropped, because there is no escape for them inside `or=()` — PostgREST
 * tokenises before the value ever reaches Postgres.
 */
export function escapeForOrIlike(input: string): string {
  return input
    .trim()
    // Backslash first, or it would double-escape the ones added below.
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, (ch) => `\\${ch}`)
    .replace(/[,()"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
