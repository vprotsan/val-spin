'use server';

import { revalidatePath } from 'next/cache';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { addSong, removeSong, reassignCue, getSong } from '@/lib/store';
import { ensureHydrated } from '@/lib/db/hydrate';
import { upsertTag, deleteTag } from '@/lib/db/tags';
import type { Cue } from '@/types';

async function requireAuth(): Promise<string> {
  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) throw new Error('Not authenticated');
  await ensureHydrated(userId);
  return userId;
}

export interface TagSongInput {
  spotifyUri: string;
  title: string;
  artist: string;
  durationMs: number;
  cue: Cue;
}

/** Tag a song with a cue. Persists to Supabase and updates the in-memory store. */
export async function tagSong(input: TagSongInput): Promise<void> {
  const userId = await requireAuth();

  addSong(input);

  // Write-through to Supabase (fire in background, don't block UI)
  upsertTag({
    spotify_user_id: userId,
    spotify_uri: input.spotifyUri,
    title: input.title,
    artist: input.artist,
    duration_ms: input.durationMs,
    cue: input.cue,
  }).catch((err) => console.error('upsertTag failed:', err));

  revalidatePath('/tagging');
}

/** Remove a song from the tag library. Deletes from Supabase too. */
export async function untagSong(songId: string): Promise<void> {
  const userId = await requireAuth();

  const song = getSong(songId);
  removeSong(songId);

  if (song) {
    deleteTag(userId, song.spotifyUri)
      .catch((err) => console.error('deleteTag failed:', err));
  }

  revalidatePath('/tagging');
}

/** Reassign a song to a different cue. Updates Supabase cue column. */
export async function changeSongCue(songId: string, newCue: Cue): Promise<void> {
  const userId = await requireAuth();

  reassignCue(songId, newCue);

  const song = getSong(songId);
  if (song) {
    upsertTag({
      spotify_user_id: userId,
      spotify_uri: song.spotifyUri,
      title: song.title,
      artist: song.artist,
      duration_ms: song.durationMs,
      cue: newCue,
    }).catch((err) => console.error('upsertTag (reassign) failed:', err));
  }

  revalidatePath('/tagging');
}
