import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for a value that drives a query.
 *
 * The search field stays fully controlled and repaints on every keystroke —
 * anything less feels broken on a phone keyboard — while the value handed to
 * React Query only settles once typing stops. Debouncing the query key rather
 * than the input is what keeps the cache from filling with a partial entry per
 * character.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (value === settled) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, settled, delayMs]);

  return settled;
}
