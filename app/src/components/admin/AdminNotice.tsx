import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, type TextColor } from '@/components/ui';
import { borderWidths, iconSizes, radii, spacing, useTheme, type ColorTokenName } from '@/theme';

export type AdminNoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface AdminNoticeProps {
  tone?: AdminNoticeTone;
  /** The fact. Not the consequence, and not an instruction. */
  title: string;
  /** Why it is true and what the operator can do instead. */
  body?: string;
  /** The rule, constraint or migration this reflects. Shown small. */
  source?: string;
  /** An action that resolves it, when one exists. */
  children?: ReactNode;
}

const FILL: Record<AdminNoticeTone, ColorTokenName> = {
  info: 'accentSubtle',
  warning: 'warningSubtle',
  danger: 'dangerSubtle',
  success: 'successSubtle',
};

const BORDER: Record<AdminNoticeTone, ColorTokenName> = {
  info: 'accent',
  warning: 'warning',
  danger: 'dangerBorder',
  success: 'success',
};

const ICON_COLOR: Record<AdminNoticeTone, ColorTokenName> = {
  info: 'accentText',
  warning: 'warningText',
  danger: 'dangerText',
  success: 'successText',
};

const TEXT: Record<AdminNoticeTone, TextColor> = {
  info: 'accent',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
};

const ICON: Record<AdminNoticeTone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle-outline',
  warning: 'alert-circle-outline',
  danger: 'close-circle-outline',
  success: 'checkmark-circle-outline',
};

/**
 * A stated fact the operator has to know before they act — or an honest
 * account of what just happened when they did.
 *
 * This is the component that carries most of the honesty budget of the admin
 * area. "Approving does not move money by itself", "no money was ever taken",
 * "Stripe is not configured so nothing was refunded" all render through here,
 * and the reason they get a bordered, coloured panel rather than a line of
 * grey caption text is that an operator scanning a decision screen will read
 * exactly one non-heading block before they reach for the buttons.
 *
 * Tone is never the only signal: the icon and the wording carry it too, and
 * the whole block is one accessibility node so it is announced as a sentence
 * instead of three fragments.
 *
 * TODO(agent · admin): near-identical to `NoticeCard` in
 * `components/provider-tools/{events,services}`. Three copies is two too many;
 * one of them should move into `components/ui` and the others be deleted. Kept
 * separate here only because this pass does not own either of those folders.
 */
export function AdminNotice({ tone = 'info', title, body, source, children }: AdminNoticeProps) {
  const theme = useTheme();
  const interactive = children !== undefined;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors[FILL[tone]], borderColor: theme.colors[BORDER[tone]] },
      ]}
      accessible={!interactive}
      accessibilityLabel={interactive ? undefined : [title, body].filter(Boolean).join('. ')}
    >
      <View style={styles.header}>
        <Ionicons
          name={ICON[tone]}
          size={iconSizes.md}
          color={theme.colors[ICON_COLOR[tone]]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text variant="bodyStrong" color={TEXT[tone]} style={styles.title}>
          {title}
        </Text>
      </View>

      {body ? (
        <Text variant="bodySmall" color="secondary">
          {body}
        </Text>
      ) : null}

      {source ? (
        <Text variant="caption" color="muted">
          {source}
        </Text>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: borderWidths.hairline,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    flex: 1,
  },
});
