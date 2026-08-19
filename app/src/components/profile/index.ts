/**
 * Profile-tab pieces — the identity header, the edit sheet, and the two row
 * types the tab is built from.
 *
 *   import { ProfileHeader, SettingsRow } from '@/components/profile';
 */
export { EditProfileSheet } from './EditProfileSheet';
export type { EditProfileSheetProps } from './EditProfileSheet';

export { NotificationBell } from './NotificationBell';

export { groupNotifications } from './group-notifications';
export type { NotificationGroup } from './group-notifications';

export { NotificationRow } from './NotificationRow';
export type { NotificationRowProps } from './NotificationRow';

export { accountTypeLabel, ProfileHeader } from './ProfileHeader';
export type { ProfileHeaderProps } from './ProfileHeader';

export { SettingsRow } from './SettingsRow';
export type { SettingsRowProps } from './SettingsRow';

export { DEEP_LINK_KINDS, parseDeepLink } from './deep-link';
export { notificationSubject } from './notification-subject';
export type { DeepLinkKind, DeepLinkTarget } from './deep-link';

export { DeleteAccountSheet } from './DeleteAccountSheet';
export type { DeleteAccountSheetProps } from './DeleteAccountSheet';

export { ModeHintBubble } from './ModeHintBubble';

export { ModeSwitcherSheet } from './ModeSwitcherSheet';
export type { ModeSwitcherSheetProps } from './ModeSwitcherSheet';

export { ProfileTabIcon } from './ProfileTabIcon';
export type { ProfileTabIconProps } from './ProfileTabIcon';
