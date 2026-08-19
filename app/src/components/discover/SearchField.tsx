import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { Input } from '@/components/ui';
import { iconSizes, touchSlop, useTheme } from '@/theme';

export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
}

/**
 * The search box.
 *
 * Composed from `Input` rather than written fresh, so the 46pt height, the
 * 2pt accent focus border and the label treatment stay in one place. The web
 * app suppresses its own focus ring (`_layout.scss:29-35`, called out in
 * DESIGN_SOURCE §5 as an accessibility bug); `Input` already implements the
 * intended `.form-control-focus` treatment instead, so nothing extra is needed
 * here.
 *
 * The clear button is a native affordance rather than iOS's built-in
 * `clearButtonMode`, which does not exist on Android and would leave the two
 * platforms with different controls.
 */
export function SearchField({ value, onChangeText, placeholder }: SearchFieldProps) {
  const theme = useTheme();

  return (
    <Input
      label="Search"
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder ?? 'Events, practitioners, places'}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      inputMode="search"
      leading={
        <Ionicons name="search" size={iconSizes.md} color={theme.colors.textMuted} />
      }
      trailing={
        value.length > 0 ? (
          <Pressable
            onPress={() => onChangeText('')}
            hitSlop={touchSlop(iconSizes.md)}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons
              name="close-circle"
              size={iconSizes.md}
              color={theme.colors.textPlaceholder}
            />
          </Pressable>
        ) : null
      }
    />
  );
}
