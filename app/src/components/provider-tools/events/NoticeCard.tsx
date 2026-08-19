import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, type TextColor } from '@/components/ui';
import { borderWidths, iconSizes, radii, spacing, useTheme, type ColorTokenName } from '@/theme';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface NoticeCardProps {
  tone?: NoticeTone;
  title: string;
  /** One or two sentences. What is wrong and what to do about it. */
  body?: string;
  /** The constraint or guideline this mirrors — shown small, for support. */
  source?: string;
  /** An action that resolves it. */
  children?: ReactNode;
}

const FILL: Record<NoticeTone, ColorTokenName> = {
  info: 'accentSubtle',
  warning: 'warningSubtle',
  danger: 'dangerSubtle',
  success: 'successSubtle',
};

// `warning` and `success` have no dedicated border token — only `danger` does —
// so the base colour doubles as the border rather than a new hex appearing
// here. If a designer wants distinct ones they belong in `ColorTokens`.
const BORDER: Record<NoticeTone, ColorTokenName> = {
  info: 'accent',
  warning: 'warning',
  danger: 'dangerBorder',
  success: 'success',
};

const ICON_COLOR: Record<NoticeTone, ColorTokenName> = {
  info: 'accentText',
  warning: 'warningText',
  danger: 'dangerText',
  success: 'successText',
};

const TEXT: Record<NoticeTone, TextColor> = {
  info: 'accent',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
};

const ICON: Record<NoticeTone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle-outline',
  warning: 'alert-circle-outline',
  danger: 'close-circle-outline',
  success: 'checkmark-circle-outline',
};

/**
 * A coloured callout for something the host needs to know before they act —
 * a check constraint that will refuse the write, a store rule that decides how
 * the event is paid for, a tier combination that makes an event unbuyable.
 *
 * Not a `Badge` (those are one word) and not an `ErrorState` (that replaces a
 * screen). This sits inline, next to the control it is about.
 *
 * The whole block is one accessibility node so a screen reader reads the
 * situation as a sentence rather than as three fragments, and `tone` is never
 * the only signal — the icon and the wording carry it too.
 */
export function NoticeCard({ tone = 'info', title, body, source, children }: NoticeCardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors[FILL[tone]],
          borderColor: theme.colors[BORDER[tone]],
        },
      ]}
      accessible={children === undefined}
      accessibilityLabel={children === undefined ? [title, body].filter(Boolean).join('. ') : undefined}
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
