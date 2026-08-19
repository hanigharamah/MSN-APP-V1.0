import { Ionicons } from '@expo/vector-icons';
import { createURL } from 'expo-linking';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatEventTime } from '@/lib/format';
import type { EventWithHost } from '@/lib/queries/events';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface EventActionsProps {
  event: EventWithHost;
  /**
   * Whether the viewer has saved this event.
   *
   * Optional because the data layer for it does not exist yet — see the TODO
   * on `EventActions`. When `onToggleSave` is omitted the control explains
   * itself instead of pretending to work.
   */
  isSaved?: boolean;
  onToggleSave?: () => void;
  savePending?: boolean;
}

/**
 * Save and share.
 *
 * TODO(agent · events): saving is not wired, because `src/lib/queries/` has no
 * `saved_items` functions and screens may not call `supabase.from(...)`
 * themselves (CONVENTIONS §5). What is missing, precisely:
 *
 *   - `saveEvent(profileId, eventId)` / `unsaveEvent(profileId, eventId)` /
 *     `isEventSaved(profileId, eventId)` / `listSavedEvents(profileId)` in a
 *     new `lib/queries/saved.ts`. The table is `saved_items`, with nullable
 *     `event_id` / `service_id` / `provider_id` — one row saves one kind of
 *     thing.
 *   - A double-save trips the unique index and surfaces as SQLSTATE 23505,
 *     which `fromPostgrestError` already maps to "That already exists." Treat
 *     it as success rather than an error, or a double tap looks like a bug.
 *   - Keys already exist: `qk.saved.all` / `qk.saved.list`.
 *
 * Once those land, pass `isSaved` and `onToggleSave` from the screen and the
 * button below works with no other change. Until then it says so rather than
 * toggling a heart that forgets itself on the next render — a save that does
 * not persist is worse than no save button.
 */
export function EventActions({ event, isSaved, onToggleSave, savePending = false }: EventActionsProps) {
  const [shareFailed, setShareFailed] = useState(false);
  const [saveUnavailable, setSaveUnavailable] = useState(false);

  const handleShare = () => {
    setShareFailed(false);
    const link = createURL(`/event/${event.id}`);
    const when = formatEventTime(event.starts_at, event.timezone);
    const message = `${event.title} — ${when}\n${link}`;

    Share.share({ message, title: event.title }).catch((error: unknown) => {
      console.warn('[event] share failed', error);
      setShareFailed(true);
    });
  };

  const handleSave = () => {
    if (onToggleSave) {
      onToggleSave();
      return;
    }
    setSaveUnavailable(true);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <ActionButton
          icon={isSaved ? 'heart' : 'heart-outline'}
          label={isSaved ? 'Saved' : 'Save'}
          accessibilityLabel={isSaved ? `Remove ${event.title} from saved` : `Save ${event.title}`}
          active={isSaved === true}
          disabled={savePending}
          onPress={handleSave}
        />
        <ActionButton
          icon="share-outline"
          label="Share"
          accessibilityLabel={`Share ${event.title}`}
          onPress={handleShare}
        />
      </View>

      {saveUnavailable ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          Saving events is not available yet.
        </Text>
      ) : null}

      {shareFailed ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          We could not open the share sheet.
        </Text>
      ) : null}
    </View>
  );
}

interface ActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function ActionButton({
  icon,
  label,
  accessibilityLabel,
  active = false,
  disabled = false,
  onPress,
}: ActionButtonProps) {
  const theme = useTheme();

  const tint = disabled
    ? theme.colors.disabledText
    : active
      ? theme.colors.accent
      : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.action,
        {
          borderColor: active ? theme.colors.accent : theme.colors.border,
          borderWidth: theme.borderWidths.hairline,
          backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        },
      ]}
    >
      <Ionicons name={icon} size={iconSizes.md} color={tint} />
      <Text variant="label" color={active ? 'accent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
  },
});
