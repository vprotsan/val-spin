import 'server-only';
import { loadTagsForUser } from './tags';
import { loadSequencesForUser } from './sequences';
import { addSong, getAllSongs, bulkLoadSequences } from '@/lib/store';
import type { Sequence } from '@/types';

// ── Hydration state ───────────────────────────────────────────────────────────

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

  // ── 1. Tags ────────────────────────────────────────────────────────────────
  const [tags, sequencesByUri] = await Promise.all([
    loadTagsForUser(spotifyUserId),
    loadSequencesForUser(spotifyUserId),
  ]);

  // Merge tags into the store (don't wipe sequences already in memory)
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

  // ── 2. Sequences ───────────────────────────────────────────────────────────
  // Build a spotifyUri → store songId map (includes songs just added above)
  const allSongs = getAllSongs();
  const uriToSongId = new Map(allSongs.map((s) => [s.spotifyUri, s.id]));

  for (const [uri, rows] of sequencesByUri) {
    const songId = uriToSongId.get(uri);
    if (!songId) continue; // sequence for an untagged song — ignore

    const sequences: Sequence[] = rows.map((r) => ({
      id: r.id,
      startMs: r.start_ms,
      endMs: r.end_ms,
      ...(r.note ? { note: r.note } : {}),
    }));
    bulkLoadSequences(songId, sequences);
  }

  globalThis.__storeHydratedForUser = spotifyUserId;
}

/** Call after logout so the next login triggers a fresh hydration. */
export function clearHydrationState(): void {
  globalThis.__storeHydratedForUser = undefined;
}
