/**
 * The shared UI kit. Import from here, not from the individual files:
 *
 *   import { Button, Card, Text, EmptyState } from '@/components/ui';
 *
 * Everything in this folder is theme-aware, fully typed and meets a 44pt tap
 * target. Before writing a new primitive, check whether one of these composes
 * into what you need — a second Button implementation is how a design system
 * dies.
 */
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export {
  Badge,
  bookingStatusBadge,
  bookingStatusBadgeFor,
  eventStatusBadge,
  orderStatusBadge,
  refundStatusBadge,
} from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';

export { Button } from './Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

export { Input } from './Input';
export { LogoMark } from './LogoMark';
export type { LogoMarkProps } from './LogoMark';
export type { InputProps } from './Input';

export { Screen } from './Screen';
export type { ScreenProps } from './Screen';

export { Skeleton, SkeletonList, SkeletonText } from './Skeleton';
export type { SkeletonListProps, SkeletonProps } from './Skeleton';

export { Text } from './Text';
export type { TextColor, TextProps } from './Text';
