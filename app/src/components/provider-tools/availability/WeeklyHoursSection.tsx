import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { InlineError, SectionCard } from '@/components/events';
import { Button, Skeleton, Text } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import {
  borderWidths,
  iconSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  touchSlop,
  useTheme,
} from '@/theme';
import {
  formatWindow,
  formatWindowLength,
  rulesForWeekday,
  WEEKDAYS,
  weekdayLong,
  type DraftRule,
} from './availability-model';
import { RuleEditorSheet } from './RuleEditorSheet';
import { RuleZoneNote } from './RuleZoneNote';
import type { WeeklyHours } from './use-weekly-hours';

export interface WeeklyHoursSectionProps {
  weekly: WeeklyHours;
  /** The provider's `profiles.timezone` — the default zone for a new window. */
  defaultTimeZone: string;
}

/**
 * Weekly hours.
 *
 * Seven rows, always all seven: a day with no hours is shown as closed rather
 * than omitted, because an absent Wednesday and a Wednesday with no hours are
 * the same thing to a seeker and a gap in the list reads as a bug.
 *
 * The three things this card has to say out loud, and does:
 *
 * 1. **Each window carries its own zone.** Printed on every row, with what it
 *    comes to on the reader's clock.
 * 2. **Saving replaces the whole week.** `replaceAvailabilityRules` deletes
 *    every rule and re-inserts, and it is not a transaction.
 * 3. **Removing hours does not cancel anything already booked.** Those rows are
 *    held by `bookings_no_provider_overlap` in the database and are entirely
 *    unaffected by what happens here.
 */
