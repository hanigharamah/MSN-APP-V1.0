import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormError } from '@/components/auth/FormError';
import { Avatar, Button, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { isAppError } from '@/lib/errors';
import { qk } from '@/lib/queries/keys';
import { updateProfile } from '@/lib/queries/profiles';
import { pickAndUploadImage } from '@/lib/queries/uploads';
import { validateDisplayName, validateHandle } from '@/lib/validation';
import { borderWidths, SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import type { Profile, ProfileUpdate } from '@/types/database';

export interface EditProfileSheetProps {
  profile: Profile;
  visible: boolean;
  onClose: () => void;
}

/**
 * Edit your own profile.
 *
 * ## What is deliberately absent
 *
 * There is no control for `is_verified`, `is_certified`, `is_admin`,
 * `is_suspended` or `account_type`. `guard_profile_trust_flags` reverts all of
 * them for non-admins, so a switch here would save cleanly, close cleanly, and
 * change nothing — the worst kind of bug, because the user believes it worked.
 * `account_type` in particular is settable exactly once, at signup, through
 * `raw_user_meta_data`. The footnote at the bottom of the form says so in
 * words, because an absent control explains nothing on its own.
 *
 * It is a `Modal` rather than a route because `src/app/` is routes-only and
 * this pass does not own a `(modal)/profile/edit` file.
 * TODO(agent · profile): promote this to a real route once one exists —
 * a native stack screen gets a back gesture and a shareable path for free.
 */
export function EditProfileSheet({ profile, visible, onClose }: EditProfileSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Mounted only while open, so every open starts from the profile as it
          is now rather than from a draft left over from last time. */}
      {visible ? <EditProfileForm profile={profile} onClose={onClose} /> : null}
    </Modal>
  );
}

function EditProfileForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [website, setWebsite] = useState(profile.website ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [submitted, setSubmitted] = useState(false);

  /**
   * The picture uploads immediately, before Save.
   *
   * Deliberate: the upload is slow and can fail on its own, and holding it
   * until Save would mean one button that either saves six text fields or
   * silently fails on a photograph. Uploading on tap means the person sees the
   * new picture the moment it lands and Save only ever writes a URL.
   *
   * The trade is an orphan in the bucket if they upload and then cancel. That
   * is a few KB of storage against a form that cannot half-fail, and worth it.
   */
  const uploadAvatar = useMutation({
    mutationFn: () =>
      pickAndUploadImage({ bucket: 'avatars', profileId: profile.id, aspect: [1, 1] }),
    onSuccess: (url) => {
      if (url !== null) setAvatarUrl(url);
    },
  });

  const save = useMutation({
    mutationFn: (patch: ProfileUpdate) => updateProfile(profile.id, patch),
    onSuccess: async () => {
      // The header reads `profile` from AuthContext, not from React Query, so
      // both have to be told.
      await refreshProfile();
      void queryClient.invalidateQueries({ queryKey: qk.profiles.all });
      onClose();
    },
  });

  /**
   * `profiles.handle` is a unique citext, so a taken handle comes back as
   * SQLSTATE 23505, which `fromPostgrestError` renders as "That already
   * exists." Over a six-field form that sentence names nothing and suggests
   * nothing — the user cannot tell which field is the problem, let alone that
   * the fix is to pick a different handle. It is the one write on this form
   * that can collide, so it is attributed to the field it came from and the
   * banner is suppressed for it.
   */
  const handleTaken = isAppError(save.error) && save.error.code === '23505';

  const errors = {
    displayName: validateDisplayName(displayName),
    handle: validateHandle(handle) ?? (handleTaken ? 'That handle is taken. Try another one.' : null),
  };
  const showErrors = submitted;

  /**
   * Editing clears a failed save. Leaving the banner up while someone corrects
   * the thing it complained about reads as a retry that already failed —
   * the same contract the auth screens keep.
   */
  function edit(set: (next: string) => void) {
    return (value: string) => {
      set(value);
      if (save.isError) save.reset();
    };
  }

  function handleSave() {
    setSubmitted(true);
    if (errors.displayName !== null || errors.handle !== null) return;

    // Empty optional text goes back as null rather than '' — the columns are
    // nullable and an empty string is a value that sorts and matches.
    const trimmedOrNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

    save.mutate({
      display_name: displayName.trim(),
      handle: trimmedOrNull(handle),
      headline: trimmedOrNull(headline),
      bio: trimmedOrNull(bio),
      city: trimmedOrNull(city),
      website: trimmedOrNull(website),
      avatar_url: avatarUrl,
    });
  }

  return (
    <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === 'ios' ? spacing.md : insets.top + spacing.md,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: borderWidths.hairline,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
        <Text variant="bodyStrong" heading={1}>
          Edit profile
        </Text>
        <Button label="Save" size="sm" onPress={handleSave} loading={save.isPending} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* A taken handle is shown on the Handle field instead — a banner
              saying "that already exists" over six fields names nothing. */}
          {save.isError && !handleTaken ? <FormError error={save.error} /> : null}
          {uploadAvatar.isError ? <FormError error={uploadAvatar.error} /> : null}

          {/* First, because a face is what a seeker actually chooses on and
              because it was the one thing this form could not change at all. */}
          <View style={styles.avatarRow}>
            <Avatar uri={avatarUrl} name={displayName || profile.display_name} size="xl" />
            <View style={styles.avatarActions}>
              <Button
                label={avatarUrl ? 'Change photo' : 'Add a photo'}
                variant="secondary"
                size="sm"
                loading={uploadAvatar.isPending}
                onPress={() => uploadAvatar.mutate()}
              />
              {avatarUrl ? (
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  disabled={uploadAvatar.isPending}
                  onPress={() => setAvatarUrl(null)}
                />
              ) : null}
            </View>
          </View>

          <Input
            label="Name"
            required
            value={displayName}
            onChangeText={edit(setDisplayName)}
            error={showErrors ? (errors.displayName ?? undefined) : undefined}
            autoCapitalize="words"
            textContentType="name"
          />

          <Input
            label="Handle"
            value={handle}
            onChangeText={edit(setHandle)}
            // A taken handle is reported the moment it comes back, not only
            // after the next Save attempt, so `showErrors` does not gate it.
            error={showErrors || handleTaken ? (errors.handle ?? undefined) : undefined}
            hint="Your public @name. Letters, numbers, dots, dashes and underscores."
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Headline"
            value={headline}
            onChangeText={edit(setHeadline)}
            hint="One line under your name — what you offer, in your words."
            maxLength={120}
          />

          <Input
            label="About"
            value={bio}
            onChangeText={edit(setBio)}
            multiline
            numberOfLines={5}
            hint="A fuller introduction. This is what people read before they book."
          />

          <Input label="City" value={city} onChangeText={edit(setCity)} autoCapitalize="words" />

          <Input
            label="Website"
            value={website}
            onChangeText={edit(setWebsite)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text variant="caption" color="muted" style={styles.footnote}>
            Verification, certification and your account type are set by My Source Network and
            cannot be changed here. Get in touch if something looks wrong.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarActions: { gap: spacing.xs, alignItems: 'flex-start' },
  sheet: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  body: {
    gap: spacing.md,
    padding: SCREEN_GUTTER,
  },
  footnote: {
    marginTop: spacing.xs,
  },
});
