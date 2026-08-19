import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { InlineError, SectionCard } from '@/components/events';
import { Button, Skeleton, Text } from '@/components/ui';
import { deviceTimeZone, formatEventRange } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { qk } from '@/lib/queries/keys';
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  listAvailabilityBlocks,
} from '@/lib/queries/services';
import {
  borderWidths,
  iconSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  touchSlop,
  useTheme,
} from '@/theme';
import type { AvailabilityBlock } from '@/types/database';
import { BlockEditorSheet, type NewBlock } from './BlockEditorSheet';

/**
 * How far back the block query reaches.
 *
 * `listAvailabilityBlocks` filters on `starts_at`, not on overlap, so a block
 * that began before the window is invisible to it however long it runs. A
 * fortnight of slack means a two-week holiday you are currently *in* still shows
 * up on this card instead of vanishing the morning it starts.
 *
 * TODO(agent · availability): the real fix belongs in the query — `.gte` on
 * `ends_at` rather than `starts_at`, or an `or(...)` overlap filter. This pass
 * does not own `lib/queries`. A block longer than this window still disappears
 * mid-way through.
 */
const LOOKBACK_DAYS = 14;
const LOOKAHEAD_DAYS = 400;

/** The window `listAvailabilityBlocks` is asked for. Impure, hence not inline. */
function blockQueryRange(now: Date = new Date()): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString(),
    toIso: new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000).toISOString(),
  };
}

export interface TimeOffSectionProps {
  providerId: string;
  /** Default zone for entering a new block — the provider's own. */
  defaultTimeZone: string;
}

/**
 * One-off time off.
 *
 * Blocks are private: RLS restricts `SELECT` on `availability_blocks` to the
 * provider themselves, which is why `available_slots` has to run
 * `security definer` and why a seeker sees the gap without ever seeing the
 * reason for it.
 *
 * What a block does **not** do is cancel anything. `available_slots` stops
 * *offering* times inside it; bookings already taken are rows in `bookings`,
 * held by the `bookings_no_provider_overlap` exclusion constraint, and nothing
 * on this screen touches them.
 */
