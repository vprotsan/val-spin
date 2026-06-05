import 'server-only';
import { loadTagsForUser } from './tags';
import { addSong, getAllSongs, resetStore } from '@/lib/store';

// ── Hydration state ───────────────────────────────────────────────────────────
// Tracked on globalThis so it survives Next.js HMR but resets on server restart.

declare global {
  // eslint-disable-next-line no-var
  var __storeHydratedForUser: string | undefined;
}

/**
 * Ensure the in-memory store is populated from Supabase for this user.
 * Safe to call on every request — re-hydrates only when the server has
 * restarted (flag cleared) or a different user is active.
 */
export async function ensureHydrated(spotifyUserId: string): Promise<void> {
  if (globalThis.__storeHydratedForUser === spotifyUserId) return;

  const tags = await loadTagsForUser(spotifyUserId);

  // Merge with anything already in the store (avoids wiping sequences that
  // were added in this session but not yet persisted).
  const existing = getAllSongs();
  const existingUris = new Set(existing.map((s) => s.spotifyUri));

  for (const tag of tags) {
    if (!existingUris.has(tag.spotify_uri)) {
      addSong({
        title: tag.title,
        artist: tag.artist,
        durationMs: tag.duration_ms,
        spotifyUri: tag.spotify_uri,
        cue: tag.cue,
      });
    }
  }

  globalThis.__storeHydratedForUser = spotifyUserId;
}

/** Call after logout so the next login triggers a fresh hydration. */
export function clearHydrationState(): void {
  globalThis.__storeHydratedForUser = undefined;
}
