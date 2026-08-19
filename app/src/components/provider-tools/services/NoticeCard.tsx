import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Card, Text } from '@/components/ui';
import { spacing, useTheme, type ColorTokenName } from '@/theme';

export type NoticeTone = 'info' | 'warning';

export interface NoticeCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** The consequence, in a sentence or two. This is the part people read. */
  body: string;
  tone?: NoticeTone;
  style?: StyleProp<ViewStyle>;
}

const ICON_COLOR: Record<NoticeTone, ColorTokenName> = {
  info: 'accent',
  warning: 'warning',
};

/**
 * An explanation attached to a field — what this choice will mean later.
 *
 * Used for the two things on the service form that a practitioner cannot
 * discover by trying: which payment rail a delivery mode forces, and the fact
 * that a cancellation window is snapshotted onto bookings. Both are rules that
 * bite somewhere other than the screen where the choice is made, so they are
 * stated at the point of choosing rather than in help text nobody opens.
 *
 * The whole card is one accessibility node: title and body are one thought,
 * and two stops would read the heading without the consequence.
 */
export function NoticeCard({ icon, title, body, tone = 'info', style }: NoticeCardProps) {
  const theme = useTheme();

  return (
    <Card variant="filled" padding="sm" style={style}>
      <View style={styles.row} accessible accessibilityLabel={`${title}. ${body}`}>
        <Ionicons name={icon} size={20} color={theme.colors[ICON_COLOR[tone]]} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={tone === 'warning' ? 'warning' : 'primary'}>
            {title}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {body}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
