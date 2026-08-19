import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { errorMessage, isAppError } from '@/lib/errors';
import { spacing, useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface ErrorStateProps {
  /** The caught error. Anything — it is narrowed internally. */
  error: unknown;
  /** React Query's `refetch`. Omit and no retry button is shown. */
  onRetry?: () => void;
  /** Overrides the derived title. */
  title?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shown when a query rejects.
 *
 * Two things it deliberately does:
 *
 * 1. **Only offers a retry when one might work.** `AppError.retryable` is
 *    false for `forbidden` and `validation`; showing "Try again" there teaches
 *    people to tap a button that will never help.
 * 2. **Never renders the raw error.** `errorMessage()` returns the safe,
 *    user-facing string; the Postgres detail lives on `error.cause` and goes
 *    to the console, not the screen.
 *
 * `accessibilityLiveRegion="polite"` announces the failure when it replaces a
 * loading state, which is otherwise silent for a screen-reader user.
 */
export function ErrorState({ error, onRetry, title, style }: ErrorStateProps) {
  const theme = useTheme();

  const kind = isAppError(error) ? error.kind : 'unknown';
  const canRetry = onRetry !== undefined && (!isAppError(error) || error.retryable);

  const heading =
    title ??
    (kind === 'network'
      ? 'No connection'
      : kind === 'forbidden'
        ? 'Not available'
        : kind === 'not_found'
          ? 'Not found'
          : kind === 'not_implemented'
            ? 'Coming soon'
            : 'Something went wrong');

  const icon =
    kind === 'network'
      ? 'cloud-offline-outline'
      : kind === 'forbidden'
        ? 'lock-closed-outline'
        : kind === 'not_implemented'
          ? 'construct-outline'
          : 'alert-circle-outline';

  return (
    <View
      style={[styles.container, style]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${heading}. ${errorMessage(error)}`}
    >
      <View style={[styles.iconWell, { backgroundColor: theme.colors.dangerSubtle }]}>
        <Ionicons name={icon} size={28} color={theme.colors.dangerText} />
      </View>

      <Text variant="h4" align="center" style={styles.title}>
        {heading}
      </Text>

      <Text variant="bodySmall" color="muted" align="center" style={styles.description}>
        {errorMessage(error)}
      </Text>

      {canRetry ? (
        <Button label="Try again" onPress={onRetry} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xl,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  description: {
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.lg,
  },
});
