'use server';

import { revalidatePath } from 'next/cache';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { addSequence, updateSequence, removeSequence } from '@/lib/store';

async function requireAuth() {
  const t = await getValidAccessToken();
  if (!t) throw new Error('Not authenticated');
}

export async function addSequenceAction(
  songId: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true; sequenceId: string } | { ok: false; error: string }> {
  await requireAuth();
  const result = addSequence(songId, { startMs, endMs, ...(note?.trim() ? { note: note.trim() } : {}) });
  if (result.ok) revalidatePath(`/songs/${songId}`);
  return result.ok ? { ok: true, sequenceId: result.sequence.id } : result;
}

export async function updateSequenceAction(
  songId: string,
  sequenceId: string,
  startMs: number,
  endMs: number,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  const result = updateSequence(songId, sequenceId, {
    startMs,
    endMs,
    ...(note?.trim() ? { note: note.trim() } : { note: undefined }),
  });
  if (result.ok) revalidatePath(`/songs/${songId}`);
  return result;
}

export async function deleteSequenceAction(
  songId: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  const result = removeSequence(songId, sequenceId);
  if (result.ok) revalidatePath(`/songs/${songId}`);
  return result;
}
