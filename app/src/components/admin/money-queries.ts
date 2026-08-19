import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/queries/client';

/**
 * The money view.
 *
 * Every figure comes from a SQL function (migration 0026) rather than being
 * assembled here, for one reason that matters: money arrives through two
 * different tables — `orders` for event tickets and `bookings` for one-to-one
 * sessions — and any total that forgets one is wrong. Doing the union in the
 * database means there is a single place that can be wrong, and it is the same
 * place for every screen that ever asks.
 *
 * The admin gate lives inside those functions too. They are `security definer`
 * so they read past row-level security, which means the `auth_is_admin()` check
 * has to be in the query body; a non-admin calling any of these gets an empty
 * result rather than an error, which is the correct shape for a screen they
 * should never have reached.
 */

export interface MoneySummaryRow {
  currency: string;
  gross_cents: number | null;
  platform_fee_cents: number | null;
  owed_cents: number | null;
  transaction_count: number;
  /** Marked paid with no money moving. Reported apart so no total lies. */
  bypassed_cents: number;
  bypassed_count: number;
}

export interface OrganiserBalanceRow {
  profile_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  currency: string;
  gross_cents: number | null;
  owed_cents: number | null;
  transaction_count: number;
  bypassed_count: number;
}

export interface TransactionRow {
  kind: 'order' | 'booking';
  id: string;
  reference: string | null;
  occurred_at: string;
  currency: string;
  total_cents: number;
  bypassed: boolean;
  rail: string;
  /** Who paid. */
  counterparty: string;
  /** What for — an event title, or the service name. */
  subject: string;
}

export const moneyKeys = {
  all: ['admin', 'money'] as const,
  summary: ['admin', 'money', 'summary'] as const,
  balances: ['admin', 'money', 'balances'] as const,
  transactions: ['admin', 'money', 'transactions'] as const,
};

export async function getMoneySummary(): Promise<MoneySummaryRow[]> {
  return unwrap(
    supabase.rpc('admin_money_summary').returns<MoneySummaryRow[]>(),
    'load the totals',
  );
}

export async function getOrganiserBalances(): Promise<OrganiserBalanceRow[]> {
  return unwrap(
    supabase.rpc('admin_organiser_balances', { limit_n: 50 }).returns<OrganiserBalanceRow[]>(),
    'load what is owed',
  );
}

export async function getRecentTransactions(): Promise<TransactionRow[]> {
  return unwrap(
    supabase.rpc('admin_recent_transactions', { limit_n: 40 }).returns<TransactionRow[]>(),
    'load recent payments',
  );
}
