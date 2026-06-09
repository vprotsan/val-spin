'use server';

import { getSpotifyUserId, getValidAccessToken } from '@/lib/spotify-auth';
import {
  listPlaylistsForUser,
  loadPlaylistById,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  updatePlaylistSegments,
  type PlaylistRow,
  type StoredSegment,
} from '@/lib/db/playlists';
import { loadTagsForUser } from '@/lib/db/tags';
import { loadSequencesForUser } from '@/lib/db/sequences';
import type { Cue, Segment, Song, Sequence } from '@/types';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function auth(): Promise<string> {
  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) throw new Error('Not authenticated');
  return userId;
}

// ── Song resolution helpers ───────────────────────────────────────────────────

type TagRows = Awaited<ReturnType<typeof loadTagsForUser>>;
type SeqMap = Awaited<ReturnType<typeof loadSequencesForUser>>;

function buildSongMap(tags: TagRows, seqsByUri: SeqMap): Map<string, Song> {
  return new Map(
    tags.map((t) => {
      const sequences: Sequence[] = (seqsByUri.get(t.spotify_uri) ?? []).map((r) => ({
        id: r.id,
        startMs: r.start_ms,
        endMs: r.end_ms,
        ...(r.note ? { note: r.note } : {}),
      }));
      const song: Song = {
        // Use spotifyUri as id so it's stable across sessions and avoids
        // dependence on the in-memory store's UUID assignments.
        id: t.spotify_uri,
        title: t.title,
        artist: t.artist,
        durationMs: t.duration_ms,
        spotifyUri: t.spotify_uri,
        cue: t.cue,
        bpm: null,
        sequences,
      };
      return [t.spotify_uri, song];
    }),
  );
}

function resolveStoredSegments(
  stored: StoredSegment[],
  songByUri: Map<string, Song>,
): Segment[] {
  return stored.map((seg) => ({
    id: seg.id,
    cue: seg.cue,
    // Songs whose tag was deleted are silently dropped
    songs: seg.songUris
      .map((uri) => songByUri.get(uri))
      .filter((s): s is Song => s !== undefined),
  }));
}

function compact(segments: Segment[]): StoredSegment[] {
  return segments.map((seg) => ({
    id: seg.id,
    cue: seg.cue,
    songUris: seg.songs.map((s) => s.spotifyUri),
  }));
}

// ── withSegments: load → mutate → save → return ───────────────────────────────

type SegmentsResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; error: string };

async function withSegments(
  playlistId: string,
  fn: (segments: Segment[], songByUri: Map<string, Song>) => Segment[],
): Promise<SegmentsResult> {
  const userId = await auth();
  const [row, tags, seqsByUri] = await Promise.all([
    loadPlaylistById(userId, playlistId),
    loadTagsForUser(userId),
    loadSequencesForUser(userId),
  ]);
  if (!row) return { ok: false, error: 'Playlist not found' };

  const songByUri = buildSongMap(tags, seqsByUri);
  const segments = resolveStoredSegments(row.segments, songByUri);
  const updated = fn(segments, songByUri);
  await updatePlaylistSegments(userId, playlistId, compact(updated));
  return { ok: true, segments: updated };
}

// ── Playlist CRUD ─────────────────────────────────────────────────────────────

export async function listPlaylistsAction(): Promise<PlaylistRow[]> {
  const userId = await auth();
  return listPlaylistsForUser(userId);
}

export async function createPlaylistAction(
  name: string,
): Promise<{ ok: true; playlist: PlaylistRow } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name cannot be empty' };
  const userId = await auth();
  const playlist = await createPlaylist(userId, trimmed);
  return { ok: true, playlist };
}

export async function deletePlaylistAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = await auth();
    await deletePlaylist(userId, id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function renamePlaylistAction(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Name cannot be empty' };
  const userId = await auth();
  await renamePlaylist(userId, id, trimmed);
  return { ok: true };
}

// ── Segment mutations ─────────────────────────────────────────────────────────

export async function spAddSegmentAction(
  playlistId: string,
  cue: Cue,
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs) => [
    ...segs,
    { id: crypto.randomUUID(), cue, songs: [] },
  ]);
}

export async function spRemoveSegmentAction(
  playlistId: string,
  segmentId: string,
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs) =>
    segs.filter((s) => s.id !== segmentId),
  );
}

export async function spMoveSegmentAction(
  playlistId: string,
  segmentId: string,
  direction: 'up' | 'down',
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs) => {
    const idx = segs.findIndex((s) => s.id === segmentId);
    if (idx === -1) return segs;
    const to = direction === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= segs.length) return segs;
    const next = [...segs];
    [next[idx], next[to]] = [next[to], next[idx]];
    return next;
  });
}

export async function spAddSongAction(
  playlistId: string,
  segmentId: string,
  songId: string, // = spotifyUri (song.id and song.spotifyUri are the same in this context)
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs, songByUri) => {
    const song = songByUri.get(songId);
    if (!song) return segs;
    return segs.map((seg) =>
      seg.id === segmentId
        ? { ...seg, songs: [...seg.songs, song] }
        : seg,
    );
  });
}

export async function spRemoveSongAction(
  playlistId: string,
  segmentId: string,
  songIndex: number,
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs) =>
    segs.map((seg) => {
      if (seg.id !== segmentId) return seg;
      const songs = [...seg.songs];
      songs.splice(songIndex, 1);
      return { ...seg, songs };
    }),
  );
}

export async function spMoveSongAction(
  playlistId: string,
  segmentId: string,
  fromIndex: number,
  direction: 'up' | 'down',
): Promise<SegmentsResult> {
  return withSegments(playlistId, (segs) =>
    segs.map((seg) => {
      if (seg.id !== segmentId) return seg;
      const songs = [...seg.songs];
      const to = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (to < 0 || to >= songs.length) return seg;
      [songs[fromIndex], songs[to]] = [songs[to], songs[fromIndex]];
      return { ...seg, songs };
    }),
  );
}
