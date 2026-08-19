import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { borderWidths, iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface ActionSheetOption {
  /** Stable key. Also used as the testID suffix. */
  key: string;
  label: string;
  /** One line under the label saying what it does. */
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** `danger` paints the row red. Still confirm irreversible ones with `Alert`. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title: string;
  /** Context for the choice — what the options have in common. */
  description?: string;
  options: readonly ActionSheetOption[];
  onClose: () => void;
  cancelLabel?: string;
}

/**
 * A bottom sheet for choosing between actions.
 *
 * The web app puts these choices in a centred modal; on a phone that is the
 * wrong shape — the thumb is at the bottom of the screen, and a sheet is what
 * every native user already expects. Native conventions win where the two
 * disagree (see CONVENTIONS.md §6 and DESIGN_SOURCE.md §8).
 *
 * Division of labour with `Alert`:
 *
 *   sheet  — picking between several actions ("mark completed" vs "no-show"),
 *            or collecting a reason. Dismissable by tapping away.
 *   Alert  — confirming ONE destructive action. `style: 'destructive'` gets the
 *            platform's red, and the OS owns the presentation.
 *
 * The sheet is a real `Modal`, so it captures the hardware back button on
 * Android (`onRequestClose`) and traps focus for a screen reader.
 */
export function ActionSheet({
  visible,
  title,
  description,
  options,
  onClose,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
        {/* Tapping the scrim dismisses. Labelled, or a screen reader lands on an
            unnamed full-screen button above the sheet. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint={`Dismisses ${title.toLowerCase()} without choosing`}
        />

        <Animated.View
          entering={SlideInDown.duration(220)}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            theme.shadows.modal,
            {
              backgroundColor: theme.colors.surfaceElevated,
              paddingBottom: insets.bottom + spacing.md,
              borderTopLeftRadius: radii.xxl,
              borderTopRightRadius: radii.xxl,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

          <Text variant="h4" heading={2}>
            {title}
          </Text>
          {description ? (
            <Text variant="bodySmall" color="secondary" style={styles.description}>
              {description}
            </Text>
          ) : null}

          <View style={styles.options}>
            {options.map((option) => {
              const tone = option.tone ?? 'default';
              const labelColor = option.disabled
                ? 'placeholder'
                : tone === 'danger'
                  ? 'danger'
                  : 'primary';

              return (
                <Pressable
                  key={option.key}
                  onPress={option.onPress}
                  disabled={option.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityState={{ disabled: Boolean(option.disabled) }}
                  testID={`action-sheet-${option.key}`}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderRadius: radii.lg,
                      backgroundColor: pressed
                        ? tone === 'danger'
                          ? theme.colors.dangerSubtle
                          : theme.colors.surfaceSunken
                        : theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  {option.icon ? (
                    <Ionicons
                      name={option.icon}
                      size={iconSizes.md}
                      color={
                        option.disabled
                          ? theme.colors.textPlaceholder
                          : tone === 'danger'
                            ? theme.colors.dangerText
                            : theme.colors.accentText
                      }
                    />
                  ) : null}

                  <View style={styles.optionText}>
                    <Text variant="bodyStrong" color={labelColor}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text variant="caption" color="muted">
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={({ pressed }) => [
              styles.cancel,
              {
                borderRadius: radii.lg,
                backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
              },
            ]}
          >
            <Text variant="button" color="secondary">
              {cancelLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    marginTop: spacing.xxs,
  },
  options: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: borderWidths.hairline,
  },
  optionText: {
    flex: 1,
    gap: spacing.xxs,
  },
  cancel: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
});
