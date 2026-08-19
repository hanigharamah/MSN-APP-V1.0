import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';
import type { ChoiceOption } from './ChoiceField';

export interface PickerFieldProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Adds a tile that clears the selection. For optional choices. */
  onClear?: () => void;
  clearLabel?: string;
  /** The row's text when nothing is chosen. */
  placeholder?: string;
}

/**
 * Single-select, as a row that opens a card of choices.
 *
 * ## Why this exists alongside `ChoiceField`
 *
 * They are the same control at different scales, and the scale is the whole
 * argument. `ChoiceField` lays every option out as chips, which is one tap and
 * no hidden state — right for three delivery modes. Categories grew to
 * twenty-five, and twenty-five chips is roughly eight screen-heights of the
 * event form given over to a field most people set once. The form stopped being
 * readable: everything after Category was below the fold, and scrolling past a
 * wall of similar-looking pills to reach "Where and how" is worse than one tap.
 *
 * So: options above roughly a dozen belong here, below it in `ChoiceField`.
 *
 * ## Grid, not a list
 *
 * Two columns rather than rows. Category names are short and mostly unrelated
 * to each other, so there is no order to read down — a grid puts twice as many
 * in view and lets the eye scan for a known word instead of reading a list.
 *
 * ## Choosing closes it
 *
 * No Done button on the way out. This is single-select with nothing to confirm,
 * and a second tap to dismiss a decision already made is the step people forget
 * — leaving the sheet open over a form they thought they had finished.
 */
export function PickerField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  onClear,
  clearLabel = 'Any',
  placeholder,
}: PickerFieldProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  // An unset optional field says what clearing it is called ("None"), so the
  // row and the card agree about the same state.
  const empty = placeholder ?? (onClear ? clearLabel : `Choose ${label.toLowerCase()}`);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  const clear = () => {
    onClear?.();
    setOpen(false);
  };

  return (
    <View>
      <Text variant="bodySmall" color="secondary" style={styles.label}>
        {label}
        {required ? (
          <Text variant="bodySmall" color="danger">
            {' *'}
          </Text>
        ) : null}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.borderStrong,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${selected ? selected.label : empty}`}
        accessibilityHint={`Opens the ${label.toLowerCase()} chooser`}
      >
        <Text
          variant="body"
          numberOfLines={1}
          style={{ flex: 1, color: selected ? theme.colors.textPrimary : theme.colors.textPlaceholder }}
        >
          {selected ? selected.label : empty}
        </Text>
        {/* Says "this opens something" without needing an icon set. */}
        <Text variant="body" style={{ color: theme.colors.textMuted }}>
          ›
        </Text>
      </Pressable>

      {error ? (
        <Text variant="caption" color="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.scrim, { backgroundColor: theme.colors.overlay }]}>
          {/* Tapping the dimmed area closes without choosing, as every iOS
              sheet does. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />

          <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}>
            <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="h4">{label}</Text>
                {hint ? (
                  <Text variant="bodySmall" color="muted">
                    {hint}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={14}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <View style={[styles.closeButton, { backgroundColor: theme.colors.surfaceSunken }]}>
                  <Text variant="body" color="muted">
                    ✕
                  </Text>
                </View>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              accessibilityRole="radiogroup"
              accessibilityLabel={label}
            >
              {onClear ? (
                <Tile label={clearLabel} selected={value === null} onPress={clear} />
              ) : null}

              {options.map((option) => (
                <Tile
                  key={option.value}
                  label={option.label}
                  selected={option.value === value}
                  onPress={() => choose(option.value)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Tile({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: selected
            ? theme.colors.accentSubtle
            : pressed
              ? theme.colors.surfaceSunken
              : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text
        variant={selected ? 'bodyStrong' : 'body'}
        numberOfLines={2}
        style={{ flex: 1, color: selected ? theme.colors.accentText : theme.colors.textPrimary }}
      >
        {label}
      </Text>
      {/* The tint alone carries the state for most people; the tick is what
          makes it survive a colourblind reading. */}
      {selected ? (
        <Text variant="bodyStrong" style={{ color: theme.colors.accentText }}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xxs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  helper: { marginTop: spacing.xxs },

  scrim: { flex: 1, justifyContent: 'center', padding: spacing.sm },
  card: {
    borderRadius: radii.xl,
    padding: spacing.md,
    maxHeight: '78%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerText: { flex: 1, gap: spacing.xxs },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  // Two across, allowing for the gap between them. 64 is two lines of body text
  // plus padding, so a long name like "Health & Wellness Coaching" wraps inside
  // a tile the same height as "Yoga" and the rows stay level.
  tile: {
    width: '48%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.lg,
  },
});
