import { useMutation } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { scanTicket, type CheckInResult } from '@/lib/queries/tickets';
import { spacing, useTheme } from '@/theme';

/**
 * Scanning tickets at the door.
 *
 * ## Why this is the most phone-shaped thing in the product
 *
 * It is the one job that cannot be done on a laptop: standing at a door with a
 * queue in front of you, looking at a phone someone is holding up. The old web
 * app solved it by issuing separate "scanner" logins to door staff, because a
 * browser cannot be handed to a volunteer. A host with their own phone does not
 * need any of that.
 *
 * ## What the door actually needs
 *
 * A big, unambiguous answer and nothing else. Someone is waiting, the light is
 * bad, and the host is not reading a paragraph — so the result is a full-width
 * colour block with one line in it. Green means in, amber means already
 * scanned, red means no.
 *
 * "Already used" is amber rather than red on purpose. Double-scanning is the
 * single most common thing that happens on a door — the host is not sure the
 * first one took — and treating it as a failure teaches people to ignore the
 * colour. It says when it was first scanned, which is the fact that settles
 * whether this is a duplicate or a duplicated ticket.
 *
 * ## Guarding against the same code twice
 *
 * A camera fires continuously at the same QR code. Without `lastScanned`, one
 * ticket held up for two seconds becomes forty round trips and the answer
 * flickers. The gate opens again on a different code, or when the host taps to
 * carry on — never on a timer, because a timer would re-scan whatever is still
 * in shot.
 */
export default function CheckInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<CheckInResult | null>(null);
  // Not state: it is read inside the scan callback and must not re-render it.
  const lastScanned = useRef<string | null>(null);

  const scan = useMutation({
    mutationFn: (code: string) => scanTicket(code, id),
    onSuccess: setResult,
  });

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      const code = data.trim();
      if (code === '' || code === lastScanned.current || scan.isPending) return;
      lastScanned.current = code;
      scan.mutate(code);
    },
    [scan],
  );

  const carryOn = () => {
    lastScanned.current = null;
    setResult(null);
    scan.reset();
  };

  if (!permission) {
    // Permissions still loading. A blank screen is right here — asking would
    // be premature and an error would be wrong.
    return <Screen><Stack.Screen options={{ title: 'Check in' }} /></Screen>;
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Check in' }} />
        <View style={styles.gate}>
          <Text variant="h4" heading={1}>
            The camera scans tickets
          </Text>
          <Text variant="body" color="secondary">
            Point it at the QR code on someone&apos;s ticket and it marks them
            arrived. Nothing is recorded or stored.
          </Text>
          <Button
            label={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
            onPress={() => void requestPermission()}
            style={styles.gateAction}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge>
      <Stack.Screen options={{ title: 'Check in', headerBackTitle: 'Back' }} />

      <View style={styles.root}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          // Stops the camera delivering while a result is up: the answer stays
          // on screen until the host dismisses it.
          onBarcodeScanned={result === null ? onScanned : undefined}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          {result === null ? (
            <Card variant="outlined" style={styles.hint}>
              <Text variant="body">
                {scan.isPending ? 'Checking…' : 'Point at a ticket QR code'}
              </Text>
            </Card>
          ) : (
            <ResultBlock result={result} onCarryOn={carryOn} />
          )}

          {scan.isError ? (
            <Card variant="outlined" style={[styles.hint, { borderColor: theme.colors.danger }]}>
              <Text variant="body">Could not check that in. Try again.</Text>
              <Button label="Carry on" variant="secondary" size="sm" onPress={carryOn} />
            </Card>
          ) : null}

          <Button
            label="Done"
            variant="secondary"
            onPress={() => router.back()}
            style={styles.done}
          />
        </View>
      </View>
    </Screen>
  );
}

function ResultBlock({
  result,
  onCarryOn,
}: {
  result: CheckInResult;
  onCarryOn: () => void;
}) {
  const theme = useTheme();

  // One line each. A door is not a place for a paragraph.
  const { tone, headline, detail } = (() => {
    switch (result.status) {
      case 'ok':
        return {
          tone: theme.colors.success,
          headline: result.attendee_name ? `${result.attendee_name} is in` : 'Checked in',
          detail: 'Let them through.',
        };
      case 'already_used':
        return {
          tone: theme.colors.warning,
          headline: 'Already scanned',
          detail: result.checked_in_at
            ? `This ticket was used at ${new Date(result.checked_in_at).toLocaleTimeString()}.`
            : 'This ticket has been used before.',
        };
      case 'wrong_event':
        return {
          tone: theme.colors.danger,
          headline: 'Wrong event',
          detail: 'This ticket is for something else.',
        };
      case 'void':
        return {
          tone: theme.colors.danger,
          headline: 'Cancelled ticket',
          detail: 'This ticket was refunded or cancelled.',
        };
      case 'not_found':
        return {
          tone: theme.colors.danger,
          headline: 'Not a ticket',
          detail: 'That code is not one of ours.',
        };
    }
  })();

  return (
    <Card variant="outlined" style={[styles.result, { borderColor: tone, borderWidth: 2 }]}>
      <Text variant="h3" heading={2} style={{ color: tone }}>
        {headline}
      </Text>
      <Text variant="body" color="secondary">
        {detail}
      </Text>
      <Button label="Scan the next one" onPress={onCarryOn} fullWidth />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
  },
  hint: { alignItems: 'center', gap: spacing.sm },
  result: { gap: spacing.sm },
  done: { alignSelf: 'center' },
  gate: { padding: spacing.md, gap: spacing.sm },
  gateAction: { alignSelf: 'flex-start' },
});
