import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { textStyles, useTheme, type ColorTokenName, type TextStyleToken } from '@/theme';

/** Semantic colour roles a `<Text>` may take. Never a hex. */
export type TextColor =
  | 'heading'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'placeholder'
  | 'accent'
  | 'accentDeep'
  | 'onAccent'
  | 'success'
  | 'warning'
  | 'danger';

const COLOR_MAP: Record<TextColor, ColorTokenName> = {
  heading: 'textHeading',
  primary: 'textPrimary',
  secondary: 'textSecondary',
  muted: 'textMuted',
  placeholder: 'textPlaceholder',
  accent: 'accentText',
  accentDeep: 'accentDeep',
  onAccent: 'textOnAccent',
  success: 'successText',
  warning: 'warningText',
  danger: 'dangerText',
};

export interface TextProps extends RNTextProps {
  /**
   * Role from the type scale: `display`, `h1`–`h4`, `body`, `bodyStrong`,
   * `bodySmall`, `caption`, `label`, `button`. Defaults to `body`.
   */
  variant?: TextStyleToken;
  /** Semantic colour role. Defaults to `primary`. */
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /**
   * Marks this as a heading for screen readers and sets the level. Use it on
   * every screen and section title — VoiceOver and TalkBack both let users
   * jump between headings, and without it the app is one flat wall of text.
   */
  heading?: 1 | 2 | 3 | 4 | false;
}

/**
 * A heading variant IS a heading, unless the caller says otherwise.
 *
 * The opt-in version of this prop existed and was used exactly once across the
 * whole app, against eleven screens carrying a visual `h1` or `h2` — so
 * VoiceOver saw one flat wall of text with no way to skip between sections.
 * Deriving the level from the variant fixes every screen at once and cannot
 * drift, because the thing that makes text look like a heading is now the same
 * thing that makes it announce as one.
 *
 * `heading={false}` opts out, for the rare case where a display size is used
 * for emphasis rather than structure — a large price, say.
 */
const LEVEL_FOR_VARIANT: Partial<Record<TextStyleToken, 1 | 2 | 3 | 4>> = {
  display: 1,
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
};

/**
 * The only text primitive.
 *
 * Do not use React Native's `<Text>` directly: it has no font family, so it
 * renders in the system face instead of DM Sans and visibly breaks the join
 * with the webview screens still in the app.
 *
 *   <Text variant="h2" heading={1}>Discover</Text>
 *   <Text variant="caption" color="muted">{formatRelative(iso)}</Text>
 */
export function Text({
  variant = 'body',
  color = 'primary',
  align,
  heading,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const level =
    heading === undefined ? LEVEL_FOR_VARIANT[variant] : heading === false ? undefined : heading;

  return (
    <RNText
      accessibilityRole={level === undefined ? undefined : 'header'}
      aria-level={level}
      style={[
        textStyles[variant],
        { color: theme.colors[COLOR_MAP[color]] },
        align === undefined ? null : { textAlign: align },
        style,
      ]}
      {...rest}
    />
  );
}
