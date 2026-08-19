import { StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/events';
import { Button, Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { EventStatus } from '@/types/database';

import { NoticeCard, type NoticeTone } from './NoticeCard';
import { canPublish, type PublishCheck, type PublishCheckSeverity } from './event-form';

export interface PublishPanelProps {
  status: EventStatus;
  checks: readonly PublishCheck[];
  onPublish: () => void;
  publishing: boolean;
  /** Blocked while the form has unsaved edits — publishing saves nothing. */
  hasUnsavedChanges: boolean;
}

const TONE: Record<PublishCheckSeverity, NoticeTone> = {
  blocker: 'danger',
  warning: 'warning',
  info: 'info',
};

/**
 * Everything the database and the stores will say about publishing, said
 * before the attempt.
 *
 * Publishing is the moment an event becomes buyable, and every failure mode
 * here is one a host would otherwise meet as either a raw check-constraint
 * error or, worse, a customer who could not complete a purchase. So the panel
 * distinguishes three things:
 *
 *   blocker  — a check constraint will reject the row. The button is disabled.
 *   warning  — the write succeeds and the event still will not sell.
 *   info     — nothing to do; stated so an absent control is not a mystery.
 *
 * Warnings never block. `mixed_currency` and the IAP rule are refusals made by
 * `create-checkout` at purchase time, not by the events table, and a host is
 * entitled to publish a page whose tickets are not ready yet.
 */
export function PublishPanel({
  status,
  checks,
  onPublish,
  publishing,
  hasUnsavedChanges,
}: PublishPanelProps) {
  const blockers = checks.filter((check) => check.severity === 'blocker');
  const ready = canPublish(checks);

  if (status === 'published') {
    return (
      <SectionCard title="Live">
        <View style={styles.stack}>
          <Text variant="bodySmall" color="secondary">
            This event is published and can be found in the discovery feed.
          </Text>
          {checks
            .filter((check) => check.severity === 'warning')
            .map((check) => (
              <NoticeCard
                key={check.id}
                tone="warning"
                title={check.title}
                body={check.detail}
                source={check.source}
              />
            ))}
        </View>
      </SectionCard>
    );
  }

  if (status !== 'draft') {
    return (
      <SectionCard title="Publishing">
        <Text variant="bodySmall" color="secondary">
          {status === 'cancelled'
            ? 'This event has been cancelled. Cancelled events cannot be put back on sale from the app.'
            : 'This event is no longer a draft, so it cannot be published again from here.'}
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Publish">
      <View style={styles.stack}>
        <Text variant="bodySmall" color="secondary">
          Publishing makes this event public and its tickets buyable.
        </Text>

        {checks.map((check) => (
          <NoticeCard
            key={check.id}
            tone={TONE[check.severity]}
            title={check.title}
            body={check.detail}
            source={check.source}
          />
        ))}

        {hasUnsavedChanges ? (
          <NoticeCard
            tone="info"
            title="Save your changes first"
            body="These checks read the saved event, so publishing now would go live with what is already stored, not what is on screen."
          />
        ) : null}

        <Button
          label="Publish event"
          fullWidth
          onPress={onPublish}
          loading={publishing}
          disabled={!ready || hasUnsavedChanges}
          accessibilityHint="Makes this event public and its tickets buyable"
        />

        {!ready ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {blockers.length === 1
              ? 'One thing has to be fixed before this can go live.'
              : `${blockers.length} things have to be fixed before this can go live.`}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
  },
});
