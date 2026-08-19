import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PersonRow, adminKeys, searchPeople } from '@/components/admin-people';
import { SearchField, useDebouncedValue } from '@/components/discover';
import { EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { spacing } from '@/theme';

/**
 * Find someone.
 *
 * ## Why this is a search box and not a list
 *
 * Every admin tool drifts towards a paginated table of every user, because a
 * table is what the schema suggests. It is the wrong shape: scrolling six
 * thousand accounts has never once been how an operator found the person they
 * needed. You arrive here because a report named someone, a refund came in, or
 * a practitioner emailed asking why their badge has not appeared — in every
 * case you already know who you want.
 *
 * So there is no unfiltered branch. `searchPeople` returns nothing for an empty
 * term rather than page one of the whole table, and the idle state says what to
 * type instead of pretending to be a directory.
 *
 * Suspended accounts are included and sorted first. They are the most likely
 * thing to be looked up, and an operator who searches a name and sees no result
 * would reasonably conclude the account does not exist.
 */

/** Below this, results are too broad to be useful and too costly to fetch. */
const MIN_TERM_LENGTH = 2;

export default function FindSomeoneScreen() {
  const router = useRouter();
  const [term, setTerm] = useState('');

  const settled = useDebouncedValue(term.trim());
  const active = settled.length >= MIN_TERM_LENGTH;

  const results = useQuery({
    queryKey: adminKeys.people.search(settled),
    queryFn: () => searchPeople(settled),
    enabled: active,
  });

  return (
    <Screen safeBottom>
      <View style={styles.field}>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder="Name, handle or email"
        />
      </View>

      {!active ? (
        <EmptyState
          icon="search-outline"
          title="Search for an account"
          description="Type at least two characters of a name, handle or email address. This is not a directory — accounts only appear when you look for them."
        />
      ) : results.isPending ? (
        <View
          style={styles.list}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Searching accounts"
        >
          <SkeletonList count={4} itemHeight={88} />
        </View>
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState
          icon="person-outline"
          title="No account matches"
          description={`Nothing found for "${settled}". Try a different spelling, or search the email address instead.`}
        />
      ) : (
        <FlatList
          data={results.data}
          keyExtractor={(profile) => profile.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text variant="caption" color="muted" style={styles.count}>
              {`${results.data.length} ${results.data.length === 1 ? 'account' : 'accounts'}`}
            </Text>
          }
          renderItem={({ item }) => (
            <PersonRow
              profile={item}
              onPress={() => router.push(`/(admin)/people/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  count: {
    marginBottom: spacing.xs,
  },
});
