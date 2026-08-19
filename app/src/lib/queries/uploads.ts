import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';

/**
 * Putting a picture somewhere.
 *
 * ## Why this is the first upload in the app
 *
 * The storage buckets, their size limits and their security rules have existed
 * since migration 0007 and nothing ever wrote to them. Every image on screen
 * was a URL typed into a text box or seeded into the database — which meant a
 * practitioner could not set a face, on a marketplace where people choose by
 * face.
 *
 * ## Uploading from React Native
 *
 * `fetch(uri).then(r => r.blob())` is the obvious approach and it produces
 * zero-byte files on Hermes: the Blob is a wrapper around a native handle, not
 * bytes, and supabase-js sends the wrapper. Reading into an `ArrayBuffer`
 * first is what actually transfers the file, so that is what this does and it
 * must stay that way.
 *
 * ## Paths
 *
 * `<profileId>/<name>` — the RLS policies on `storage.objects` are written
 * against the first path segment, so a file that is not under the owner's id
 * is refused. Names are unique per upload rather than fixed: overwriting one
 * key means the CDN and every cached `<Image>` in the app keep showing the old
 * picture, and the person concludes the upload failed.
 */

export type UploadBucket = 'avatars' | 'covers' | 'event-images';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Ask for a picture from the library.
 *
 * Returns null when the person backs out, which is not an error and must not
 * be reported as one. A refused PERMISSION is different and does throw, because
 * that one needs explaining — the app cannot proceed and the reason is not
 * obvious from an empty screen.
 */
export async function pickImage(options?: {
  /** Square for avatars, 16:9 for covers. Omit to let them choose freely. */
  aspect?: [number, number];
}): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new AppError(
      'forbidden',
      permission.canAskAgain
        ? 'My Source Network needs access to your photos to do that.'
        : 'Photo access is off for My Source Network. Turn it on in Settings to add a picture.',
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: options?.aspect,
    // Well under the 5 MB bucket limit at any sensible dimension, and the
    // difference is invisible at the sizes these are displayed at.
    quality: 0.8,
  });

  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

/**
 * Upload an asset and return its public URL.
 *
 * Buckets are public-read (0007), so the returned URL can go straight into
 * `profiles.avatar_url` or `events.cover_url` without signing.
 */
export async function uploadImage(input: {
  bucket: UploadBucket;
  /** Owns the folder. RLS checks this is the first path segment. */
  profileId: string;
  asset: ImagePicker.ImagePickerAsset;
}): Promise<string> {
  const { bucket, profileId, asset } = input;

  const response = await fetch(asset.uri);
  // See the note above: `.blob()` uploads nothing on Hermes.
  const bytes = await response.arrayBuffer();

  if (bytes.byteLength === 0) {
    throw new AppError('unknown', 'That image could not be read. Try choosing it again.');
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new AppError(
      'validation',
      'That image is too large. Pick one under 5 MB, or crop it first.',
    );
  }

  const contentType = asset.mimeType ?? 'image/jpeg';
  const extension = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  // Unique per upload — see the note on caching above. `asset.assetId` is null
  // for a freshly cropped image, so it cannot be the key.
  const name = `${Date.now()}.${extension}`;
  const path = `${profileId}/${name}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new AppError('unknown', `That image could not be uploaded. ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Pick and upload in one step. Null means they backed out. */
export async function pickAndUploadImage(input: {
  bucket: UploadBucket;
  profileId: string;
  aspect?: [number, number];
}): Promise<string | null> {
  const asset = await pickImage({ aspect: input.aspect });
  if (asset === null) return null;
  return uploadImage({ bucket: input.bucket, profileId: input.profileId, asset });
}
