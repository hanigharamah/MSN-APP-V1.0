import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AdminNotice } from '@/components/admin';
import {
  getMoneySummary,
  getOrganiserBalances,
  getRecentTransactions,
  moneyKeys,
  type MoneySummaryRow,
} from '@/components/admin/money-queries';
import { Avatar, Card, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { formatLocal, formatMoney } from '@/lib/format';
import { borderWidths, spacing, useTheme } from '@/theme';

/**
 * Money.
 *
 * ## What this screen is for
 *
 * Two questions get asked over and over and neither had an answer anywhere in
 * the product: "how much came in" and "what do we owe people". Everything here
 * exists to answer one of those. There is no chart, no date picker and no
 * export — none of those answer a question, and a dashboard that looks busy is
 * how you end up with numbers nobody trusts.
 *
 * ## Read-only, deliberately
 *
 * Nothing here pays anybody. Payouts need Stripe Connect onboarding that does
 * not exist yet, and a screen that shows a balance next to a button which
 * cannot move money is worse than one that shows the balance alone. When
 * payouts land, this is where they attach.
 *
 * ## Simulated money is never folded into a total
 *
 * Payments are bypassed right now (migration 0018) — orders are marked paid
 * without money moving. Those amounts are reported on their own line, never
 * added to the real figure. The moment this screen adds a simulated £62 to a
 * real £0 and shows £62, every number on it becomes untrustworthy.
 */
export default function AdminMoneyScreen() {
  const summary = useQuery({ queryKey: moneyKeys.summary, queryFn: getMoneySummary });
  const balances = useQuery({ queryKey: moneyKeys.balances, queryFn: getOrganiserBalances });
  const transactions = useQuery({
    queryKey: moneyKeys.transactions,
    queryFn: getRecentTransactions,
  });

  const refreshing =
    summary.isRefetching || balances.isRefetching || transactions.isRefetching;

  const refetchAll = () => {
    void summary.refetch();
    void balances.refetch();
    void transactions.refetch();
  };

  if (summary.isPending) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Money' }} />
        <View style={styles.loading} accessibilityLabel="Loading the totals">
          <Skeleton height={120} radius="lg" />
          <Skeleton height={180} radius="lg" />
        </View>
      </Screen>
    );
  }

  if (summary.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Money' }} />
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </Screen>
    );
  }

  const rows = summary.data ?? [];
  const anyBypassed = rows.some((row) => row.bypassed_count > 0);

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: 'Money' }} />

      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        {anyBypassed ? (
          <AdminNotice
            tone="warning"
            title="Payments are in test mode"
            body="Some purchases below were marked paid without money moving. Those amounts are listed separately and are never added to the real totals."
            source="payment_bypassed · migration 0018"
          />
        ) : null}

        {/* --- Headline ----------------------------------------------------- */}
        {rows.length === 0 ? (
          <EmptyState
            icon="cash-outline"
            title="No money yet"
            description="Totals appear here as soon as the first ticket is bought or session is booked."
          />
        ) : (
          rows.map((row) => <CurrencyTotals key={row.currency} row={row} />)
        )}

        {/* --- Owed --------------------------------------------------------- */}
        <Text variant="h4" heading={2} style={styles.sectionTitle}>
          Owed to practitioners
        </Text>

        {balances.isPending ? (
          <Skeleton height={140} radius="lg" />
        ) : balances.isError ? (
          <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
        ) : (balances.data ?? []).length === 0 ? (
          <Card variant="outlined" padding="sm">
            <Text variant="bodySmall" color="muted">
              Nobody has earned anything yet.
            </Text>
          </Card>
        ) : (
          <Card variant="outlined" padding="sm">
            {(balances.data ?? []).map((person, index, all) => (
              <BalanceRow
                key={`${person.profile_id}-${person.currency}`}
                person={person}
                last={index === all.length - 1}
              />
            ))}
          </Card>
        )}

        {/* --- Recent ------------------------------------------------------- */}
        <Text variant="h4" heading={2} style={styles.sectionTitle}>
          Recent payments
        </Text>

        {transactions.isPending ? (
          <Skeleton height={180} radius="lg" />
        ) : transactions.isError ? (
          <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
        ) : (transactions.data ?? []).length === 0 ? (
          <Card variant="outlined" padding="sm">
            <Text variant="bodySmall" color="muted">
              Nothing has been paid for yet.
            </Text>
          </Card>
        ) : (
          <Card variant="outlined" padding="sm">
            {(transactions.data ?? []).map((row, index, all) => (
              <TransactionLine key={`${row.kind}-${row.id}`} row={row} last={index === all.length - 1} />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function CurrencyTotals({ row }: { row: MoneySummaryRow }) {
  const gross = row.gross_cents ?? 0;
  const owed = row.owed_cents ?? 0;
  const fee = row.platform_fee_cents ?? 0;

  return (
    <Card variant="outlined" style={styles.totals}>
      <Text variant="label" color="muted">
        {row.currency}
      </Text>

      <Text variant="h2" heading={2}>
        {formatMoney(gross, row.currency)}
      </Text>
      <Text variant="bodySmall" color="secondary">
        {`Taken across ${row.transaction_count} ${row.transaction_count === 1 ? 'payment' : 'payments'}`}
      </Text>

      <View style={styles.splitRow}>
        <Split label="MSN keeps" value={formatMoney(fee, row.currency)} />
        <Split label="Owed out" value={formatMoney(owed, row.currency)} />
      </View>

      {row.bypassed_count > 0 ? (
        <Text variant="bodySmall" color="muted" style={styles.bypassed}>
          {`Plus ${formatMoney(row.bypassed_cents, row.currency)} across ${row.bypassed_count} test ${row.bypassed_count === 1 ? 'purchase' : 'purchases'} — no money moved, not counted above.`}
        </Text>
      ) : null}
    </Card>
  );
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.split}>
      <Text variant="label" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

function BalanceRow({
  person,
  last,
}: {
  person: {
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
    currency: string;
    owed_cents: number | null;
    transaction_count: number;
    bypassed_count: number;
  };
  last: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        last ? undefined : { borderBottomWidth: borderWidths.hairline, borderBottomColor: theme.colors.border },
      ]}
    >
      <Avatar uri={person.avatar_url} name={person.display_name} size="sm" />
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {person.display_name}
        </Text>
        <Text variant="bodySmall" color="muted">
          {person.bypassed_count > 0
            ? `${person.transaction_count} paid · ${person.bypassed_count} test`
            : `${person.transaction_count} ${person.transaction_count === 1 ? 'payment' : 'payments'}`}
        </Text>
      </View>
      <Text variant="bodyStrong">
        {formatMoney(person.owed_cents ?? 0, person.currency)}
      </Text>
    </View>
  );
}

function TransactionLine({
  row,
  last,
}: {
  row: {
    kind: 'order' | 'booking';
    reference: string | null;
    occurred_at: string;
    currency: string;
    total_cents: number;
    bypassed: boolean;
    counterparty: string;
    subject: string;
  };
  last: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        last ? undefined : { borderBottomWidth: borderWidths.hairline, borderBottomColor: theme.colors.border },
      ]}
    >
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {row.subject}
        </Text>
        <Text variant="bodySmall" color="muted" numberOfLines={1}>
          {`${row.counterparty} · ${formatLocal(row.occurred_at)}`}
        </Text>
      </View>
      <View style={styles.amount}>
        <Text variant="bodyStrong">{formatMoney(row.total_cents, row.currency)}</Text>
        {row.bypassed ? (
          <Text variant="caption" color="muted">
            test
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: spacing.md, gap: spacing.sm },
  page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  totals: { gap: spacing.xxs },
  splitRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  split: { gap: spacing.xxs },
  bypassed: { marginTop: spacing.sm },
  sectionTitle: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowBody: { flex: 1, gap: spacing.xxs },
  amount: { alignItems: 'flex-end' },
});
