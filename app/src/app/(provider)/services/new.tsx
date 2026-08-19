import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

import {
  NEW_SERVICE_DRAFT,
  ServiceForm,
  toInsert,
  type ServiceValues,
} from '@/components/provider-tools/services';
import { ErrorState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { AppError } from '@/lib/errors';
import { qk } from '@/lib/queries/keys';
import { createService } from '@/lib/queries/services';
import { spacing } from '@/theme';

/**
 * New service.
 *
 * The insert is a plain client write, unlike orders and bookings: nothing here
 * moves money or holds inventory, `services` has no invariant a client cannot
 * uphold, and RLS (`providers manage own services`) already restricts the row
 * to `provider_id = auth.uid()`. So it goes through `createService` rather than
 * an Edge Function — see CONVENTIONS §5 for where that line is drawn.
 *
 * A created service is active immediately, because `services.is_active`
 * defaults to true. That is stated on the screen: there is no draft state for
 * services the way there is for events, so saving publishes.
 */
export default function NewServiceScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const providerId = session?.user.id ?? '';

  const create = useMutation({
    mutationFn: (values: ServiceValues) => createService(toInsert(values, providerId)),
    onSuccess: (service) => {
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
      // Replace rather than push: going "back" to a blank create form from the
      // service you just made is a way to make it twice.
      router.replace({ pathname: '/(provider)/services/[id]', params: { id: service.id } });
    },
  });

  // Cannot happen behind the auth guard, but the alternative is posting a row
  // with an empty `provider_id` and reading the foreign-key violation.
  if (providerId === '') {
    return (
      <>
        <Stack.Screen options={{ title: 'New service' }} />
        <Screen>
          <ErrorState
            error={new AppError('auth', 'Sign in again to add a service.')}
            title="Signed out"
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'New service' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen scroll safeBottom>
          <Text variant="bodySmall" color="muted" style={styles.intro}>
            Saving puts this on your profile straight away. You can switch it off from Listings
            at any time.
          </Text>

          <ServiceForm
            initial={NEW_SERVICE_DRAFT}
            submitLabel="Create service"
            submitting={create.isPending}
            error={create.error}
            onSubmit={(values) => create.mutate(values)}
            onEdit={() => {
              if (create.isError) create.reset();
            }}
          />
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  intro: {
    marginBottom: spacing.md,
  },
});
