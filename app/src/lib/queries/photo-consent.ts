import { supabase } from '@/lib/supabase';
import { unwrap } from './client';

/**
 * Photo consent — the question the app owes a seeker after they book.
 *
 * ## Why this is asked at all
 *
 * Practitioners photograph their sessions, and a photograph of an identifiable
 * person is their personal data. Asking once, at booking, is both the lawful
 * basis and the kinder version: being asked in advance, in private, is very
 * different from being asked in a room with a camera already out and fourteen
 * people waiting.
 *
 * ## Three states
 *
 * `photo_consent` is a nullable boolean and the null genuinely matters. It
 * means "has not answered", which is not "no" and definitely not "yes". The
 * practitioner's list shows all three distinctly for exactly this reason.
 */

export interface PendingPhotoConsent {
  /** Ticket id. Only used as a React key — the answer is written per event. */
  id: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
    timezone: string;
    cover_url: string | null;
    host: { display_name: string } | null;
  };
}

/**
 * Everything this person still owes an answer on.
 *
 * Filtered to sessions that have not finished: chasing consent for a photograph
 * of an event that ended last month is noise, and any photographs taken there
 * were governed by the answer at the time (which was "not given").
 *
 * `!inner` so the event filter applies to the ticket rows rather than merely
 * nulling the embed.
 */
export async function listPendingPhotoConsent(
  holderId: string,
): Promise<PendingPhotoConsent[]> {
  const rows = await unwrap(
    supabase
      .from('tickets')
      .select(
        'id, event:events!inner(id, title, starts_at, timezone, cover_url, host:profiles!events_host_id_fkey(display_name))',
      )
      .eq('holder_id', holderId)
      .eq('is_void', false)
      .is('photo_consent', null)
      .gt('events.ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true, referencedTable: 'events' })
      .returns<PendingPhotoConsent[]>(),
    'check your photo permissions',
  );

  // One card per event, not per ticket. Someone who bought two seats for the
  // same session was being asked the identical question twice in a row, which
  // reads as a broken app rather than a second question — found in UAT.
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.event.id)) return false;
    seen.add(row.event.id);
    return true;
  });
}

/**
 * Record an answer, or change one — for every ticket this person holds for the
 * event, because consent is about appearing in photographs at a session, not
 * about a seat.
 *
 * Goes through a database function rather than a direct update: holders have no
 * UPDATE policy on `tickets`, and granting one would also let them write
 * `checked_in_at` — marking themselves present at a session they never
 * attended. The function can only touch the two consent columns.
 *
 * Callable again with the opposite answer, any number of times. Withdrawal has
 * to be as easy as granting, so there is deliberately no "already answered"
 * guard here.
 */
export async function setPhotoConsent(eventId: string, consent: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_event_photo_consent', {
    p_event: eventId,
    p_consent: consent,
  });
  if (error) throw error;
}
