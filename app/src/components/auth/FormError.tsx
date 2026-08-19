import { View } from 'react-native';

import { Text } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { borderWidths, radii, spacing, useTheme } from '@/theme';

export interface FormErrorProps {
  /** The caught error. Null renders nothing. */
  error: unknown;
}

/**
 * Form-level error banner — the one that says "that email and password do not
 * match", as opposed to a per-field validation message.
 *
 * `accessibilityLiveRegion="assertive"` is doing real work: a submit that fails
 * is otherwise completely silent for a screen-reader user, who is left with a
 * form that simply did not go anywhere.
 */
export function FormError({ error }: FormErrorProps) {
  const theme = useTheme();
  if (error === null || error === undefined) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        backgroundColor: theme.colors.dangerSubtle,
        borderColor: theme.colors.dangerBorder,
        borderWidth: borderWidths.hairline,
        borderRadius: radii.lg,
        padding: spacing.sm,
      }}
    >
      <Text variant="bodySmall" color="danger">
        {errorMessage(error)}
      </Text>
    </View>
  );
}
