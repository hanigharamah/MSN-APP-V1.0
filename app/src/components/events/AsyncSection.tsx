import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { errorMessage, isAppError } from '@/lib/errors';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface AsyncSectionProps<T> {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** React Query's `refetch`. */
  onRetry: () => void;
  data: readonly T[] | undefined;
  /** Placeholder for the pending branch. Size it like the real content. */
  pending: ReactNode;
  /** One line for "the query worked and there is nothing here". */
  emptyText: string;
  children: (rows: readonly T[]) => ReactNode;
}

/**
 * Pending / error / empty / success for a *subsection* of a screen.
 *
 * `ErrorState` and `EmptyState` are full-screen furniture — 80pt of vertical
 * padding and a 64pt icon well. Dropping one inside a 100pt gallery card
 * because six thumbnails failed to load pushes the rest of the page off the
 * screen for a failure that is not fatal to the page. This is the compact
 * equivalent, and it keeps CONVENTIONS §3's "all four branches are mandatory"
 * rule affordable at section granularity.
 *
 * Retry follows the same rule as `ErrorState`: only offered when
 * `AppError.retryable` says it might work.
 */
export function AsyncSection<T>({
  isPending,
  isError,
  error,
  onRetry,
  data,
  pending,
  emptyText,
  children,
}: AsyncSectionProps<T>) {
  if (isPending) return <>{pending}</>;
  if (isError) return <InlineError error={error} onRetry={onRetry} />;
  if (!data || data.length === 0) {
    return (
      <Text variant="bodySmall" color="muted">
        {emptyText}
      </Text>
    );
  }
  return <>{children(data)}</>;
}

export interface InlineErrorProps {
  error: unknown;
  onRetry?: () => void;
}

/** Compact failure row: safe message, and a retry only when one could help. */
export function InlineError({ error, onRetry }: InlineErrorProps) {
  const theme = useTheme();
  const canRetry = onRetry !== undefined && (!isAppError(error) || error.retryable);

  return (
    <View
      style={[styles.row, { backgroundColor: theme.colors.dangerSubtle }]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={errorMessage(error)}
    >
      <Ionicons
        name="alert-circle-outline"
        size={iconSizes.md}
        color={theme.colors.dangerText}
        style={styles.icon}
      />
      <Text variant="bodySmall" color="danger" style={styles.message}>
        {errorMessage(error)}
      </Text>
      {canRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          hitSlop={spacing.sm}
          style={styles.retry}
        >
          <Text variant="label" color="accent">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.lg,
  },
  icon: {
    marginTop: 1,
  },
  message: {
    flex: 1,
  },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
