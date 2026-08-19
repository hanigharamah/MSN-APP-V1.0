import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/events';
import { Text } from '@/components/ui';
import {
  borderWidths,
  controlHeights,
  fontSizes,
  iconSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  useTheme,
} from '@/theme';

export interface SheetOption {
  /** The value handed back to `onSelect`. */
  value: string;
  label: string;
  /** One line under the label — an offset, a weekday, a count. */
  detail?: string;
}

export interface OptionListSheetProps {
  visible: boolean;
  title: string;
  /** One line under the title saying what the choice means. */
  description?: string;
  options: readonly SheetOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  /** Adds a filter field. Worth it above ~30 options, noise below. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

/**
 * A single-choice list in a bottom sheet.
 *
 * This app has no date or time picker dependency — `@react-native-community/
 * datetimepicker` is not in `package.json` and this pass is not allowed to add
 * one — so times, dates and zones are all chosen from a list instead. One sheet
 * serves all three rather than three near-identical ones.
 *
 * Rows announce as radios inside a `radiogroup`, which is what tells a screen
 * reader that picking one deselects the rest. Choosing closes the sheet: every
 * list here is single-choice, so a separate "Done" would be a second tap that
 * decides nothing.
 */
export function OptionListSheet({
  visible,
  title,
  description,
  options,
  selected,
  onSelect,
  onClose,
  searchable = false,
  searchPlaceholder = 'Search',
}: OptionListSheetProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const visibleOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!searchable || needle.length === 0) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle) ||
        (option.detail ?? '').toLowerCase().includes(needle),
    );
  }, [options, search, searchable]);

  const close = () => {
    setSearch('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={title}>
      {description === undefined ? null : (
        <Text variant="bodySmall" color="secondary">
          {description}
        </Text>
      )}

      {searchable ? (
        <View
          style={[
            styles.search,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: borderWidths.hairline,
              borderRadius: radii.sm,
            },
          ]}
        >
          <Ionicons name="search" size={iconSizes.sm} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.colors.textPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={searchPlaceholder}
            style={[
              styles.searchInput,
              { color: theme.colors.textPrimary, fontFamily: theme.typography.families.regular },
            ]}
          />
        </View>
      ) : null}

      {visibleOptions.length === 0 ? (
        <Text variant="bodySmall" color="muted">
          Nothing matches “{search.trim()}”.
        </Text>
      ) : (
        <View accessibilityRole="radiogroup">
          {visibleOptions.map((option) => {
            const isSelected = option.value === selected;

            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onSelect(option.value);
                  close();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  option.detail === undefined ? option.label : `${option.label}, ${option.detail}`
                }
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: theme.colors.border,
                    borderBottomWidth: borderWidths.hairline,
                    backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text variant={isSelected ? 'bodyStrong' : 'body'} color={isSelected ? 'accent' : 'primary'}>
                    {option.label}
                  </Text>
                  {option.detail === undefined ? null : (
                    <Text variant="caption" color="muted">
                      {option.detail}
                    </Text>
                  )}
                </View>

                {isSelected ? (
                  <Ionicons name="checkmark" size={iconSizes.md} color={theme.colors.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: controlHeights.input,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizes.md,
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
});
