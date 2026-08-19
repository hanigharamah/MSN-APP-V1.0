import { supabase } from '@/lib/supabase';
import type { Report } from '@/types/database';
import { unwrap, unwrapMaybe } from './client';

/**
 * Reporting and blocking — the two things a person can do about someone else.
 *
 * Both were enforced everywhere and creatable nowhere: `reports` has had an
 * "anyone may report" INSERT policy since 0006 and admin screens to action
 * them, while nothing in the app could file one; `blocked_users` is respected
 * by every messaging path, with no way to add a row. App Store guideline 1.2
 * requires both for user-generated content, so this is a shipping requirement
 * rather than a nicety.
 *
 * No new database work was needed. The policies were already right.
 */

// -----------------------------------------------------------------------------
// Reports
// -----------------------------------------------------------------------------

/**
 * What is being reported.
 *
 * A discriminated union rather than three nullable ids, because
 * `report_targets_one_thing` (0005) is a CHECK requiring exactly one to be set
 * — so the type mirrors the constraint and a malformed report cannot be built
 * in the first place.
 */
export type ReportSubjectRef =
  | { kind: 'profile'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'message'; id: string };

export async function createReport(input: {
  reporterId: string;
  subject: ReportSubjectRef;
  reason: string;
  detail: string | null;
}): Promise<Report> {
  return unwrap(
    supabase
      .from('reports')
      .insert({
        reporter_id: input.reporterId,
        subject_profile_id: input.subject.kind === 'profile' ? input.subject.id : null,
        subject_event_id: input.subject.kind === 'event' ? input.subject.id : null,
        subject_message_id: input.subject.kind === 'message' ? input.subject.id : null,
        reason: input.reason,
        detail: input.detail,
      })
      .select('*')
      .single(),
    'send that report',
  );
}

/**
 * Whether this viewer has already reported this person.
 *
 * Used to soften the control to "Reported" rather than to forbid a second one:
 * a repeat report about a NEW incident is legitimate and the moderator should
 * see it. This only stops someone filing the same complaint twice by accident
 * because they were not sure the first went through.
 */
export async function hasReportedProfile(
  reporterId: string,
  subjectProfileId: string,
): Promise<boolean> {
  const row = await unwrapMaybe(
    supabase
      .from('reports')
      .select('id')
      .eq('reporter_id', reporterId)
      .eq('subject_profile_id', subjectProfileId)
      .limit(1)
      .maybeSingle(),
    'check your reports',
  );
  return row !== null;
}

// -----------------------------------------------------------------------------
// Blocks
// -----------------------------------------------------------------------------

/**
 * Block someone.
 *
 * `upsert` rather than `insert`: the primary key is (blocker, blocked), so
 * blocking twice would be a 23505 on a button whose job is to make something
 * stop. Idempotent is the right shape — the user wants a state, not an event.
 */
export async function blockProfile(blockerId: string, blockedId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('blocked_users')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' })
      .select('blocker_id'),
    'block that person',
  );
}

export async function unblockProfile(blockerId: string, blockedId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .select('blocker_id'),
    'unblock that person',
  );
}

/**
 * Whether THIS viewer has blocked that person.
 *
 * Deliberately one-directional, and different from `isBlockedBetween`. RLS on
 * `blocked_users` is `blocker_id = auth.uid()`, so a viewer can only ever see
 * their own blocks — which is correct: knowing you have been blocked is itself
 * information the blocker did not choose to share. This answers "is my block
 * on?", nothing more.
 */
export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const row = await unwrapMaybe(
    supabase
      .from('blocked_users')
      .select('blocker_id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle(),
    'check your blocked list',
  );
  return row !== null;
}

export interface BlockedPerson {
  blocked_id: string;
  created_at: string;
  profile: { id: string; display_name: string; handle: string | null; avatar_url: string | null } | null;
}

/** Everyone this viewer has blocked, for the settings screen. */
export async function listBlocked(blockerId: string): Promise<BlockedPerson[]> {
  return unwrap(
    supabase
      .from('blocked_users')
      .select('blocked_id, created_at, profile:profiles!blocked_users_blocked_id_fkey(id, display_name, handle, avatar_url)')
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false })
      .returns<BlockedPerson[]>(),
    'load your blocked list',
  );
}

// -----------------------------------------------------------------------------
// Account deletion
// -----------------------------------------------------------------------------

export interface DeletionBlocker {
  kind: 'provider_booking' | 'seeker_booking' | 'event_with_tickets';
  detail: string;
  occurs_at: string;
}

/**
 * What is stopping this account from being closed.
 *
 * Empty means it can be. Non-empty is not an error — it is the list the screen
 * shows so a person can go and deal with each one, which is why the database
 * returns rows rather than a boolean (migration 0025).
 */
export async function accountDeletionBlockers(): Promise<DeletionBlocker[]> {
  return unwrap(
    supabase.rpc('account_deletion_blockers').returns<DeletionBlocker[]>(),
    'check your account',
  );
}

/** Starts the 30-day window. Throws if anything is outstanding. */
export async function requestAccountDeletion(): Promise<string> {
  return unwrap(supabase.rpc('request_account_deletion'), 'close your account');
}

/** Undo, any time before the window runs out. */
export async function cancelAccountDeletion(): Promise<void> {
  await unwrap(supabase.rpc('cancel_account_deletion'), 'restore your account');
}
