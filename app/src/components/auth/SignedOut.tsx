import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Screen, Text } from '@/components/ui';
import { spacing } from '@/theme';

export interface SignedOutProps {
  /** The screen's own name, shown large. "Inbox", "Bookings", "Profile". */
  screenTitle: string;
  /** What you get by signing in — the offer, not the obstacle. */
  headline: string;
  /** One sentence on what lands here once you do. */
  description: string;
  /** Defaults to "Log in". Profile uses "Log in or sign up". */
  actionLabel?: string;
  /** Rows that work without an account — Get help, Legal. Rendered below. */
  children?: React.ReactNode;
}

/**
 * What a tab shows when nobody is signed in.
 *
 * ## Why these screens exist at all
 *
 * The app used to redirect every unauthenticated launch straight to sign-in, so
 * a first-time user met a login form for a marketplace they had never seen.
 * Discover is now open, which means the other three tabs have to answer for
 * themselves rather than being unreachable.
 *
 * ## The shape, and why it is this shape
 *
 * Each one states what you would find here, then offers the way in. It does NOT
 * say "you must log in" — the tab is not an error, and a person who tapped
 * Messages out of curiosity has done nothing wrong. The screen keeps its own
 * title so the tab still feels like a place, not a redirect that failed.
 *
 * `push`, not `replace`: sign-in arrives over the top and dismisses back to the
 * tab the person was already on, so changing their mind costs one tap and
 * leaves them where they started.
 */
export function SignedOut({
  screenTitle,
  headline,
  description,
  actionLabel = 'Log in',
  children,
}: SignedOutProps) {
  const router = useRouter();
  // These tabs hide their nav bar when signed out, so the large title carries
  // the screen on its own — but the nav bar was also what held the content
  // clear of the status bar and the Dynamic Island. Without this the title
  // renders underneath the clock. `Screen` only owns the bottom inset; the top
  // one normally belongs to the header that is no longer there.
  const insets = useSafeAreaInsets();

  return (
    <Screen scroll>
      <View style={[styles.page, { paddingTop: insets.top + spacing.md }]}>
        <Text variant="h1" heading={1}>
          {screenTitle}
        </Text>

        <View style={styles.pitch}>
          <Text variant="h4" heading={2}>
            {headline}
          </Text>
          <Text variant="body" color="secondary">
            {description}
          </Text>
        </View>

        <Button
          label={actionLabel}
          onPress={() => router.push('/(auth)/sign-in')}
          style={styles.action}
        />

        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  pitch: { gap: spacing.xs },
  // Hugs its content rather than filling the width — a full-bleed button reads
  // as the only thing you may do, and browsing is still available behind it.
  action: { alignSelf: 'flex-start' },
});
