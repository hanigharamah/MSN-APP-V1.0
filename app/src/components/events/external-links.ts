import { Linking, Platform } from 'react-native';

/**
 * Links out of the app: the venue map and the host's meeting URL.
 *
 * Two things worth being careful about here.
 *
 * **Scheme allow-listing.** `events.meeting_url` is host-supplied text. Handing
 * an arbitrary string to `Linking.openURL` lets whoever created the event pick
 * the scheme, and a phone resolves far more schemes than `https` — `tel:`,
 * `sms:`, and every installed app's custom scheme. Only `http`/`https` are
 * opened; anything else is treated as absent so the UI can say so.
 *
 * **Address privacy.** `hide_exact_address` is checked by the *caller* before
 * a map link is offered at all. Nothing in this file should be handed
 * coordinates for an event whose address is meant to stay hidden.
 */

/** True only for an `http:` or `https:` URL. Everything else is refused. */
export function isWebUrl(value: string | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/i.test(trimmed);
}

export interface VenueLocation {
  latitude: number | null;
  longitude: number | null;
  /** Human-readable address, used when there are no coordinates. */
  query: string;
}

/**
 * A maps URL for the platform's own maps app, falling back to a plain web
 * Google Maps URL that every platform can open.
 *
 * Returns null when there is nothing to point at.
 */
export function mapsUrlFor(location: VenueLocation): string | null {
  const { latitude, longitude, query } = location;
  const hasCoordinates = latitude !== null && longitude !== null;
  const label = query.trim();

  if (!hasCoordinates && label.length === 0) return null;

  const coordinates = hasCoordinates ? `${latitude},${longitude}` : '';
  const encodedLabel = encodeURIComponent(label);

  if (Platform.OS === 'ios') {
    return hasCoordinates
      ? `http://maps.apple.com/?ll=${coordinates}&q=${encodedLabel || 'Venue'}`
      : `http://maps.apple.com/?q=${encodedLabel}`;
  }

  if (Platform.OS === 'android') {
    return hasCoordinates
      ? `geo:${coordinates}?q=${coordinates}(${encodedLabel || 'Venue'})`
      : `geo:0,0?q=${encodedLabel}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${
    hasCoordinates ? coordinates : encodedLabel
  }`;
}

/** Web Google Maps, for when the native maps app is not installed. */
export function webMapsUrlFor(location: VenueLocation): string {
  const { latitude, longitude, query } = location;
  const target =
    latitude !== null && longitude !== null ? `${latitude},${longitude}` : query.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
}

/**
 * Opens a URL, falling back to a second one if the first has no handler.
 *
 * Resolves to `false` rather than throwing: a map link that will not open is a
 * small inline message, not a failed screen.
 */
export async function openExternal(url: string, fallbackUrl?: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (primaryError) {
    console.warn('[event] could not open link', url, primaryError);
    if (!fallbackUrl) return false;
    try {
      await Linking.openURL(fallbackUrl);
      return true;
    } catch (fallbackError) {
      console.warn('[event] could not open fallback link', fallbackUrl, fallbackError);
      return false;
    }
  }
}
