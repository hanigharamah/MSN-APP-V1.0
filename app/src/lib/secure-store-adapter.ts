import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage adapter for the Supabase client.
 *
 * ## Why this is not four lines
 *
 * `expo-secure-store` is backed by the iOS Keychain and Android Keystore, and
 * warns above ~2048 bytes per value. A Supabase session is an access JWT plus
 * a refresh token plus the serialised user object — with a few custom claims
 * or a long email it goes past that comfortably. When it does, SecureStore
 * either logs a warning and degrades or throws, and the symptom the user sees
 * is "I get signed out at random", which is miserable to debug.
 *
 * So values are split into fixed-size chunks across numbered keys, with a
 * small manifest at the base key recording how many chunks there are. Reads
 * reassemble; writes rewrite the manifest first so a crash mid-write leaves an
 * unreadable (and therefore discarded) session rather than a silently truncated
 * one.
 *
 * ## Web
 *
 * SecureStore has no web implementation. On web we fall back to
 * `localStorage`, which is what supabase-js would have used anyway. Web is a
 * development convenience here, not a shipping target.
 */

/** Comfortably under SecureStore's 2048-byte warning threshold. */
const CHUNK_SIZE = 1800;

/** Marks a manifest value. Chosen so it cannot collide with a JSON payload. */
const MANIFEST_PREFIX = '__msn_chunked__:';

const isWeb = Platform.OS === 'web';

function chunkKey(key: string, index: number): string {
  // SecureStore keys allow [A-Za-z0-9._-] only.
  return `${key}.part.${index}`;
}

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* quota or private mode — nothing useful to do */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function rawRemove(key: string): Promise<void> {
  if (isWeb) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function parseManifest(value: string): number | null {
  if (!value.startsWith(MANIFEST_PREFIX)) return null;
  const count = Number.parseInt(value.slice(MANIFEST_PREFIX.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

/** Deletes chunk keys from `from` upward until one is missing. */
async function clearChunksFrom(key: string, from: number): Promise<void> {
  // Bounded so a corrupt manifest cannot spin forever. 64 chunks is ~115KB,
  // far more than any plausible session.
  for (let i = from; i < from + 64; i += 1) {
    const existing = await rawGet(chunkKey(key, i));
    if (existing === null) return;
    await rawRemove(chunkKey(key, i));
  }
}

export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await rawGet(key);
    if (head === null) return null;

    const chunkCount = parseManifest(head);
    if (chunkCount === null) return head; // small value, stored inline

    const parts: string[] = [];
    for (let i = 0; i < chunkCount; i += 1) {
      const part = await rawGet(chunkKey(key, i));
      if (part === null) {
        // Partial write or partial wipe. A half-session is worse than none —
        // discard it so supabase-js treats the user as signed out cleanly.
        await this.removeItem(key);
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await clearChunksFrom(key, 0);
      await rawSet(key, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Manifest first: if the process dies mid-write, the next read finds a
    // missing chunk and discards the whole entry rather than reading a
    // truncated token.
    await rawSet(key, `${MANIFEST_PREFIX}${chunks.length}`);
    for (let i = 0; i < chunks.length; i += 1) {
      await rawSet(chunkKey(key, i), chunks[i] as string);
    }
    // Drop any chunks left over from a previously longer value.
    await clearChunksFrom(key, chunks.length);
  },

  async removeItem(key: string): Promise<void> {
    const head = await rawGet(key);
    await rawRemove(key);
    if (head !== null && parseManifest(head) !== null) {
      await clearChunksFrom(key, 0);
    }
  },
};
