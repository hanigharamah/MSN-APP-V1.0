import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Avatar, Card, Text } from '@/components/ui';
import { iconSizes, spacing, useTheme } from '@/theme';
import { waitingFor, type QueueItem, type QueueItemKind } from './queue-model';
import { WaitingPill } from './WaitingPill';

export interface QueueRowProps {
  item: QueueItem;
  onPress: () => void;
  /** Shared clock, so every row in one render agrees on "now". */
  now?: Date;
}

const KIND_ICON: Record<QueueItemKind, keyof typeof Ionicons.glyphMap> = {
  refund: 'cash-outline',
  report: 'flag-outline',
  verification: 'shield-checkmark-outline',
};

/**
 * One thing that needs a decision.
 *
 * ## What is on it, and why only this
 *
 * Four facts: what kind of decision, what it is about, who is waiting, and how
 * long. That is the set an operator needs to choose what to open, and adding a
 * fifth costs more than the fifth is worth — a row you have to read twice is a
 * row that gets skipped on a phone.
 *
 * Notably absent: ids, timestamps, statuses, counts. A reference code means
 * nothing until you are already inside the decision, and every one of those
 * fields is a database column that got onto the screen because it existed
 * rather than because someone needed it.
 *
 * ## One tap target, one announcement
 *
 * The whole card is a single button and a single accessibility node. A screen
 * reader user hears "Refund request. Winter Solstice Gong Bath. Demo Seeker.
 * Overdue, waiting 7 days. £61.60. Button." — one sentence describing one
 * decision — rather than stopping on an avatar, three text fragments and a
 * pill. The composed label is assembled here so the ordering matches the
 * reading order of the visual layout.
 */
export function QueueRow({ item, onPress, now }: QueueRowProps) {
  const theme = useTheme();

  const label = [
    item.kindLabel,
    item.title,
    item.personName,
    `waiting ${waitingFor(item.waitingSince, now)}`,
    item.urgency === 'overdue' ? 'overdue' : null,
    item.context,
    item.note,
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint="Opens the decision"
    >
      <View style={styles.head}>
        <Ionicons
          name={KIND_ICON[item.kind]}
          size={iconSizes.xs}
          color={theme.colors.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text variant="label" color="muted" style={styles.kind}>
          {item.kindLabel}
        </Text>
        <WaitingPill since={item.waitingSince} urgency={item.urgency} now={now} />
      </View>

      <Text variant="bodyStrong" numberOfLines={2} style={styles.title}>
        {item.title}
      </Text>

      <View style={styles.person}>
        <Avatar uri={item.personAvatarUrl} name={item.personName} size="xs" />
        <Text variant="bodySmall" color="secondary" numberOfLines={1} style={styles.personName}>
          {item.personName}
        </Text>
        {item.note ? (
          <Text variant="bodySmall" color="muted" numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>

      {item.context ? (
        <Text variant="bodySmall" color="muted" numberOfLines={2} style={styles.context}>
          {item.context}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  kind: {
    flex: 1,
  },
  title: {
    marginTop: spacing.xs,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  personName: {
    flexShrink: 1,
  },
  context: {
    marginTop: spacing.xxs,
  },
});
