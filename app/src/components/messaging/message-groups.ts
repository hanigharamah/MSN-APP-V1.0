import { TZDate } from '@date-fns/tz';
import { format, isSameDay, isThisYear, isToday, isYesterday } from 'date-fns';

import { deviceTimeZone } from '@/lib/format';
import type { MessageWithSender } from '@/lib/queries/messages';

/**
 * Day grouping for the thread.
 *
 * Messages are platform activity, so every date here is rendered in the
 * VIEWER's zone — `formatMessageTime` in `lib/format.ts` makes the same choice
 * for the clock on a bubble. A retreat happens at a place; a message happened
 * at a moment in the reader's life.
 *
 * TODO(agent · messaging): `dayHeading` belongs in `lib/format.ts` next to
 * `formatMessageTime` — it is the same class of decision and the same zone
 * rule. It lives here only because `lib/` is owned by another agent in this
 * pass. Move it and delete this file's date imports when merging.
 */

function inViewerZone(iso: string): TZDate {
  return new TZDate(new Date(iso), deviceTimeZone());
}

/** `'Today'`, `'Yesterday'`, `'Thursday 4 September'`, `'4 September 2025'`. */
export function dayHeading(iso: string): string {
  const date = inViewerZone(iso);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'EEEE d MMMM');
  return format(date, 'd MMMM yyyy');
}

function isSameViewerDay(a: string, b: string): boolean {
  return isSameDay(inViewerZone(a), inViewerZone(b));
}

/**
 * What a row needs to know about its neighbours.
 *
 * The list is INVERTED, so `data` runs newest-first and the message *before*
 * item `i` in time is `data[i + 1]`. Both flags are computed against that
 * neighbour, and both are true for the oldest loaded message because there is
 * nothing above it to compare with.
 *
 * `inverted` flips the container and each cell, so inside a row ordinary
 * top-to-bottom layout still applies — a separator rendered above its bubble
 * appears above it on screen.
 */
export interface RowContext {
  /** First message of its day: render a day separator above it. */
  startsDay: boolean;
  /** First of a run by the same sender: render the sender's name above it. */
  startsRun: boolean;
}

export function rowContext(messages: readonly MessageWithSender[], index: number): RowContext {
  const message = messages[index];
  const earlier = messages[index + 1];

  if (!message) return { startsDay: false, startsRun: false };
  if (!earlier) return { startsDay: true, startsRun: true };

  return {
    startsDay: !isSameViewerDay(message.created_at, earlier.created_at),
    startsRun: message.sender_id !== earlier.sender_id,
  };
}
