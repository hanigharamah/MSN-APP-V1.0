import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { iconSizes, MIN_TOUCH_TARGET, radii, SCREEN_GUTTER, spacing, touchSlop, useTheme } from '@/theme';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned below the scrolling content — the sheet's own primary action. */
  footer?: ReactNode;
  /**
   * When false, every dismissal route is inert — scrim, close button and the
   * Android back gesture.
   *
   * Only for the window in which a non-idempotent request is in flight. A
   * checkout that has already reached the server cannot be taken back by
   * dismissing the sheet, and letting the customer out re-arms the confirm
   * button over an order that already exists. Defaults to true, because a sheet
   * that cannot be closed is otherwise a trap.
   */
  dismissible?: boolean;
}

/**
 * A bottom sheet.
 *
 * CONVENTIONS and DESIGN_SOURCE §6.2 both point here: the web does everything
 * transactional in a centred Bootstrap modal, and native conventions win where
 * the two conflict. A sheet rises from the edge the thumb is already near, and
 * `presentation: 'modal'` is already taken by the route itself — this sits
 * above it.
 *
 * Dismissal has three routes, because a sheet with only one is a trap: the
 * scrim, the close button, and the hardware/gesture back that
 * `onRequestClose` covers on Android.
 *
 * `accessibilityViewIsModal` stops VoiceOver wandering back into the event
 * page underneath while the sheet is up.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const requestClose = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.scrim, { backgroundColor: theme.colors.scrim }]}
          onPress={requestClose}
          // Hidden from assistive tech while inert, so VoiceOver does not offer
          // a "Close" that does nothing.
          accessibilityElementsHidden={!dismissible}
          importantForAccessibility={dismissible ? 'auto' : 'no-hide-descendants'}
          {...(dismissible
            ? {
                accessibilityRole: 'button' as const,
                accessibilityLabel: 'Close',
                accessibilityHint: `Dismisses ${title}`,
              }
            : {})}
        />

        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            theme.shadows.modal,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />

          <View style={styles.header}>
            <Text variant="h3" heading={1} style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {dismissible ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={touchSlop(iconSizes.lg)}
                style={({ pressed }) => [
                  styles.close,
                  { backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surfaceMuted },
                ]}
              >
                <Ionicons name="close" size={iconSizes.lg} color={theme.colors.textSecondary} />
              </Pressable>
            ) : (
              // The slot is held rather than collapsed so the title does not
              // reflow the instant a request starts.
              <View style={styles.close} />
            )}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    maxHeight: '88%',
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: SCREEN_GUTTER,
    marginBottom: spacing.sm,
  },
  title: {
    flex: 1,
  },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  footer: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
});
