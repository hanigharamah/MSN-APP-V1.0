import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Text, type BadgeTone, type ButtonVariant } from '@/components/ui';
import { spacing } from '@/theme';
import { Consequences } from './Consequences';

export interface DecisionPanelProps {
  /** The decision, not the column. "Verification", not "is_verified". */
  title: string;
  /** Where the account stands right now. "Verified" / "Not verified". */
  state: string;
  stateTone: BadgeTone;
  /** What this flag means to the marketplace. One or two sentences. */
  explanation: string;
  /** What taking the action will do. Omitted when there is nothing to warn. */
  consequences?: readonly string[];
  consequenceTone?: 'neutral' | 'caution';
  actionLabel: string;
  actionVariant?: ButtonVariant;
  /** Spells out the consequence for a screen reader before it is activated. */
  actionHint: string;
  onAction: () => void;
  loading?: boolean;
  /** Set when the action cannot apply. `disabledReason` must be set with it. */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * One decision an operator can make about an account.
 *
 * Every one of these has the same anatomy — what the flag is, where it stands,
 * what it means, what changes if you touch it, and one button — because the
 * three decisions on the account screen are genuinely parallel and rendering
 * them differently would imply a difference that is not there.
 *
 * There is deliberately no `Switch`. A toggle says "this is a preference,
 * flip it back if you like"; granting the badge the whole marketplace trusts,
 * or hiding a person's livelihood, is neither. A labelled button that names
 * the verb, behind a confirmation, is the honest control.
 */
export function DecisionPanel({
  title,
  state,
  stateTone,
  explanation,
  consequences,
  consequenceTone = 'neutral',
  actionLabel,
  actionVariant = 'secondary',
  actionHint,
  onAction,
  loading = false,
  disabled = false,
  disabledReason,
}: DecisionPanelProps) {
  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <Text variant="h4" heading={2}>
          {title}
        </Text>
        <Badge label={state} tone={stateTone} />
      </View>

      <Text variant="bodySmall" color="secondary">
        {explanation}
      </Text>

      {consequences && consequences.length > 0 ? (
        <Consequences items={consequences} tone={consequenceTone} />
      ) : null}

      <Button
        label={actionLabel}
        variant={actionVariant}
        onPress={onAction}
        loading={loading}
        disabled={disabled}
        fullWidth
        accessibilityHint={actionHint}
      />

      {disabled && disabledReason ? (
        <Text variant="caption" color="muted">
          {disabledReason}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
