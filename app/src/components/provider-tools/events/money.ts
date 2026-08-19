/**
 * Money entry.
 *
 * `lib/format` turns integer cents into a string for display. This is the
 * other direction, which a host tool needs and a buyer tool does not: the text
 * a host types in a price field, back into the integer the column stores.
 *
 * TODO(agent · events): belongs beside `formatMoney` in `src/lib/format.ts`
 * once that file is open for edits.
 *
 * Nothing here uses floating-point arithmetic on money. `45.10` is not
 * representable in binary floating point, and `Math.round(45.10 * 100)` is one
 * of the two classic ways to be a cent out. The digits are read as integers
 * and combined as integers.
 */

/** Three-letter ISO 4217, which is what `char(3)` columns hold. */
export function normaliseCurrency(input: string): string {
  return input.trim().toUpperCase();
}

export function validateCurrency(input: string): string | null {
  const code = normaliseCurrency(input);
  if (code.length === 0) return 'Enter a currency code.';
  if (!/^[A-Z]{3}$/.test(code)) return 'Use a 3-letter code, like USD, GBP or EUR.';
  return null;
}

/**
 * `'45'` -> 4500, `'45.5'` -> 4550, `'45.50'` -> 4550, `'0'` -> 0.
 *
 * Returns null for anything else, including an empty string, a negative
 * number (`price_cents >= 0` is a check constraint) and more than two decimal
 * places, which would otherwise be silently truncated into a different price.
 *
 * Both `.` and `,` are accepted as the decimal separator — half the world
 * types `45,50` — but only one of them, and only with one or two digits after
 * it, so `1,234` cannot be read as either 1234 or 1.234 by accident.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '');
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;

  const [whole = '0', fraction = ''] = cleaned.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Integer cents back into an editable field value: `4550` -> `'45.50'`.
 *
 * Integer division and a remainder, not `cents / 100` — this is the value a
 * form round-trips through `parseAmountToCents`, and it must survive that trip
 * unchanged. Display still goes through `formatMoney`, which is the only place
 * a currency symbol is ever attached.
 */
export function centsToAmountInput(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents));
  return `${Math.trunc(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

/**
 * `'12'` -> 12 for a whole-number field (capacity, quantity, age).
 *
 * Returns null on anything that is not a run of digits, so `'1e3'`, `'12.5'`
 * and `'-1'` are all rejected at the field rather than by a check constraint.
 */
export function parseWholeNumber(input: string): number | null {
  const cleaned = input.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}
