'use server';

import { revalidatePath } from 'next/cache';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { addSequence, updateSequence, removeSequence, getSong } from '@/lib/store';
import { ensureHydrated } from '@/lib/db/hydrate';
import { upsertSequence, deleteSequence } from '@/lib/db/sequences';

async function requireAuth(): Promise<string> {
  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) throw new Error('Not authenticated');
  await ensureHydrated(userId);
  return userId;
}

export async function addSequenceAction(
  songId: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true; sequenceId: string } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const result = addSequence(songId, {
    startMs,
    endMs,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
  if (!result.ok) return result;

  const song = getSong(songId);
  if (song) {
    upsertSequence({
      id: result.sequence.id,
      spotify_user_id: userId,
      spotify_uri: song.spotifyUri,
      start_ms: startMs,
      end_ms: endMs,
      note: note?.trim() ?? null,
    }).catch((err) => console.error('upsertSequence failed:', err));
  }

  revalidatePath(`/songs/${songId}`);
  return { ok: true, sequenceId: result.sequence.id };
}

export async function updateSequenceAction(
  songId: string,
  sequenceId: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const result = updateSequence(songId, sequenceId, {
    startMs,
    endMs,
    ...(note?.trim() ? { note: note.trim() } : { note: undefined }),
  });
  if (!result.ok) return result;

  const song = getSong(songId);
  if (song) {
    upsertSequence({
      id: sequenceId,
      spotify_user_id: userId,
      spotify_uri: song.spotifyUri,
      start_ms: startMs,
      end_ms: endMs,
      note: note?.trim() ?? null,
    }).catch((err) => console.error('upsertSequence (update) failed:', err));
  }

  revalidatePath(`/songs/${songId}`);
  return { ok: true };
}

export async function deleteSequenceAction(
  songId: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const result = removeSequence(songId, sequenceId);
  if (!result.ok) return result;

  deleteSequence(userId, sequenceId)
    .catch((err) => console.error('deleteSequence failed:', err));

  revalidatePath(`/songs/${songId}`);
  return { ok: true };
}
