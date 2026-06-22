/**
 * In-memory store for the cycling playlist session.
 *
 * State lives in memory for the duration of the server process.
 * No database, no cross-session persistence — per spec §7.
 *
 * The singleton is attached to `globalThis` so it survives Next.js
 * HMR module reloads in development without being reset on every save.
 */

const nanoid = () => crypto.randomUUID();
import type { Cue, Playlist, Segment, Sequence, Song } from '@/types';
import { segmentDurationMs } from '@/types';
import {
  fail,
  OK,
  validateNoOverlap,
  validateSequenceShape,
  type ValidationResult,
} from './validation';

// ── Store shape ───────────────────────────────────────────────────────────────

interface StoreState {
  /** All songs the user has tagged, keyed by song id. */
  songs: Map<string, Song>;
  /** The single class playlist. */
  playlist: Playlist;
}

function createEmptyStore(): StoreState {
  return {
    songs: new Map(),
    playlist: { segments: [] },
  };
}

// ── HMR-safe singleton ────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __cyclingPlaylistStore: StoreState | undefined;
}

function getStore(): StoreState {
  if (!globalThis.__cyclingPlaylistStore) {
    globalThis.__cyclingPlaylistStore = createEmptyStore();
  }
  return globalThis.__cyclingPlaylistStore;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export function getAllSongs(): Song[] {
  return Array.from(getStore().songs.values());
}

export function getSong(id: string): Song | undefined {
  return getStore().songs.get(id);
}

/** Returns songs tagged to the given cue, newest first. */
export function getSongsByCue(cue: Cue): Song[] {
  return getAllSongs()
    .filter((s) => s.cue === cue)
    .sort((a, b) => b.taggedAt - a.taggedAt);
}

/** Returns true if a song with the given Spotify URI is already tagged. */
export function hasSongByUri(spotifyUri: string): boolean {
  for (const song of getStore().songs.values()) {
    if (song.spotifyUri === spotifyUri) return true;
  }
  return false;
}

export function getSongByUri(spotifyUri: string): Song | undefined {
  for (const song of getStore().songs.values()) {
    if (song.spotifyUri === spotifyUri) return song;
  }
  return undefined;
}

export function getPlaylist(): Playlist {
  return getStore().playlist;
}

export function getSegment(segmentId: string): Segment | undefined {
  return getStore().playlist.segments.find((s) => s.id === segmentId);
}

// ── Song mutations ────────────────────────────────────────────────────────────

export interface AddSongInput {
  title: string;
  artist: string;
  durationMs: number;
  spotifyUri: string;
  cue: Cue;
  taggedAt?: number;
}

/**
 * Tag a new song and assign it to a cue.
 * Returns the created Song, or the existing Song if the URI is already tagged.
 */
export function addSong(input: AddSongInput): Song {
  const store = getStore();

  // Deduplicate by Spotify URI
  for (const existing of store.songs.values()) {
    if (existing.spotifyUri === input.spotifyUri) {
      // If the cue changed, update it in-place
      if (existing.cue !== input.cue) {
        const updated: Song = { ...existing, cue: input.cue };
        store.songs.set(existing.id, updated);
        return updated;
      }
      return existing;
    }
  }

  const song: Song = {
    id: nanoid(),
    title: input.title,
    artist: input.artist,
    durationMs: input.durationMs,
    spotifyUri: input.spotifyUri,
    cue: input.cue,
    bpm: null,
    sequences: [],
    taggedAt: input.taggedAt ?? Date.now(),
  };
  store.songs.set(song.id, song);
  return song;
}

/**
 * Reassign a song to a different cue.
 * All sequences are preserved unchanged (they inherit the song's cue).
 */
export function reassignCue(songId: string, newCue: Cue): ValidationResult {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return fail(`Song ${songId} not found`);
  store.songs.set(songId, { ...song, cue: newCue });

  // Also update the cue on any copy of this song that lives inside a playlist segment
  store.playlist.segments = store.playlist.segments.map((seg) => ({
    ...seg,
    songs: seg.songs.map((s) => (s.id === songId ? { ...s, cue: newCue } : s)),
  }));

  return OK;
}

/**
 * Remove a song from the tag library.
 * Also removes it from any playlist segments it appears in.
 */
export function removeSong(songId: string): ValidationResult {
  const store = getStore();
  if (!store.songs.has(songId)) return fail(`Song ${songId} not found`);
  store.songs.delete(songId);

  store.playlist.segments = store.playlist.segments.map((seg) => ({
    ...seg,
    songs: seg.songs.filter((s) => s.id !== songId),
  }));

  return OK;
}

// ── Sequence mutations ────────────────────────────────────────────────────────

export interface AddSequenceInput {
  startMs: number;
  endMs: number;
  note?: string;
}

/**
 * Add a new sequence to a song.
 * Validates shape and non-overlap. Returns the new Sequence on success.
 */
export function addSequence(
  songId: string,
  input: AddSequenceInput,
): { ok: true; sequence: Sequence } | { ok: false; error: string } {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return { ok: false, error: `Song ${songId} not found` };

  const shapeResult = validateSequenceShape(input.startMs, input.endMs);
  if (!shapeResult.ok) return shapeResult;

  const overlapResult = validateNoOverlap(song.sequences, input);
  if (!overlapResult.ok) return overlapResult;

  const sequence: Sequence = {
    id: nanoid(),
    startMs: input.startMs,
    endMs: input.endMs,
    ...(input.note ? { note: input.note } : {}),
  };

  const updatedSequences = [...song.sequences, sequence].sort(
    (a, b) => a.startMs - b.startMs,
  );
  store.songs.set(songId, { ...song, sequences: updatedSequences });
  syncSongIntoPlaylist(store, { ...song, sequences: updatedSequences });

  return { ok: true, sequence };
}

/**
 * Update an existing sequence's startMs, endMs, or note.
 */
export function updateSequence(
  songId: string,
  sequenceId: string,
  updates: Partial<Pick<Sequence, 'startMs' | 'endMs' | 'note'>>,
): ValidationResult {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return fail(`Song ${songId} not found`);

  const idx = song.sequences.findIndex((s) => s.id === sequenceId);
  if (idx === -1) return fail(`Sequence ${sequenceId} not found on song ${songId}`);

  const current = song.sequences[idx];
  const next: Sequence = { ...current, ...updates };

  const shapeResult = validateSequenceShape(next.startMs, next.endMs);
  if (!shapeResult.ok) return shapeResult;

  const overlapResult = validateNoOverlap(song.sequences, next, sequenceId);
  if (!overlapResult.ok) return overlapResult;

  const updatedSequences = song.sequences
    .map((s) => (s.id === sequenceId ? next : s))
    .sort((a, b) => a.startMs - b.startMs);

  store.songs.set(songId, { ...song, sequences: updatedSequences });
  syncSongIntoPlaylist(store, { ...song, sequences: updatedSequences });

  return OK;
}

/**
 * Remove a sequence from a song.
 */
export function removeSequence(songId: string, sequenceId: string): ValidationResult {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return fail(`Song ${songId} not found`);

  if (!song.sequences.find((s) => s.id === sequenceId)) {
    return fail(`Sequence ${sequenceId} not found on song ${songId}`);
  }

  const updatedSong: Song = {
    ...song,
    sequences: song.sequences.filter((s) => s.id !== sequenceId),
  };
  store.songs.set(songId, updatedSong);
  syncSongIntoPlaylist(store, updatedSong);

  return OK;
}

// ── Segment mutations ─────────────────────────────────────────────────────────

/** Append a new segment to the playlist. */
export function addSegment(cue: Cue): Segment {
  const store = getStore();
  const segment: Segment = { id: nanoid(), cue, songs: [] };
  store.playlist.segments = [...store.playlist.segments, segment];
  return segment;
}

/** Remove a segment (and its song list) from the playlist. */
export function removeSegment(segmentId: string): ValidationResult {
  const store = getStore();
  const exists = store.playlist.segments.some((s) => s.id === segmentId);
  if (!exists) return fail(`Segment ${segmentId} not found`);
  store.playlist.segments = store.playlist.segments.filter((s) => s.id !== segmentId);
  return OK;
}

/** Move a segment to a new index within the playlist. */
export function moveSegment(segmentId: string, toIndex: number): ValidationResult {
  const store = getStore();
  const segs = store.playlist.segments;
  const fromIndex = segs.findIndex((s) => s.id === segmentId);
  if (fromIndex === -1) return fail(`Segment ${segmentId} not found`);
  if (toIndex < 0 || toIndex >= segs.length) {
    return fail(`Index ${toIndex} out of range (0–${segs.length - 1})`);
  }
  const reordered = [...segs];
  const [item] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, item);
  store.playlist.segments = reordered;
  return OK;
}

