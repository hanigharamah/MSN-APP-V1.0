import { useEffect, useState } from 'react';

/** How often the clock ticks. Every label on this screen is minute-resolution. */
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * The current time, as state.
 *
 * Sale windows, event end times and past occurrences are all compared against
 * "now" while this screen renders, and `Date.now()` read during render is two
 * separate problems:
 *
 *   1. It is impure. React may render a component more than once for one
 *      commit and get a different answer each time; the React Compiler's
 *      `react-hooks/purity` rule rejects it outright, and the compiler is on
 *      for this app (`app.config.ts` -> `experiments.reactCompiler`).
 *   2. A value captured once at mount goes stale. Someone sitting on a detail
 *      page while `sales_start_at` passes should see the stepper appear, not
 *      keep reading "Sales open today" until they pull to refresh.
 *
 * One clock per screen, threaded down as a prop, so the bottom bar and the
 * ticket rows can never disagree about whether sales have opened.
 *
 * `useState(Date.now)` passes the function rather than calling it — the lazy
 * initialiser runs inside React, not in render scope.
 */
export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): number {
  const [now, setNow] = useState<number>(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
