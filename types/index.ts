// ── Cue ───────────────────────────────────────────────────────────────────────

export type Cue = 'Jumps' | 'Climbs' | 'Sprints' | 'Choreo' | 'Flat';

export const CUE_TYPES: Cue[] = ['Jumps', 'Climbs', 'Sprints', 'Choreo', 'Flat'];

// ── Sequence ──────────────────────────────────────────────────────────────────
// A labeled time span within a song.
// Cue is NOT stored here — it is always inherited from the parent Song.

export interface Sequence {
  id: string;
  startMs: number; // inclusive
  endMs: number;   // exclusive; must be > startMs
  note?: string;   // optional free-text label
}

// ── Song ──────────────────────────────────────────────────────────────────────

export interface Song {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  spotifyUri: string;
  cue: Cue;
  bpm: number | null; // reserved for future BPM support; always null in v1
  sequences: Sequence[]; // sorted by startMs; non-overlapping invariant enforced by store
}

// ── Segment ───────────────────────────────────────────────────────────────────
// A single step in the class playlist.

export interface Segment {
  id: string;
  cue: Cue;
  songs: Song[]; // ordered list; duplicates allowed (instructor's choice)
}

// totalDuration is computed, never stored
export function segmentDurationMs(segment: Segment): number {
  return segment.songs.reduce((sum, s) => sum + s.durationMs, 0);
}

// ── Playlist ──────────────────────────────────────────────────────────────────

export interface Playlist {
  segments: Segment[]; // ordered sequence of cue-segments that make up the class
}