// ── Song-in-segment mutations ─────────────────────────────────────────────────

/**
 * Add a tagged song to a playlist segment.
 * The song must already be in the store (tagged). A song may appear in multiple
 * segments — the spec allows duplicate placements.
 */
export function addSongToSegment(segmentId: string, songId: string): ValidationResult {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return fail(`Song ${songId} not found in library`);

  const segIndex = store.playlist.segments.findIndex((s) => s.id === segmentId);
  if (segIndex === -1) return fail(`Segment ${segmentId} not found`);

  const segment = store.playlist.segments[segIndex];
  const updated: Segment = { ...segment, songs: [...segment.songs, song] };
  store.playlist.segments = store.playlist.segments.map((s) =>
    s.id === segmentId ? updated : s,
  );
  return OK;
}

/** Remove the first occurrence of a song from a segment. */
export function removeSongFromSegment(
  segmentId: string,
  songId: string,
): ValidationResult {
  const store = getStore();
  const segIndex = store.playlist.segments.findIndex((s) => s.id === segmentId);
  if (segIndex === -1) return fail(`Segment ${segmentId} not found`);

  const segment = store.playlist.segments[segIndex];
  const songIndex = segment.songs.findIndex((s) => s.id === songId);
  if (songIndex === -1) return fail(`Song ${songId} not in segment ${segmentId}`);

  const updatedSongs = [...segment.songs];
  updatedSongs.splice(songIndex, 1);
  store.playlist.segments = store.playlist.segments.map((s) =>
    s.id === segmentId ? { ...s, songs: updatedSongs } : s,
  );
  return OK;
}

