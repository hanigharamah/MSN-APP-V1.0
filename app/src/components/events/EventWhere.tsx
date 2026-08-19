import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import type { EventRow } from '@/types/database';
import { iconSizes, spacing, useTheme } from '@/theme';
import { isWebUrl, mapsUrlFor, openExternal, webMapsUrlFor, type VenueLocation } from './external-links';

export interface EventWhereProps {
  event: EventRow;
}

/**
 * Where the event happens — venue with a map link, or "Online event".
 *
 * Two privacy flags decide how much is shown, and both default to protecting
 * the host rather than the layout:
 *
 *   - `hide_exact_address` — city and region only, no street and NO map link.
 *     Dropping a pin on the exact coordinates while withholding the street
 *     address would leak precisely what the flag exists to withhold.
 *   - `hide_meeting_url` — the joining link is issued with the ticket, so it
 *     is never rendered on a public detail page.
 *
 * Both are described to the reader rather than silently omitted; "the address
 * is shared with your ticket" is information, a blank space is a bug report.
 */
export function EventWhere({ event }: EventWhereProps) {
  const theme = useTheme();
  const [linkFailed, setLinkFailed] = useState(false);

  const isOnline = event.delivery_mode !== 'in_person';

  if (isOnline) {
    const rawMeetingUrl = event.hide_meeting_url ? null : event.meeting_url;
    const meetingUrl = isWebUrl(rawMeetingUrl) ? rawMeetingUrl : null;

    return (
      <View style={styles.block}>
        <View style={styles.row} accessible accessibilityLabel="Online event">
          <Ionicons
            name="videocam-outline"
            size={iconSizes.md}
            color={theme.colors.textMuted}
            style={styles.icon}
          />
          <View style={styles.text}>
            <Text variant="bodyStrong">Online event</Text>
            <Text variant="bodySmall" color="muted">
              {meetingUrl
                ? 'Join from anywhere using the link below.'
                : 'The joining link is sent with your ticket.'}
            </Text>
          </View>
        </View>

        {meetingUrl ? (
          <Button
            label="Open meeting link"
            variant="secondary"
            size="sm"
            accessibilityLabel={`Open the meeting link for ${event.title}`}
            accessibilityHint="Leaves the app and opens the host's meeting provider"
            icon={
              <Ionicons name="open-outline" size={iconSizes.xs} color={theme.colors.accentText} />
            }
            onPress={() => {
              setLinkFailed(false);
              void openExternal(meetingUrl).then((opened) => setLinkFailed(!opened));
            }}
          />
        ) : null}

        {linkFailed ? <LinkFailureNote /> : null}
      </View>
    );
  }

  const cityLine = [event.city, event.region, event.postal_code]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  const detailLines = event.hide_exact_address
    ? [event.venue_name, cityLine, event.country_code]
    : [
        event.venue_name,
        event.address_line1,
        event.address_line2,
        cityLine,
        event.country_code,
      ];

  const lines = detailLines.filter((line): line is string => Boolean(line));

  const location: VenueLocation = {
    latitude: event.hide_exact_address ? null : event.latitude,
    longitude: event.hide_exact_address ? null : event.longitude,
    query: [event.venue_name, ...lines].filter((part): part is string => Boolean(part)).join(', '),
  };

  const mapsUrl = event.hide_exact_address ? null : mapsUrlFor(location);

  return (
    <View style={styles.block}>
      <View
        style={styles.row}
        accessible
        accessibilityLabel={lines.length > 0 ? lines.join(', ') : 'Venue to be announced'}
      >
        <Ionicons
          name="location-outline"
          size={iconSizes.md}
          color={theme.colors.textMuted}
          style={styles.icon}
        />
        <View style={styles.text}>
          {lines.length > 0 ? (
            lines.map((line, index) => (
              <Text key={line} variant={index === 0 ? 'bodyStrong' : 'bodySmall'} color={index === 0 ? 'primary' : 'secondary'}>
                {line}
              </Text>
            ))
          ) : (
            <Text variant="bodyStrong">Venue to be announced</Text>
          )}
          {event.hide_exact_address ? (
            <Text variant="bodySmall" color="muted" style={styles.privacyNote}>
              The exact address is shared with your ticket.
            </Text>
          ) : null}
        </View>
      </View>

      {mapsUrl ? (
        <Button
          label="Open in Maps"
          variant="secondary"
          size="sm"
          accessibilityLabel={`Open the venue for ${event.title} in Maps`}
          accessibilityHint="Leaves the app and opens your maps application"
          icon={<Ionicons name="map-outline" size={iconSizes.xs} color={theme.colors.accentText} />}
          onPress={() => {
            setLinkFailed(false);
            void openExternal(mapsUrl, webMapsUrlFor(location)).then((opened) =>
              setLinkFailed(!opened),
            );
          }}
        />
      ) : null}

      {linkFailed ? <LinkFailureNote /> : null}
    </View>
  );
}

function LinkFailureNote() {
  return (
    <Text variant="bodySmall" color="danger" accessibilityLiveRegion="polite">
      We could not open that link on this device.
    </Text>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignSelf: 'stretch',
  },
  icon: {
    marginTop: 3,
  },
  text: {
    flex: 1,
  },
  privacyNote: {
    marginTop: spacing.xxs,
  },
});
