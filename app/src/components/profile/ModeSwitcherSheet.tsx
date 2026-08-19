import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/events';
import { Avatar, Text } from '@/components/ui';
import { useActiveAccount } from '@/context/ActiveAccountContext';
import { useAuth } from '@/context/AuthContext';
import { useMode, type AppMode } from '@/context/ModeContext';
import { ACCOUNT_TYPE_LABEL, listMyAccounts } from '@/lib/queries/accounts';
import { qk } from '@/lib/queries/keys';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface ModeSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface ModeRow {
  value: AppMode;
  label: string;
  detail: string;
}

const ROWS: readonly ModeRow[] = [
  {
    value: 'seeking',
    label: 'Seeking',
    detail: 'Sessions you book and tickets you hold',
  },
  {
    value: 'hosting',
    label: 'Hosting',
    detail: 'Sessions people book with you',
  },
];

/**
 * The mode switcher, raised by holding the Profile tab.
 *
 * One account, two ways of looking at it — the same idea as Airbnb's "Switch to
 * hosting", reachable from the tab bar rather than buried a screen deep. Both
 * rows carry the same avatar on purpose: these are not two accounts, and the
 * repeated face is what says so. The name never changes, the reviews never
 * change, only which half of the product opens first.
 *
 * Rows announce as radios in a `radiogroup`, so a screen reader says that
 * choosing one deselects the other. Choosing closes the sheet — there is no
 * second confirming tap, because the whole point of the gesture is speed.
 *
 * Only ever mounted for an account that can host; a seeker has nothing to
 * choose between, and the caller does not raise this for them.
 */
export function ModeSwitcherSheet({ visible, onClose }: ModeSwitcherSheetProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { mode, setMode } = useMode();
  const { activeAccountId, setActiveAccountId } = useActiveAccount();

  // Only fetched while the sheet is up. Most people hold exactly one account and
  // will never see this section; asking for the list on every launch would be a
  // request per app open to render nothing.
  const accounts = useQuery({
    queryKey: qk.accounts.mine(profile?.id ?? ''),
    queryFn: listMyAccounts,
    enabled: visible && profile !== null,
    staleTime: 5 * 60_000,
  });

  if (profile === null) return null;

  const choose = (next: AppMode) => {
    setMode(next);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Switch">
      <Text variant="bodySmall" color="secondary" style={styles.sectionLabel}>
        Switch mode
      </Text>
      <View style={styles.rows} accessibilityRole="radiogroup">
        {ROWS.map((row) => {
          const selected = mode === row.value;
          return (
            <Pressable
              key={row.value}
              onPress={() => choose(row.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${row.label}. ${row.detail}`}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surfaceMuted
                    : selected
                      ? theme.colors.accentSubtle
                      : theme.colors.surface,
                },
              ]}
            >
              <Avatar
                uri={profile.avatar_url}
                name={profile.display_name}
                size="md"
                ringed={row.value === 'hosting'}
                ringColor={theme.colors.accent}
              />

              <View style={styles.text}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.label}
                </Text>
                <Text variant="caption" color="muted">
                  {row.detail}
                </Text>
              </View>

              {selected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={iconSizes.lg}
                  color={theme.colors.accent}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Accounts, under modes — the order the request described, and the right
          one: switching mode is the everyday action and switching account is
          the occasional one, so the frequent thing stays under the thumb.

          Rendered only when there is more than one account. A person with a
          single profile has nothing to choose between, and a section headed
          "Account" listing exactly themselves reads as a feature that is
          broken rather than one that is inapplicable. */}
      {(accounts.data?.length ?? 0) > 1 ? (
        <View style={styles.accounts}>
          <Text variant="bodySmall" color="secondary" style={styles.sectionLabel}>
            Switch account
          </Text>

          <View style={styles.rows} accessibilityRole="radiogroup">
            {accounts.data?.map((account) => {
              const selected = (activeAccountId ?? profile.id) === account.id;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => {
                    setActiveAccountId(account.id);
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={`${account.display_name}. ${ACCOUNT_TYPE_LABEL[account.account_type]}${account.is_self ? '. Your own account' : ''}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderColor: selected ? theme.colors.accent : theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceMuted
                        : selected
                          ? theme.colors.accentSubtle
                          : theme.colors.surface,
                    },
                  ]}
                >
                  <Avatar
                    uri={account.avatar_url}
                    name={account.display_name}
                    size="md"
                  />

                  <View style={styles.text}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {account.display_name}
                    </Text>
                    <Text variant="caption" color="muted" numberOfLines={1}>
                      {account.is_self
                        ? 'You'
                        : ACCOUNT_TYPE_LABEL[account.account_type]}
                    </Text>
                  </View>

                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={iconSizes.lg}
                      color={theme.colors.accent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  accounts: { marginTop: spacing.lg, gap: spacing.xs },
  sectionLabel: { marginBottom: spacing.xxs },
  rows: {
    gap: spacing.sm,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
