/**
 * =============================================================================
 * Data access
 * =============================================================================
 *
 * Every Supabase call in the app goes through this folder. Screens import
 * these functions and pass them to React Query; screens never touch
 * `supabase.from(...)` directly.
 *
 * Three rules that make that worth doing:
 *
 * 1. **Functions throw, they do not return `{ data, error }`.** The
 *    `{ data, error }` shape stops at `unwrap()` in `client.ts`. Above it,
 *    failure is a rejected promise and an `AppError`, which is the only thing
 *    React Query's `isError` branch understands.
 * 2. **Query keys come from `keys.ts`.** Never hand-write one — prefix
 *    invalidation is what keeps the cache honest, and it only works if every
 *    key is built the same way.
 * 3. **Some things are deliberately unimplemented.** Checkout, booking
 *    creation, availability and proximity search all throw
 *    `NotImplementedError` with a comment explaining what needs to exist
 *    server-side first. They are not stubs waiting for a client implementation
 *    — doing them on the client would be a correctness bug (oversold tickets,
 *    double bookings, client-supplied prices). Read the comment before
 *    "finishing" one.
 */

export * from './client';
export * from './keys';

export * as bookingQueries from './bookings';
export * as eventQueries from './events';
export * as messageQueries from './messages';
export * as notificationQueries from './notifications';
export * as orderQueries from './orders';
export * as profileQueries from './profiles';
export * as serviceQueries from './services';
