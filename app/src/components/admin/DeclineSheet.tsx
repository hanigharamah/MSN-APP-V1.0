import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { iconSizes, radii, SCREEN_GUTTER, spacing, touchSlop, useTheme } from '@/theme';
import { AdminNotice } from './AdminNotice';
import { DECLINE_NOTE_MAX_LENGTH, declineNoteError } from './refund-decision';

export interface DeclineSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with a validated, trimmed reason. */
  onSubmit: (reason: string) => void;
  submitting: boolean;
  /** A failed submit. Rendered in the sheet so the text is not lost. */
  error?: unknown;
  /** What is being declined — "refund request from Sam Whitfield". */
  subject: string;
  /** One sentence on what declining does. Shown above the field. */
  consequence: string;
  /**
   * Optional wording to start from — used where the answer is already known,
   * such as an Apple purchase that only the store can refund. Never
   * pre-submitted; the operator still has to read and own it.
   */
  suggestion?: string;
}

/**
 * The written reason a decline requires.
 *
 * ## Why this is a whole sheet
 *
 * Because the text goes to a person. `process-refund` refuses a decline
 * without `decision_note` (policy §4.3), and the customer is shown the note
 * **verbatim** in the push notification and in the app. That makes this box the
 * only place in the admin area where the operator is writing rather than
 * choosing, and it deserves the room, the reminder of who reads it, and a
 * minimum length that stops "no" from being a valid answer.
 *
 * ## What it is careful about
 *
 * - **The text survives a failed submit.** A network failure that cleared a
 *   paragraph someone just wrote would get the next one written in a
 *   notepad — or written shorter.
 * - **It cannot be dismissed mid-flight.** The decision is not idempotent from
 *   the client's side; letting the sheet close over an in-flight request
 *   re-arms a button against a request that may already have been settled.
 * - **Validation is on submit, not on keystroke.** A red "too short" appearing
 *   under someone's first three characters is a scold, not a hint.
 * - **The suggestion is a draft, never a default.** It is loaded into the field
 *   for editing rather than sent on the operator's behalf, because the person
 *   who signs a decision should have read it.
 */
export function DeclineSheet({
  visible,
  onClose,
  onSubmit,
  submitting,
  error,
  subject,
  consequence,
  suggestion,
}: DeclineSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // Reset on open, not on close: clearing on close would wipe the text behind
  // the closing animation, and reopening after a mis-tap should be a blank
  // sheet rather than the last person's draft.
  //
  // Adjusted during render rather than in an effect — React's documented
  // "resetting state when a prop changes" pattern. An effect would commit the
  // stale text to the screen first and then replace it, which is a visible
  // flash of the previous decline on a slow device.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason(suggestion ?? '');
      setTouched(false);
    }
  }

  const validation = declineNoteError(reason);
  const showValidation = touched && validation !== null;

  const requestClose = () => {
    if (!submitting) onClose();
  };

  const submit = () => {
    setTouched(true);
    if (validation !== null) return;
    onSubmit(reason.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={[styles.scrim, { backgroundColor: theme.colors.scrim }]}
          onPress={requestClose}
          accessibilityElementsHidden={submitting}
          importantForAccessibility={submitting ? 'no-hide-descendants' : 'auto'}
          {...(submitting
            ? {}
            : {
                accessibilityRole: 'button' as const,
                accessibilityLabel: 'Close',
                accessibilityHint: 'Dismisses the decline form without sending it',
              })}
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
            <Text variant="h3" heading={1} style={styles.headerTitle}>
              Decline this refund
            </Text>
            {submitting ? (
              <View style={styles.close} />
            ) : (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={touchSlop(iconSizes.lg)}
                style={({ pressed }) => [
                  styles.close,
                  {
                    backgroundColor: pressed
                      ? theme.colors.surfaceSunken
                      : theme.colors.surfaceMuted,
                  },
                ]}
              >
                <Ionicons name="close" size={iconSizes.lg} color={theme.colors.textSecondary} />
              </Pressable>
            )}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <AdminNotice
              tone="warning"
              title="They read this word for word"
              body={consequence}
              source="Refund policy §4.3 — a declined request must state its reason in writing"
            />

            <Input
              label={`Why you are declining the ${subject}`}
              placeholder="Explain the decision in plain words, and what they can do next."
              value={reason}
              onChangeText={setReason}
              onBlur={() => setTouched(true)}
              multiline
              numberOfLines={6}
              maxLength={DECLINE_NOTE_MAX_LENGTH}
              editable={!submitting}
              required
              textAlignVertical="top"
              inputStyle={styles.field}
              {...(showValidation && validation !== null ? { error: validation } : {})}
              hint="Write to them, not about them. They can reply in the app to escalate."
            />

            {/* `FormError` renders nothing for null/undefined, and lives
                inside the scroll view so a failed submit does not throw away
                the paragraph the operator just wrote. */}
            <FormError error={error} />
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              disabled={submitting}
              style={styles.action}
            />
            <Button
              label="Send decline"
              variant="danger"
              onPress={submit}
              loading={submitting}
              style={styles.action}
              accessibilityLabel={`Decline the ${subject}`}
              accessibilityHint="Sends your written reason to them and closes the request. No money moves."
            />
          </View>
        </View>
      </KeyboardAvoidingView>
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
    right: 0,
    bottom: 0,
    left: 0,
  },
  panel: {
    maxHeight: '90%',
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.full,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    flex: 1,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  field: {
    minHeight: 132,
    paddingTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
});
