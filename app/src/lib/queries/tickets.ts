import { supabase } from '@/lib/supabase';
import { unwrap } from './client';

/**
 * Tickets, and the door.
 *
 * Everything a ticket needs already existed in the schema from 0004 — a unique
 * `code`, `checked_in_at`, `checked_in_by`, `is_void`. Only the two ends were
 * missing: something to show the code, and something to read it.
 */

/**
 * What the door is told.
 *
 * Five outcomes, and only `ok` writes anything. They are distinct because they
 * mean different things to the person standing in front of you: `already_used`
 * is usually the host scanning twice, `wrong_event` is someone at the wrong
 * door, `void` is a refund, `not_found` is not a ticket at all. Collapsing any
 * of them into "failed" throws away the only information that resolves the
 * situation.
 */
export type CheckInStatus = 'ok' | 'already_used' | 'wrong_event' | 'void' | 'not_found';

export interface CheckInResult {
  status: CheckInStatus;
  ticket_id: string | null;
  attendee_name: string | null;
  checked_in_at: string | null;
}

/**
 * Mark a ticket used, from its printed CODE.
 *
 * Distinct from `checkInTicket` in `orders.ts`, which takes a ticket id and is
 * how a host checks someone in by tapping their name on the guest list. This
 * one is the door: the host has a code and no idea which ticket it belongs to,
 * or whether it belongs to this event at all.
 *
 * Goes through `check_in_ticket` (migration 0025) rather than updating the row
 * directly. The host's UPDATE policy on `tickets` permits writing any column —
 * fine for a trusted dashboard, far too broad for something a camera drives —
 * and a bare UPDATE that matches nothing cannot say WHY.
 *
 * The function returns a single row; PostgREST gives it as an array.
 */
export async function scanTicket(code: string, eventId: string): Promise<CheckInResult> {
  const rows = await unwrap(
    supabase
      .rpc('check_in_ticket', { p_code: code, p_event: eventId })
      .returns<CheckInResult[]>(),
    'check that ticket in',
  );

  return (
    rows[0] ?? {
      // Defensive: the function always returns a row, but an empty result must
      // not be read as a successful check-in.
      status: 'not_found',
      ticket_id: null,
      attendee_name: null,
      checked_in_at: null,
    }
  );
}
