import type { BadgeTone } from '@/components/ui';
import type { AccountType, Profile } from '@/types/database';

/**
 * How an account's type and standing are worded, in one place.
 *
 * The same rule as `Badge.tsx`'s status mappers, for the same reason: an
 * account must not read "Suspended" on the search results and "Hidden" on the
 * account screen. These are not in `Badge.tsx` only because this pass does not
 * own `src/components/ui/`.
 *
 * TODO(agent · admin): fold `accountTypeLabel` and `standingBadges` into
 * `src/components/ui/Badge.tsx` beside the other `*StatusBadge` mappers.
 */

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  seeker: 'Seeker',
  practitioner: 'Practitioner',
  business: 'Business',
  venue: 'Venue',
  nonprofit: 'Non-profit',
  organizer: 'Organiser',
};

export function accountTypeLabel(accountType: AccountType): string {
  return ACCOUNT_TYPE_LABEL[accountType];
}

export interface StandingBadge {
  key: string;
  label: string;
  tone: BadgeTone;
}

/** The columns an account's standing is made of. */
export type Standing = Pick<
  Profile,
  'is_verified' | 'is_certified' | 'is_suspended' | 'is_admin' | 'account_type'
>;

/**
 * Badges in the order an operator needs them.
 *
 * Suspended comes first and is the only `danger` tone, because it is the one
 * that changes how everything else on the screen should be read — a verified
 * practitioner who is suspended is invisible to the marketplace, and burying
 * that after two green badges would misrepresent the account.
 */
export function standingBadges(standing: Pick<Standing, keyof Standing>): StandingBadge[] {
  const badges: StandingBadge[] = [];

  if (standing.is_suspended) {
    badges.push({ key: 'suspended', label: 'Suspended', tone: 'danger' });
  }
  if (standing.is_verified) {
    badges.push({ key: 'verified', label: 'Verified', tone: 'success' });
  }
  if (standing.is_certified) {
    badges.push({ key: 'certified', label: 'Certified', tone: 'accent' });
  }
  if (standing.is_admin) {
    badges.push({ key: 'admin', label: 'Admin', tone: 'warning' });
  }

  // An account with nothing set is the common case and should say so rather
  // than render an empty row that reads as a loading failure.
  if (badges.length === 0) {
    badges.push({ key: 'none', label: 'No badges', tone: 'neutral' });
  }
  return badges;
}

/** One line for a screen reader: "Practitioner. Verified, not suspended." */
export function standingSummary(standing: Standing): string {
  const parts = [accountTypeLabel(standing.account_type)];
  parts.push(standing.is_verified ? 'verified' : 'not verified');
  if (standing.is_certified) parts.push('certified');
  if (standing.is_suspended) parts.push('suspended');
  return parts.join(', ');
}
