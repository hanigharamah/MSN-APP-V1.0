import type { Notification } from '@/types/database';
import { notificationSubject } from './notification-subject';

/**
 * Collapse notifications that are the same news told twice.
 *
 * Buying two lots of tickets to one event writes one row per order, so the list
 * read:
 *
 *   Your tickets are confirmed — Winter Solstice Gong Bath. Order EDA6508E6E.
 *   Your tickets are confirmed — Winter Solstice Gong Bath. Order 0386AC9AB5.
 *
 * Two rows, identical but for a reference nobody recognises. That is the data
 * model showing through: the system has two orders, but the person has one
 * piece of news. Read quickly it looks like an error — *did I buy twice?* —
 * and the reference is the only thing distinguishing them, which is the one
 * detail a person cannot check without opening both.
 *
 * So group by what the notification is ABOUT, not by which row wrote it:
 * same kind, same destination, same headline. The newest survives and carries
 * the count.
 *
 * Grouped on the SUBJECT rather than `deep_link` — see `notificationSubject`.
 * A paid order links to `order/<id>`, so two orders for one event carry two
 * different links and would never have grouped, which is the exact case this
 * exists for. The payload names the event; that is what they have in common.
 *
 * What is deliberately NOT grouped:
 *   - Rows with no resolvable subject. Nothing proves two of those concern the
 *     same thing, and wrongly merging two unrelated messages hides one
 *     entirely.
 *   - Rows with different titles. "Confirmed" and "Cancelled" for one event are
 *     two distinct facts, and the second must never hide behind the first.
 *
 * Unread wins: if any row in a group is unread the group reads unread, because
 * a group that looked read would bury news the person has not seen.
 */
export interface NotificationGroup {
  /** The most recent notification in the group — what the row renders. */
  notification: Notification;
  /** How many rows collapsed into it. 1 means nothing was collapsed. */
  count: number;
  /** Every id in the group, so marking the row read marks all of them. */
  ids: string[];
  /** True when ANY row in the group is unread. */
  unread: boolean;
}

export function groupNotifications(
  notifications: readonly Notification[],
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const byKey = new Map<string, NotificationGroup>();

  for (const notification of notifications) {
    // No resolvable subject means nothing reliable to group on — keep it
    // separate rather than risk hiding one message behind another.
    const subject = notificationSubject(notification);
    const key = subject
      ? `${notification.kind} ${subject.kind}:${subject.id} ${notification.title}`
      : null;

    const existing = key === null ? undefined : byKey.get(key);

    if (existing) {
      existing.count += 1;
      existing.ids.push(notification.id);
      existing.unread ||= notification.read_at === null;
      continue;
    }

    // The caller passes newest-first, so the first row seen for a key is the
    // one to show. Relying on that beats re-sorting timestamps here.
    const group: NotificationGroup = {
      notification,
      count: 1,
      ids: [notification.id],
      unread: notification.read_at === null,
    };
    groups.push(group);
    if (key !== null) byKey.set(key, group);
  }

  return groups;
}
