import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle as RNTextStyle,
  type ViewStyle,
} from 'react-native';

import { controlHeights, radii, spacing, textStyles, useTheme } from '@/theme';
import { Text } from './Text';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /**
   * Validation message. Its presence switches the field into the error state —
   * there is no separate `hasError` prop to fall out of sync with it.
   */
  error?: string;
  /** Guidance shown under the field. Hidden while `error` is present. */
  hint?: string;
  /** Adds an asterisk and marks the field required to screen readers. */
  required?: boolean;
  /** Rendered inside the field, before the text. */
  leading?: ReactNode;
  /** Rendered inside the field, after the text. A clear or reveal button. */
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Overrides on the text itself — letter spacing for an OTP field, centring,
   * a taller minimum. The base typography and colour still apply underneath.
   */
  inputStyle?: StyleProp<RNTextStyle>;
}

/**
 * Text field with a label, error and hint.
 *
 * The label is always visible rather than a placeholder that vanishes on
 * focus. Placeholder-as-label fails everyone who has to check what they typed,
 * and `textPlaceholder` is deliberately low-contrast so it cannot be mistaken
 * for content.
 *
 * Height (46) and the 2pt invalid border both come from the web app's
 * `.form-control` rules, so a native form and a webview form line up.
 *
 * Errors are wired into `accessibilityLabel` as well as rendered, because a
 * screen reader landing on the input would otherwise hear the label and
 * nothing about why the form will not submit.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    required = false,
    leading,
    trailing,
    containerStyle,
    inputStyle,
    onFocus,
    onBlur,
    editable = true,
    multiline,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const emphasised = focused || error !== undefined;
  const borderColor = error
    ? theme.colors.dangerBorder
    : focused
      ? theme.colors.accent
      : theme.colors.borderStrong;
  const borderWidth = emphasised ? theme.borderWidths.thick : theme.borderWidths.hairline;

  return (
    <View style={containerStyle}>
      <Text variant="bodySmall" color="secondary" style={styles.label}>
        {label}
        {required ? (
          <Text variant="bodySmall" color="danger">
            {' *'}
          </Text>
        ) : null}
      </Text>

      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth,
            // Compensates for the thicker border so nothing shifts on focus.
            paddingHorizontal: spacing.sm - (borderWidth - theme.borderWidths.hairline),
            backgroundColor: editable ? theme.colors.surface : theme.colors.surfaceSunken,
            borderRadius: radii.sm,
            minHeight: multiline ? controlHeights.input * 2 : controlHeights.input,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {leading}
        <TextInput
          ref={ref}
          editable={editable}
          multiline={multiline}
          placeholderTextColor={theme.colors.textPlaceholder}
          accessibilityLabel={error ? `${label}. Error: ${error}` : label}
          accessibilityHint={hint}
          aria-required={required}
          aria-invalid={error !== undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            textStyles.body,
            {
              color: editable ? theme.colors.textPrimary : theme.colors.textMuted,
              paddingVertical: multiline ? spacing.sm : 0,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            inputStyle,
          ]}
          {...rest}
        />
        {trailing}
      </View>

      {error ? (
        <Text variant="caption" color="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xxs,
  },
  field: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    // Android adds its own padding, which misaligns the text against `leading`.
    paddingTop: 0,
    paddingBottom: 0,
  },
  helper: {
    marginTop: spacing.xxs,
  },
});
