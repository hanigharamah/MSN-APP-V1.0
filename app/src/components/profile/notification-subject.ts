import type { Notification } from '@/types/database';
import { parseDeepLink, type DeepLinkTarget } from './deep-link';

/**
 * What a notification is actually ABOUT.
 *
 * `deep_link` alone is not that. A paid order writes
 * `deepLink('order/<orderId>')` (see `_shared/fulfilment.ts`), which has two
 * consequences, both of them bugs:
 *
 *  1. **It goes nowhere.** `order` is not in `DEEP_LINK_KINDS` and there is no
 *     order screen, so `parseDeepLink` returns null and tapping a ticket
 *     confirmation — the single most-tapped notification in the product — did
 *     nothing at all.
 *  2. **It defeats grouping.** Two orders for one event carry two different
 *     order ids, so "same destination" was never true for the exact case that
 *     most needed collapsing.
 *
 * `payload` already carries the real subject (`event_id`, `booking_id`,
 * `conversation_id`), written by the same functions. Reading that first fixes
 * both: two orders for one event resolve to the same event, so they group AND
 * they open something that exists.
 *
 * Order of preference is deliberate — the most specific thing a person would
 * expect to land on, not the most specific id available. Someone tapping
 * "your tickets are confirmed" wants the event, not an order receipt.
 */
export function notificationSubject(notification: Notification): DeepLinkTarget | null {
  const payload = notification.payload;

  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;

    const conversation = record.conversation_id;
    if (typeof conversation === 'string') return { kind: 'conversation', id: conversation };

    const booking = record.booking_id;
    if (typeof booking === 'string') return { kind: 'booking', id: booking };

    const event = record.event_id;
    if (typeof event === 'string') return { kind: 'event', id: event };

    const service = record.service_id;
    if (typeof service === 'string') return { kind: 'service', id: service };

    const provider = record.provider_id;
    if (typeof provider === 'string') return { kind: 'provider', id: provider };
  }

  // Nothing usable in the payload — fall back to the link. Still untrusted
  // input, so it goes through the same parser and unknown kinds return null.
  return parseDeepLink(notification.deep_link);
}
