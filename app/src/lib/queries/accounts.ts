import { supabase } from '@/lib/supabase';
import { unwrap } from './client';
import type { AccountType } from '@/types/database';

/**
 * Accounts, as distinct from modes.
 *
 * `ModeContext` flips one identity between seeking and hosting. This is the
 * other axis: which identity you are acting as at all. A person can hold their
 * own seeker profile and administer a business, a venue or a charity, and those
 * are separate accounts with their own names, listings and reviews — not
 * settings on a person.
 */
export interface SwitchableAccount {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  account_type: AccountType;
  /** `owner` may hand the account on; `manager` may run it but not give it away.
   *  Typed as `string` because the database column is a checked text column, not
   *  an enum — narrowing it here would be a claim the schema does not make. */
  role: string;
  /** True for the person themselves, which is always first in the list. */
  is_self: boolean;
}

/**
 * Everything the switcher can offer.
 *
 * Goes through `list_my_accounts` rather than reading `account_members` and
 * joining on the client: the profile rows of accounts you administer are not
 * readable through the ordinary `profiles` policy, and widening that policy so
 * a switcher could draw six avatars would be the wrong trade entirely.
 */
export async function listMyAccounts(): Promise<SwitchableAccount[]> {
  const rows = await unwrap(supabase.rpc('list_my_accounts'), 'load your accounts');
  return rows as SwitchableAccount[];
}

/** How each account type describes itself, in the seeker's language. */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  seeker: 'Seeker',
  practitioner: 'Practitioner',
  business: 'Business',
  organizer: 'Event organiser',
  venue: 'Venue',
  social_impact: 'Social impact',
  nonprofit: 'Nonprofit',
};
