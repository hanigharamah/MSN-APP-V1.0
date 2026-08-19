/**
 * Notification deep links.
 *
 * `notifications.deep_link` is written by Edge Functions as an app URL —
 * `msn://event/<id>` — matching the `scheme` in `app.config.ts` and the segment
 * names under `src/app/(modal)/`. Keeping the two in step is a real constraint:
 * a renamed route silently sends every past notification to the not-found
 * screen, because the rows are already in the database.
 *
 * Parsed rather than pushed blind, for two reasons. Typed routes need a known
 * `pathname`, so an arbitrary string is not pushable; and a link is untrusted
 * input — it should only ever be able to open a screen this app already has.
 */

export const DEEP_LINK_KINDS = [
  'event',
  'service',
  'provider',
  'booking',
  'conversation',
] as const;

export type DeepLinkKind = (typeof DEEP_LINK_KINDS)[number];

export interface DeepLinkTarget {
  kind: DeepLinkKind;
  id: string;
}

function isKind(value: string): value is DeepLinkKind {
  return (DEEP_LINK_KINDS as readonly string[]).includes(value);
}

/**
 * `'msn://event/abc'` and `'/event/abc'` both resolve to
 * `{ kind: 'event', id: 'abc' }`. Anything else — an unknown segment, an https
 * link, a malformed row — returns null, and the caller marks the notification
 * read without navigating.
 *
 * TODO(agent · notifications): there is no route for the `kind` values an
 * Edge Function might reasonably send that have no screen yet (a review
 * request, a payout). Those arrive as an unparseable link and read as inert
 * rows. Decide the full `notifications.kind` vocabulary — it is an untyped
 * `text` column today — and give each one a destination.
 */
export function parseDeepLink(link: string | null): DeepLinkTarget | null {
  if (!link) return null;

  const withoutScheme = link.replace(/^msn:\/\//i, '').replace(/^\/+/, '');
  const [kind, id] = withoutScheme.split('?')[0]?.split('/') ?? [];

  if (!kind || !id || !isKind(kind)) return null;
  return { kind, id };
}
