'use server';

import { revalidatePath } from 'next/cache';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { addSequence, updateSequence, removeSequence, getSongByUri } from '@/lib/store';
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
  spotifyUri: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true; sequenceId: string } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const song = getSongByUri(spotifyUri);
  if (!song) return { ok: false, error: 'Song not found' };

  const result = addSequence(song.id, {
    startMs,
    endMs,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
  if (!result.ok) return result;

  upsertSequence({
    id: result.sequence.id,
    spotify_user_id: userId,
    spotify_uri: spotifyUri,
    start_ms: startMs,
    end_ms: endMs,
    note: note?.trim() ?? null,
  }).catch((err) => console.error('upsertSequence failed:', err));

  revalidatePath(`/songs/${encodeURIComponent(spotifyUri)}`);
  return { ok: true, sequenceId: result.sequence.id };
}

export async function updateSequenceAction(
  spotifyUri: string,
  sequenceId: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const song = getSongByUri(spotifyUri);
  if (!song) return { ok: false, error: 'Song not found' };

  const result = updateSequence(song.id, sequenceId, {
    startMs,
    endMs,
    ...(note?.trim() ? { note: note.trim() } : { note: undefined }),
  });
  if (!result.ok) return result;

  upsertSequence({
    id: sequenceId,
    spotify_user_id: userId,
    spotify_uri: spotifyUri,
    start_ms: startMs,
    end_ms: endMs,
    note: note?.trim() ?? null,
  }).catch((err) => console.error('upsertSequence (update) failed:', err));

  revalidatePath(`/songs/${encodeURIComponent(spotifyUri)}`);
  return { ok: true };
}

export async function deleteSequenceAction(
  spotifyUri: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireAuth();

  const song = getSongByUri(spotifyUri);
  if (!song) return { ok: false, error: 'Song not found' };

  const result = removeSequence(song.id, sequenceId);
  if (!result.ok) return result;

  deleteSequence(userId, sequenceId)
    .catch((err) => console.error('deleteSequence failed:', err));

  revalidatePath(`/songs/${encodeURIComponent(spotifyUri)}`);
  return { ok: true };
}