/** Move a song to a new position within a segment. */
export function moveSongInSegment(
  segmentId: string,
  fromIndex: number,
  toIndex: number,
): ValidationResult {
  const store = getStore();
  const segIndex = store.playlist.segments.findIndex((s) => s.id === segmentId);
  if (segIndex === -1) return fail(`Segment ${segmentId} not found`);

  const segment = store.playlist.segments[segIndex];
  const len = segment.songs.length;
  if (fromIndex < 0 || fromIndex >= len) return fail(`fromIndex ${fromIndex} out of range`);
  if (toIndex < 0 || toIndex >= len) return fail(`toIndex ${toIndex} out of range`);

  const songs = [...segment.songs];
  const [item] = songs.splice(fromIndex, 1);
  songs.splice(toIndex, 0, item);

  store.playlist.segments = store.playlist.segments.map((s) =>
    s.id === segmentId ? { ...s, songs } : s,
  );
  return OK;
}

// ── Derived reads ─────────────────────────────────────────────────────────────

/**
 * Compute total playlist duration in ms (sum of all segment song durations).
 */
export function playlistDurationMs(): number {
  return getPlaylist().segments.reduce((sum, seg) => sum + segmentDurationMs(seg), 0);
}

// ── Bulk hydration ────────────────────────────────────────────────────────────

/**
 * Overwrite a song's sequence list wholesale — used when hydrating from
 * Supabase so we bypass the per-sequence overlap validation (the DB is
 * the source of truth and is assumed to be valid).
 */
/**
 * Replace the entire playlist with pre-built segments — used when hydrating
 * from Supabase so we skip the individual add* calls.
 */
export function bulkLoadPlaylist(segments: Array<{ id: string; cue: Cue; songs: Song[] }>): void {
  const store = getStore();
  store.playlist = {
    segments: segments.map((seg) => ({ id: seg.id, cue: seg.cue, songs: seg.songs })),
  };
}

export function bulkLoadSequences(songId: string, sequences: Sequence[]): void {
  const store = getStore();
  const song = store.songs.get(songId);
  if (!song) return;
  const sorted = [...sequences].sort((a, b) => a.startMs - b.startMs);
  const updated: Song = { ...song, sequences: sorted };
  store.songs.set(songId, updated);
  syncSongIntoPlaylist(store, updated);
}

// ── Reset (useful in tests / dev) ─────────────────────────────────────────────

export function resetStore(): void {
  globalThis.__cyclingPlaylistStore = createEmptyStore();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * After mutating a song in the songs map, propagate the latest version into
 * any playlist segment that holds a copy of that song.
 */
function syncSongIntoPlaylist(store: StoreState, updatedSong: Song): void {
  store.playlist.segments = store.playlist.segments.map((seg) => ({
    ...seg,
    songs: seg.songs.map((s) => (s.id === updatedSong.id ? updatedSong : s)),
  }));
}