export function WeeklyHoursSection({ weekly, defaultTimeZone }: WeeklyHoursSectionProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState<{ rule: DraftRule | null; weekday: number } | null>(null);

  const timeZonesInUse = [...new Set(weekly.rules.map((rule) => rule.timezone))];

  function confirmRemove(rule: DraftRule) {
    Alert.alert(
      'Remove these hours?',
      `${weekdayLong(rule.weekday)}, ${formatWindow(rule.starts_time, rule.ends_time)} (${rule.timezone}) will stop being offered once you save.\n\nBookings already in your calendar are not affected — removing hours never cancels anything. Cancel those from Bookings if you need to.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => weekly.remove(rule.key) },
      ],
    );
  }

  return (
    <SectionCard
      title="Weekly hours"
      accessory={
        weekly.isDirty ? (
          <View style={[styles.pill, { backgroundColor: theme.colors.warningSubtle }]}>
            <Text variant="caption" color="warning">
              Unsaved
            </Text>
          </View>
        ) : null
      }
    >
      <Text variant="bodySmall" color="secondary" style={styles.intro}>
        The hours you repeat every week. Each window is a wall-clock time in the zone attached to
        it, so “9:00 AM” means 9:00 AM there — not where whoever is looking happens to be.
      </Text>

      {weekly.isPending ? (
        <View style={styles.skeletons} accessibilityLiveRegion="polite">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height={64} radius="lg" />
          ))}
        </View>
      ) : weekly.isError ? (
        <InlineError error={weekly.error} onRetry={weekly.refetch} />
      ) : (
        <View style={styles.days}>
          {WEEKDAYS.map((day) => {
            const windows = rulesForWeekday(weekly.rules, day.value);

            return (
              <View
                key={day.value}
                style={[
                  styles.day,
                  { borderTopColor: theme.colors.border, borderTopWidth: borderWidths.hairline },
                ]}
              >
                <View style={styles.dayHeader}>
                  <Text variant="bodyStrong" heading={3}>
                    {day.long}
                  </Text>
                  <Pressable
                    onPress={() => setEditing({ rule: null, weekday: day.value })}
                    accessibilityRole="button"
                    accessibilityLabel={`Add hours on ${day.long}`}
                    hitSlop={touchSlop(iconSizes.lg)}
                    style={({ pressed }) => [
                      styles.add,
                      {
                        borderRadius: radii.pill,
                        backgroundColor: pressed
                          ? theme.colors.accentSubtlePressed
                          : theme.colors.accentSubtle,
                      },
                    ]}
                  >
                    <Ionicons name="add" size={iconSizes.md} color={theme.colors.accent} />
                  </Pressable>
                </View>

                {windows.length === 0 ? (
                  <Text variant="bodySmall" color="muted">
                    Closed — nothing is offered on {day.long}s.
                  </Text>
                ) : (
                  windows.map((rule) => {
                    const problem = weekly.problems.get(rule.key);

                    return (
                      <View
                        key={rule.key}
                        style={[
                          styles.window,
                          {
                            backgroundColor: theme.colors.surfaceMuted,
                            borderRadius: radii.lg,
                            borderColor:
                              problem === undefined
                                ? 'transparent'
                                : theme.colors.dangerBorder,
                            borderWidth:
                              problem === undefined ? 0 : borderWidths.thick,
                          },
                        ]}
                      >
                        <Pressable
                          onPress={() => setEditing({ rule, weekday: rule.weekday })}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${day.long} ${formatWindow(rule.starts_time, rule.ends_time)} in ${rule.timezone}`}
                          style={styles.windowText}
                        >
                          <Text variant="bodyStrong">
                            {formatWindow(rule.starts_time, rule.ends_time)}
                            <Text variant="bodySmall" color="muted">
                              {'  '}
                              {formatWindowLength(rule.starts_time, rule.ends_time)}
                            </Text>
                          </Text>
                          <RuleZoneNote rule={rule} compact />
                          {problem === undefined ? null : (
                            <Text variant="caption" color="danger">
                              {problem}
                            </Text>
                          )}
                        </Pressable>

                        <Pressable
                          onPress={() => confirmRemove(rule)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${day.long} ${formatWindow(rule.starts_time, rule.ends_time)}`}
                          accessibilityHint="Stops offering this window once you save. Existing bookings are not cancelled."
                          hitSlop={touchSlop(iconSizes.md)}
                          style={styles.remove}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={iconSizes.md}
                            color={theme.colors.dangerText}
                          />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
      )}

      {weekly.warnings.length > 0 ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
          <Text variant="bodySmall" color="warning">
            Overlapping windows in the same zone. Allowed, but they generate extra staggered start
            times — check the preview before you publish.
          </Text>
          {weekly.warnings.map((warning) => (
            <Text key={warning} variant="caption" color="warning">
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {weekly.publishedWiped ? (
        <View
          style={[styles.notice, { backgroundColor: theme.colors.dangerSubtle }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text variant="bodyStrong" color="danger">
            Your published hours are empty right now.
          </Text>
          <Text variant="bodySmall" color="danger">
            Saving removes every rule and writes the new ones, and the second half did not run. Your
            week is still here on screen and nothing is lost — but until you press Save again, you
            are offering no times at all. {errorMessage(weekly.saveError)}
          </Text>
        </View>
      ) : weekly.saveError !== null && weekly.saveError !== undefined ? (
        <View
          style={[styles.notice, { backgroundColor: theme.colors.dangerSubtle }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text variant="bodySmall" color="danger">
            {errorMessage(weekly.saveError)} Your week is unchanged — nothing was published.
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text variant="caption" color="muted">
          Saving replaces your whole week: every rule is removed and rewritten in one go. Bookings
          already in your calendar are never touched by it.
        </Text>

        <View style={styles.actions}>
          {weekly.isDirty ? (
            <Button
              label="Discard"
              variant="ghost"
              onPress={weekly.discard}
              disabled={weekly.isSaving}
            />
          ) : null}
          <Button
            label={weekly.isDirty ? 'Save week' : 'Saved'}
            onPress={weekly.save}
            loading={weekly.isSaving}
            disabled={!weekly.canSave}
            accessibilityHint="Replaces every published rule with what is on screen"
          />
        </View>
      </View>

      <RuleEditorSheet
        visible={editing !== null}
        rule={editing?.rule ?? null}
        defaultWeekday={editing?.weekday ?? 1}
        defaultTimeZone={defaultTimeZone}
        timeZonesInUse={timeZonesInUse}
        onSave={weekly.upsert}
        onClose={() => setEditing(null)}
      />
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
  skeletons: {
    gap: spacing.xs,
  },
  days: {
    gap: spacing.xs,
  },
  day: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  add: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  window: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  windowText: {
    flex: 1,
    gap: spacing.xxs,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  remove: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  footer: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
