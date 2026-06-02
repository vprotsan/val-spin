export type Cue = 'Jumps' | 'Climbs' | 'Sprints' | 'Choreo' | 'Flat';

export const CUE_TYPES: Cue[] = ['Jumps', 'Climbs', 'Sprints', 'Choreo', 'Flat'];

export interface Sequence {
  id: string;
  startMs: number;
  endMs: number;
  note?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  spotifyUri: string;
  cue: Cue;
  bpm: number | null; // reserved for future BPM support; always null in v1
  sequences: Sequence[];
}

export interface Segment {
  id: string;
  cue: Cue;
  songs: Song[];
}

export interface Playlist {
  segments: Segment[];
}

// Derived helper — not stored
export function segmentDurationMs(segment: Segment): number {
  return segment.songs.reduce((sum, s) => sum + s.durationMs, 0);
}
