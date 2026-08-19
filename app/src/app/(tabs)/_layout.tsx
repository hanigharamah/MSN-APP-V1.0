import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, type Ref } from 'react';
import { Pressable, type View } from 'react-native';

import { useUnreadCounts } from '@/components/messaging';
import { ModeSwitcherSheet, NotificationBell, ProfileTabIcon } from '@/components/profile';
import { LogoMark } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMode } from '@/context/ModeContext';
import { iconSizes, useTheme } from '@/theme';

/**
 * Bottom tab bar.
 *
 * Four destinations, which is the right number: a fifth pushes labels to
 * truncate on small phones, and everything else in this product is reachable
 * from inside one of these.
 *
 *   Discover  browse events, services and practitioners
 *   Bookings  your sessions and tickets, upcoming and past
 *   Messages  conversations
 *   Profile   your account, listings and settings
 *
 * Labels are always shown. Icon-only tab bars test badly with anyone who is not
 * a daily user, and "Bookings" versus "Messages" is not a distinction two
 * glyphs can carry on their own.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  // Mounted here, once, for the whole authenticated session: it owns the single
  // Realtime subscription that keeps every unread counter in the app honest.
  const unread = useUnreadCounts();
  const { session } = useAuth();
  const signedIn = session !== null;

  // The mode switcher lives on the tab bar rather than inside Profile, so its
  // sheet has to be mounted out here alongside the navigator — a sheet rendered
  // by a screen cannot cover the tabs that raised it.
  const { mode, canHost, noteProfileOpened, noteSwitcherOpened } = useMode();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const openSwitcher = () => {
    noteSwitcherOpened();
    setSwitcherOpen(true);
  };

  // Switching mode while standing on the tab that mode is about to hide leaves
  // you on a live screen with no matching tab in the bar — Discover's content
  // under a bar that no longer offers Discover, and nothing highlighted. The
  // route is still valid, so nothing errors; it just looks broken.
  //
  // Only ever moves you off the tab that is disappearing. Any other screen is
  // left alone: someone reading a conversation who switches mode should still
  // be reading that conversation.
  //
  // ## Why segments and not `usePathname()`
  //
  // `usePathname()` strips the group, so `(tabs)/index` and `(admin)/index`
  // BOTH report `/`, and `(tabs)/listings` and `(admin)/listings/index` both
  // report `/listings`. Admin is entered with a push onto the root Stack, so
  // this layout stays mounted underneath and its effect keeps firing against a
  // pathname that is now describing somebody else's screen. The result was
  // that every admin was ejected out of the moderation queue the instant they
  // opened it, and a hosting-mode admin could not reach the dashboard at all.
  //
  // `useSegments()` keeps the group, so the guard can require that the screen
  // being judged is actually one of ours.
  useEffect(() => {
    if (!signedIn) return;
    // expo-router types this as a union of exact tuples, so indexing past the
    // shortest one does not narrow. The runtime value is always a string array.
    const [group, tab] = segments as readonly (string | undefined)[];
    if (group !== '(tabs)') return;

    // Discover is `(tabs)/index`, which has no second segment.
    if (mode === 'hosting' && tab === undefined) {
      router.replace('/(tabs)/listings');
    } else if (mode === 'seeking' && tab === 'listings') {
      router.replace('/(tabs)');
    }
  }, [mode, segments, router, signedIn]);

  return (
    <>
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.accent,
        headerTitleStyle: {
          color: theme.colors.textHeading,
          fontFamily: theme.typography.families.semibold,
          fontSize: theme.typography.sizes.lg,
        },
        headerShadowVisible: false,
        // On every tab, not just Profile. Notifications are the reason a person
        // opens the app; they should not be filed inside an identity screen.
        headerRight: signedIn ? () => <NotificationBell /> : undefined,
        // The brand mark, top-left, on every tab. There is no back button on a
        // tab root, so the slot is empty otherwise — and this is the only thing
        // in the chrome that says which app you are in.
        headerLeft: () => <LogoMark />,
        tabBarActiveTintColor: theme.colors.tabActive,
        tabBarInactiveTintColor: theme.colors.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBackground,
          borderTopColor: theme.colors.tabBorder,
          borderTopWidth: theme.borderWidths.hairline,
        },
        tabBarLabelStyle: {
          fontFamily: theme.typography.families.medium,
          fontSize: theme.typography.sizes.xxs,
        },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Discover',
          // Hidden while hosting — see the Listings screen below. `href: null`
          // removes the tab from the bar without unregistering the route, so
          // every existing link to Discover still resolves; a practitioner who
          // opens an event from a notification while hosting still lands
          // somewhere real.
          href: mode === 'hosting' ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={iconSizes.lg}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="listings"
        options={{
          title: 'Listings',
          headerShown: signedIn,
          // The swap that makes hosting mode mean something. Discover is the
          // one tab that is actively wrong while you are working — you are not
          // shopping — so it is the one that gives up its place. Bookings,
          // Messages and Profile are correct in both modes and stay put.
          href: mode === 'hosting' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={iconSizes.lg}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          headerShown: signedIn,
          title: 'Bookings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={iconSizes.lg}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          headerShown: signedIn,
          title: 'Messages',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              size={iconSizes.lg}
              color={color}
            />
          ),
          // Unread conversations. The count lives in React Query under
          // `qk.conversations.unreadCount`, so the badge and the list read the
          // same cache entry and cannot disagree. Undefined hides the badge —
          // `0` would render an empty bubble.
          //
          // Capped at 99+: the badge is a fixed-width pill anchored to the
          // icon, and a four-digit count runs off the edge of the tab and under
          // the neighbouring one. The spoken label below keeps the real number
          // for anyone who needs it.
          tabBarBadge:
            unread.conversations > 99
              ? '99+'
              : unread.conversations > 0
                ? unread.conversations
                : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.accent,
            color: theme.colors.textOnAccent,
            fontFamily: theme.typography.families.semibold,
            fontSize: theme.typography.sizes.xxs,
          },
          tabBarAccessibilityLabel:
            unread.conversations > 0
              ? `Messages, ${unread.conversations} unread`
              : 'Messages',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          // Signed out this tab is not a profile — there isn't one. Naming it
          // "Log in" tells a first-time user where the way in is without
          // putting a login form in front of everyone at launch.
          // Two different words on purpose, following Airbnb: the TAB says
          // "Log in" because that is what tapping it gets you, while the screen
          // stays "Profile" because that is what the place is. `title` drives
          // both, so the header is set separately.
          title: signedIn ? 'Profile' : 'Log in',
          headerTitle: 'Profile',
          headerShown: signedIn,
          // The ring on the avatar is the only visual carrier of mode, and it
          // is a colour-only cue — purple hosting, green seeking. Nothing in
          // that reaches a screen reader, which would otherwise hear "Profile"
          // in both modes and have no way to tell which half of the app it is
          // standing in. Messages already does this for its unread count.
          tabBarAccessibilityLabel: !signedIn
            ? 'Log in'
            : canHost
              ? mode === 'hosting'
                ? 'Profile, hosting'
                : 'Profile, seeking'
              : 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <ProfileTabIcon color={color} focused={focused} />
          ),
          // Hold to switch mode; tap to open Profile as normal.
          //
          // The long press replaces the press rather than preceding it — React
          // Native suppresses `onPress` once `onLongPress` has fired — so a
          // hold does NOT also navigate. That is deliberate: the switcher is
          // reachable from any tab, and being thrown onto Profile every time
          // you changed mode would undo the point of putting it out here.
          //
          // A seeker keeps the plain button. Nothing is hidden from them; there
          // is simply nothing to switch between, and a gesture that silently
          // does nothing is worse than one that was never offered.
          tabBarButton: signedIn && canHost
            ? (props) => {
                const { onPress, onLongPress: _ignored, ref, ...rest } = props;
                return (
                  <Pressable
                    {...rest}
                    // react-navigation types this ref against its own
                    // PlatformPressable, whose element type is wider than the
                    // View that RN's Pressable resolves to. Same object at
                    // runtime; the cast is the narrowing TS cannot see.
                    ref={ref as Ref<View>}
                    onPress={(event) => {
                      noteProfileOpened();
                      onPress?.(event);
                    }}
                    onLongPress={openSwitcher}
                    // Long press is a motor-skill requirement, so it can never
                    // be the only route. Profile's own "Switch to hosting"
                    // button remains, and this tells a screen reader that the
                    // gesture exists rather than leaving it to be discovered.
                    accessibilityHint="Opens your profile. Double tap and hold to switch between seeking and hosting."
                  />
                );
              }
            : undefined,
        }}
      />
    </Tabs>

    {/* Outside the navigator so it covers the tab bar that raised it. Safe as
        a sibling because a `Modal` portals out of this tree; the coach mark,
        which is a plain positioned View, has to live on the Profile screen
        instead — see ModeHintBubble. */}
    <ModeSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
