import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { qk } from '@/lib/queries/keys';
import { listAvailabilityRules, replaceAvailabilityRules } from '@/lib/queries/services';
import type { AvailabilityRule } from '@/types/database';
import {
  draftFromRules,
  overlapWarnings,
  problemsFor,
  rulesPayload,
  signatureOf,
  sortDraft,
  type DraftRule,
} from './availability-model';

/**
 * The rules query key.
 *
 * `qk` has no entry for `availability_rules`, so this mirrors the shape
 * `(modal)/service/[id].tsx` already invented for the same query — same prefix,
 * same segments — which is what keeps the two sharing one cache entry instead of
 * each fetching the provider's rules separately.
 *
 * TODO(agent · availability): promote this to `qk.services.rules(providerId)` in
 * `lib/queries/keys.ts`. Two call sites hand-building the same key is exactly
 * what the key factory exists to prevent, and this pass does not own that file.
 */
export function rulesQueryKey(providerId: string) {
  return [...qk.services.all, 'rules', providerId] as const;
}

export interface WeeklyHours {
  /** What is published right now. `undefined` until the query resolves. */
  published: AvailabilityRule[] | undefined;
  /** What the screen is showing: the draft when editing, otherwise the truth. */
  rules: DraftRule[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;

  isDirty: boolean;
  /** Rule key -> why it cannot be saved. */
  problems: Map<string, string>;
  /** Non-blocking observations. Overlapping windows in the same zone. */
  warnings: string[];
  canSave: boolean;

  upsert: (rule: DraftRule) => void;
  remove: (key: string) => void;
  clearWeekday: (weekday: number) => void;
  discard: () => void;

  save: () => void;
  isSaving: boolean;
  saveError: unknown;
  /**
   * True when a save failed **after** the delete half landed — the provider's
   * published hours are gone and the new ones were never written.
   */
  publishedWiped: boolean;
}

/**
 * Weekly hours: the query, the draft, and the save.
 *
 * ## Why there is a draft at all
 *
 * CONVENTIONS §5b says never to copy server data into `useState`, and this does
 * not: `rules` is `draft ?? server`, and `draft` is `null` whenever the user is
 * not mid-edit. There is no `useEffect` mirroring one into the other, so a
 * refetch cannot leave a stale week on screen — it can only replace a week
 * nobody is editing.
 *
 * ## Why the whole week is written at once
 *
 * `replaceAvailabilityRules` is `delete where provider_id = …` followed by
 * `insert`. That is not a transaction. If the insert fails — a check constraint,
 * a dropped connection, an expired token — the delete has already committed and
 * the practitioner is left with **no published hours at all**, which reads to
 * every seeker as "not available" and is invisible from this screen unless it is
 * said out loud. Batching means one exposure per save instead of one per tap,
 * and `publishedWiped` is how the UI says it happened.
 */
export function useWeeklyHours(providerId: string): WeeklyHours {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftRule[] | null>(null);

  const query = useQuery({
    queryKey: rulesQueryKey(providerId),
    queryFn: () => listAvailabilityRules(providerId),
    enabled: providerId.length > 0,
  });

  const published = query.data;

  const publishedDraft = useMemo(
    () => (published === undefined ? [] : sortDraft(draftFromRules(published))),
    [published],
  );

  const rules = draft ?? publishedDraft;

  const problems = useMemo(() => problemsFor(rules), [rules]);
  const warnings = useMemo(() => overlapWarnings(rules), [rules]);
  const isDirty = draft !== null && signatureOf(draft) !== signatureOf(publishedDraft);

  const save = useMutation({
    mutationFn: (next: readonly DraftRule[]) =>
      replaceAvailabilityRules(providerId, rulesPayload(next)),
    // No retry, and deliberately so. The call is idempotent — a second run
    // deletes and re-inserts to the same end state — but an automatic retry
    // would hide the one moment the provider most needs to see: the window in
    // which their hours are deleted and not yet replaced.
    onSuccess: (saved) => {
      queryClient.setQueryData(rulesQueryKey(providerId), saved);
      setDraft(null);
      // Slots, and anything else keyed under ['services'], are now wrong.
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
    },
    onError: () => {
      // Pull the truth back immediately: if the delete landed, the count is now
      // zero and the banner has to be able to say so.
      void queryClient.invalidateQueries({ queryKey: rulesQueryKey(providerId) });
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
    },
  });

  const upsert = useCallback(
    (rule: DraftRule) => {
      setDraft((current) => {
        const base = current ?? publishedDraft;
        const exists = base.some((entry) => entry.key === rule.key);
        return sortDraft(
          exists ? base.map((entry) => (entry.key === rule.key ? rule : entry)) : [...base, rule],
        );
      });
    },
    [publishedDraft],
  );

  const remove = useCallback(
    (key: string) => {
      setDraft((current) => (current ?? publishedDraft).filter((entry) => entry.key !== key));
    },
    [publishedDraft],
  );

  const clearWeekday = useCallback(
    (weekday: number) => {
      setDraft((current) =>
        (current ?? publishedDraft).filter((entry) => entry.weekday !== weekday),
      );
    },
    [publishedDraft],
  );

  const discard = useCallback(() => {
    setDraft(null);
    save.reset();
  }, [save]);

  const canSave = isDirty && problems.size === 0 && !save.isPending;

  return {
    published,
    rules,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),

    isDirty,
    problems,
    warnings,
    canSave,

    upsert,
    remove,
    clearWeekday,
    discard,

    save: () => {
      if (!canSave) return;
      save.mutate(rules);
    },
    isSaving: save.isPending,
    saveError: save.error,
    publishedWiped: save.isError && (published?.length ?? 0) === 0 && rules.length > 0,
  };
}
