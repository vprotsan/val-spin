'use server';

import {
  addSegment,
  removeSegment,
  moveSegment,
  addSongToSegment,
  removeSongFromSegment,
  moveSongInSegment,
  getPlaylist,
  getSong,
} from '@/lib/store';
import { getValidAccessToken } from '@/lib/spotify-auth';
import type { Cue, Segment, Song } from '@/types';
import { OK, fail } from '@/lib/validation';

async function requireAuth() {
  const t = await getValidAccessToken();
  if (!t) throw new Error('Not authenticated');
}

// ── Segments ──────────────────────────────────────────────────────────────────

export async function addSegmentAction(
  cue: Cue,
): Promise<{ ok: true; segment: Segment } | { ok: false; error: string }> {
  await requireAuth();
  const segment = addSegment(cue);
  return { ok: true, segment };
}

export async function removeSegmentAction(segmentId: string) {
  await requireAuth();
  return removeSegment(segmentId);
}

/** Move a segment one step in the given direction. */
export async function moveSegmentAction(
  segmentId: string,
  direction: 'up' | 'down',
) {
  await requireAuth();
  const { segments } = getPlaylist();
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx === -1) return fail('Segment not found');
  const toIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (toIdx < 0 || toIdx >= segments.length) return OK; // already at edge
  return moveSegment(segmentId, toIdx);
}

// ── Songs within segments ─────────────────────────────────────────────────────

export async function addSongToSegmentAction(
  segmentId: string,
  songId: string,
): Promise<{ ok: true; song: Song } | { ok: false; error: string }> {
  await requireAuth();
  const song = getSong(songId);
  if (!song) return { ok: false, error: `Song ${songId} not found` };
  const result = addSongToSegment(segmentId, songId);
  if (!result.ok) return result;
  return { ok: true, song };
}

export async function removeSongFromSegmentAction(
  segmentId: string,
  songId: string,
) {
  await requireAuth();
  return removeSongFromSegment(segmentId, songId);
}

/** Move a song one step in the given direction within its segment. */
export async function moveSongAction(
  segmentId: string,
  songIndex: number,
  direction: 'up' | 'down',
) {
  await requireAuth();
  const segment = getPlaylist().segments.find((s) => s.id === segmentId);
  if (!segment) return fail('Segment not found');
  const toIdx = direction === 'up' ? songIndex - 1 : songIndex + 1;
  if (toIdx < 0 || toIdx >= segment.songs.length) return OK;
  return moveSongInSegment(segmentId, songIndex, toIdx);
}
