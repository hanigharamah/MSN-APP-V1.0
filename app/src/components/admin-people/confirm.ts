import { Alert } from 'react-native';

/**
 * Confirmation for one destructive admin action.
 *
 * The division of labour set out in `bookings/ActionSheet.tsx` applies here:
 * a sheet is for choosing between actions, `Alert` is for confirming ONE
 * irreversible one, because `style: 'destructive'` gets the platform's red and
 * the OS owns the presentation.
 *
 * `message` is not optional. Every action reachable from these screens changes
 * what a real person can do with their account, and a confirmation that only
 * says "Are you sure?" is a confirmation that has told the operator nothing.
 * Spell out the consequence in the same plain words the screen used.
 */
export function confirmDestructive(input: {
  title: string;
  message: string;
  /** The verb, e.g. "Suspend account". Rendered in the platform's red. */
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  Alert.alert(input.title, input.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: input.confirmLabel, style: 'destructive', onPress: input.onConfirm },
  ]);
}

/**
 * Confirmation for a reversible but consequential action — granting a badge,
 * lifting a suspension. Same shape, no destructive styling, because painting a
 * routine approval red teaches the operator to ignore red.
 */
export function confirmAction(input: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  Alert.alert(input.title, input.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: input.confirmLabel, onPress: input.onConfirm },
  ]);
}
