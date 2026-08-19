import { Ionicons } from '@expo/vector-icons';
import { ActionSheetIOS, Alert, Platform, Pressable } from 'react-native';

import { iconSizes, useTheme } from '@/theme';

export interface SafetyMenuProps {
  /** Whose profile or conversation this is. Named in every prompt. */
  personName: string;
  /** True when this viewer has already blocked them — flips block to unblock. */
  isBlocked: boolean;
  onReport: () => void;
  onToggleBlock: () => void;
}

/**
 * The `⋯` in the nav bar: report, and block.
 *
 * ## Why it lives here and not in a visible section
 *
 * These are the two controls App Store guideline 1.2 requires, so they have to
 * be findable — but a "Safety" panel sitting under someone's profile implies
 * the marketplace expects trouble, which is the wrong note for a wellness
 * product. The overflow menu is where iOS users already look for actions about
 * the thing on screen, and where App Review looks too.
 *
 * ## Blocking asks; reporting does not
 *
 * Blocking takes effect the instant it is confirmed and silently changes what
 * the other person can do, so it gets a confirmation naming the consequence.
 * Reporting opens a sheet that can still be cancelled, so a second prompt in
 * front of it would just be a door before a door.
 *
 * Native action sheet on iOS, `Alert` elsewhere — the fallback keeps the same
 * options in the same order rather than degrading to something different.
 */
export function SafetyMenu({ personName, isBlocked, onReport, onToggleBlock }: SafetyMenuProps) {
  const theme = useTheme();

  const confirmBlock = () => {
    if (isBlocked) {
      // Unblocking is not destructive and needs no ceremony.
      onToggleBlock();
      return;
    }
    Alert.alert(
      `Block ${personName}?`,
      `They will not be able to message you, and you will not see messages from them. ${personName} is not told. Any session you have already booked together still stands — cancel it separately if you want it gone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: onToggleBlock },
      ],
    );
  };

  const open = () => {
    const blockLabel = isBlocked ? `Unblock ${personName}` : `Block ${personName}`;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', `Report ${personName}`, blockLabel],
          cancelButtonIndex: 0,
          // Only the block is destructive; reporting is a request, not an act.
          destructiveButtonIndex: isBlocked ? undefined : 2,
          title: personName,
        },
        (index) => {
          if (index === 1) onReport();
          if (index === 2) confirmBlock();
        },
      );
      return;
    }

    Alert.alert(personName, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Report ${personName}`, onPress: onReport },
      { text: blockLabel, style: isBlocked ? 'default' : 'destructive', onPress: confirmBlock },
    ]);
  };

  return (
    <Pressable
      onPress={open}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`More options for ${personName}`}
      accessibilityHint="Report or block this person"
    >
      <Ionicons
        name="ellipsis-horizontal"
        size={iconSizes.md}
        color={theme.colors.textHeading}
      />
    </Pressable>
  );
}
