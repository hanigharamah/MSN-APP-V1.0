import type { DeliveryMode } from '@/types/database';

/**
 * Enum-to-label mappings for the provider and booking screens.
 *
 * The same rule as `Badge.tsx`'s status mappers: a database enum becomes a
 * human string in exactly one place, so `online_live` never reads "Online" on
 * the profile and "Live online" on the service screen.
 */

export function deliveryModeLabel(mode: DeliveryMode): string {
  switch (mode) {
    case 'in_person':
      return 'In person';
    case 'online_live':
      return 'Online, live';
    case 'one_to_one':
      return 'One to one';
  }
}

/** Ionicons glyph that matches the delivery mode. */
export function deliveryModeIcon(mode: DeliveryMode): 'location-outline' | 'videocam-outline' | 'person-outline' {
  switch (mode) {
    case 'in_person':
      return 'location-outline';
    case 'online_live':
      return 'videocam-outline';
    case 'one_to_one':
      return 'person-outline';
  }
}

/** `'London, England'` from the parts a public profile is allowed to show. */
export function locationLabel(parts: {
  city: string | null;
  region: string | null;
  country_code: string | null;
}): string | null {
  const pieces = [parts.city, parts.region, parts.country_code].filter(
    (piece): piece is string => typeof piece === 'string' && piece.trim().length > 0,
  );
  return pieces.length === 0 ? null : pieces.join(', ');
}