export function TimeOffSection({ providerId, defaultTimeZone }: TimeOffSectionProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const viewerZone = deviceTimeZone();

  // Frozen for the life of the screen: the range is half the query key, and a
  // range that slid on every render would mint a new cache entry each time.
  const range = useMemo(() => blockQueryRange(), []);

  const blocksKey = [...qk.services.all, 'blocks', providerId, range.fromIso, range.toIso] as const;

  const query = useQuery({
    queryKey: blocksKey,
    queryFn: () => listAvailabilityBlocks(providerId, range.fromIso, range.toIso),
    enabled: providerId.length > 0,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.services.all });
  };

  const create = useMutation({
    mutationFn: (block: NewBlock) =>
      createAvailabilityBlock({ ...block, provider_id: providerId }),
    onSuccess: () => {
      setAdding(false);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (blockId: string) => deleteAvailabilityBlock(blockId),
    onSuccess: invalidate,
  });

  const { current, upcoming, past } = useMemo(() => partition(query.data ?? []), [query.data]);

  function confirmDelete(block: AvailabilityBlock) {
    Alert.alert(
      'Remove this time off?',
      `${formatEventRange(block.starts_at, block.ends_at, viewerZone)} will become bookable again straight away.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(block.id) },
      ],
    );
  }

  return (
    <SectionCard
      title="Time off"
      accessory={
        <Button
          label="Add"
          size="sm"
          variant="secondary"
          onPress={() => setAdding(true)}
          accessibilityLabel="Add time off"
        />
      }
    >
      <Text variant="bodySmall" color="secondary" style={styles.intro}>
        One-off gaps carved out of your weekly hours — a holiday, a training day, an afternoon that
        is already spoken for. Only you can see these.
      </Text>

      {query.isPending ? (
        <View style={styles.skeletons} accessibilityLiveRegion="polite">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} height={72} radius="lg" />
          ))}
        </View>
      ) : query.isError ? (
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      ) : current.length === 0 && upcoming.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.colors.surfaceMuted }]}>
          <Text variant="bodySmall" color="secondary">
            No time off booked. Your weekly hours apply as written.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {current.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              viewerZone={viewerZone}
              isCurrent
              busy={remove.isPending && remove.variables === block.id}
              onDelete={() => confirmDelete(block)}
            />
          ))}
          {upcoming.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              viewerZone={viewerZone}
              isCurrent={false}
              busy={remove.isPending && remove.variables === block.id}
              onDelete={() => confirmDelete(block)}
            />
          ))}
        </View>
      )}

      {remove.isError ? (
        <View
          style={[styles.notice, { backgroundColor: theme.colors.dangerSubtle }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text variant="bodySmall" color="danger">
            {errorMessage(remove.error)} That time off is still in place.
          </Text>
        </View>
      ) : null}

      <Text variant="caption" color="muted" style={styles.footnote}>
        Times are shown on your device&apos;s clock ({viewerZone}) — a block is an exact moment, so
        it does not carry a zone of its own the way weekly hours do. Blocking time stops new
        bookings being offered inside it; it never cancels a booking you already have.
        {past > 0 ? ` ${past} past ${past === 1 ? 'block is' : 'blocks are'} hidden.` : ''}
      </Text>

      <BlockEditorSheet
        visible={adding}
        defaultTimeZone={defaultTimeZone}
        isSaving={create.isPending}
        saveError={create.error}
        onSubmit={(block) => create.mutate(block)}
        onClose={() => {
          create.reset();
          setAdding(false);
        }}
      />
    </SectionCard>
  );
}

interface BlockRowProps {
  block: AvailabilityBlock;
  viewerZone: string;
  isCurrent: boolean;
  busy: boolean;
  onDelete: () => void;
}

function BlockRow({ block, viewerZone, isCurrent, busy, onDelete }: BlockRowProps) {
  const theme = useTheme();
  const range = formatEventRange(block.starts_at, block.ends_at, viewerZone);

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: radii.lg,
          borderLeftColor: isCurrent ? theme.colors.warning : theme.colors.border,
          borderLeftWidth: borderWidths.thick,
          opacity: busy ? 0.5 : 1,
        },
      ]}
      accessible
      accessibilityLabel={`${isCurrent ? 'Currently off, ' : ''}${range}${block.reason === null ? '' : `, ${block.reason}`}`}
    >
      <View style={styles.rowText}>
        <Text variant="bodyStrong">{range}</Text>
        {block.reason === null ? null : (
          <Text variant="bodySmall" color="secondary">
            {block.reason}
          </Text>
        )}
        {isCurrent ? (
          <Text variant="caption" color="warning">
            In progress now
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onDelete}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Remove time off, ${range}`}
        accessibilityHint="Makes this range bookable again immediately"
        accessibilityState={{ disabled: busy, busy }}
        hitSlop={touchSlop(iconSizes.md)}
        style={styles.delete}
      >
        <Ionicons name="trash-outline" size={iconSizes.md} color={theme.colors.dangerText} />
      </Pressable>
    </View>
  );
}

function partition(blocks: readonly AvailabilityBlock[]): {
  current: AvailabilityBlock[];
  upcoming: AvailabilityBlock[];
  past: number;
} {
  const now = Date.now();
  const current: AvailabilityBlock[] = [];
  const upcoming: AvailabilityBlock[] = [];
  let past = 0;

  for (const block of blocks) {
    const ends = new Date(block.ends_at).getTime();
    const starts = new Date(block.starts_at).getTime();
    if (ends <= now) past += 1;
    else if (starts <= now) current.push(block);
    else upcoming.push(block);
  }

  current.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { current, upcoming, past };
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.sm,
  },
  skeletons: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  empty: {
    padding: spacing.sm,
    borderRadius: radii.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  delete: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  footnote: {
    marginTop: spacing.sm,
  },
});
