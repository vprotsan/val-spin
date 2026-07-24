'use client';

/**
 * Shared visual components used by both PlaylistBuilder (in-memory store)
 * and SavedPlaylistBuilder (Supabase-direct).
 */

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { CUE_TYPES } from '@/types';
import type { Cue, Segment, Sequence, Song } from '@/types';

// ── Cue colour tokens ─────────────────────────────────────────────────────────

export const CUE_HEADER: Record<Cue, string> = {
  Jumps:   'bg-amber-500/15 border-amber-700/40 text-amber-300',
  Climbs:  'bg-emerald-500/15 border-emerald-700/40 text-emerald-300',
  Sprints: 'bg-red-500/15 border-red-700/40 text-red-300',
  Choreo:  'bg-purple-500/15 border-purple-700/40 text-purple-300',
  Flat:    'bg-sky-500/15 border-sky-700/40 text-sky-300',
};

const CUE_CARD_BORDER: Record<Cue, string> = {
  Jumps:   'border-amber-300/40',
  Climbs:  'border-emerald-300/40',
  Sprints: 'border-red-300/40',
  Choreo:  'border-purple-300/40',
  Flat:    'border-sky-300/40',
};

export const CUE_TAG: Record<Cue, string> = {
  Jumps:   'bg-amber-500/20 text-amber-300',
  Climbs:  'bg-emerald-500/20 text-emerald-300',
  Sprints: 'bg-red-500/20 text-red-300',
  Choreo:  'bg-purple-500/20 text-purple-300',
  Flat:    'bg-sky-500/20 text-sky-300',
};

export const CUE_BTN: Record<Cue, string> = {
  Jumps:   'bg-amber-500/20 border-amber-600/50 text-amber-300 hover:bg-amber-500/30',
  Climbs:  'bg-emerald-500/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-500/30',
  Sprints: 'bg-red-500/20 border-red-600/50 text-red-300 hover:bg-red-500/30',
  Choreo:  'bg-purple-500/20 border-purple-600/50 text-purple-300 hover:bg-purple-500/30',
  Flat:    'bg-sky-500/20 border-sky-600/50 text-sky-300 hover:bg-sky-500/30',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function segDuration(seg: Segment): number {
  return seg.songs.reduce((sum, s) => sum + s.durationMs, 0);
}

// ── Cue gap-filling ───────────────────────────────────────────────────────────
// "Open" is a synthetic default cue — never stored — that covers any stretch
// of a song not already covered by a custom (noted) sequence. Custom cues
// always take precedence; Open only fills what's left over.

export const OPEN_CUE_LABEL = 'Open';
export const OPEN_TAG = 'bg-zinc-700/40 text-zinc-400';

export interface CueSpan {
  id: string;
  startMs: number;
  endMs: number;
  note: string;
  isOpen: boolean;
}

export function fillCueGaps(sequences: Sequence[], durationMs: number): CueSpan[] {
  const noted = sequences
    .filter((s) => s.note)
    .slice()
    .sort((a, b) => a.startMs - b.startMs);

  const spans: CueSpan[] = [];
  let cursor = 0;

  for (const seq of noted) {
    if (seq.startMs > cursor) spans.push(openSpan(cursor, seq.startMs));
    spans.push({ id: seq.id, startMs: seq.startMs, endMs: seq.endMs, note: seq.note!, isOpen: false });
    cursor = Math.max(cursor, seq.endMs);
  }

  if (cursor < durationMs) spans.push(openSpan(cursor, durationMs));

  return spans;
}

function openSpan(startMs: number, endMs: number): CueSpan {
  return { id: `open-${startMs}-${endMs}`, startMs, endMs, note: OPEN_CUE_LABEL, isOpen: true };
}

// ── Note options ──────────────────────────────────────────────────────────────
// Single source of truth for the custom-cue note dropdown. Add/rename/recolor
// an option here — every consumer (the tagging dropdown, the player progress
// bar) picks it up automatically. The value ↔ color pairing is permanent: a
// note's color always comes from its value, never from position/order.

export interface NoteOption {
  value: string;
  color: string; // hex — used directly in inline styles and gradient stops
}

export const NOTE_OPTIONS: NoteOption[] = [
  { value: 'Sprint', color: '#f60029' }, // rose
  { value: 'Speed up', color: '#ffad50' }, // rose
  { value: 'Jumps',      color: '#f59e0b' }, // amber
  { value: 'Run',       color: '#cd6707' }, // emerald
  { value: 'Standing Run',       color: '#f9ec00' }, // emerald
  { value: 'Jumps 4 counts',       color: '#f59e0b' }, // emerald
  { value: 'Jumps 2 counts',       color: '#f59e0b' }, // emerald
  { value: 'Jumps 8 counts',       color: '#f59e0b' }, // emerald
  { value: 'Climb',       color: '#ff6f00' }, // emerald
  { value: 'Seated Climb',       color: '#ff6f00' }, // emerald
  { value: 'Standing Climb',       color: '#ff6f00' }, // emerald
  { value: 'Flat',       color: '#09ff26' }, // emerald
  { value: 'Choreo Hands',       color: '#deff09' }, // emerald
  { value: 'Choreo Duck-Up',       color: '#deff09' }, // emerald
  { value: 'Choreo Hands Sides Up-Down',       color: '#deff09' }, // emerald
  { value: 'Choreo',       color: '#deff09' }, // emerald
  { value: 'Freeze',       color: '#ff5b09' }, // emerald
  { value: 'Jog',       color: '#74ff09' }, // emerald
];

// Fallback for sequences with no note, or a note outside the fixed list
// (e.g. legacy freeform text) — matches the progress bar's neutral gap color.
export const DEFAULT_NOTE_COLOR = '#3f3f46'; // zinc-700

export function noteColor(note?: string): string {
  return NOTE_OPTIONS.find((o) => o.value === note)?.color ?? DEFAULT_NOTE_COLOR;
}

// ── MoveBtn ───────────────────────────────────────────────────────────────────

export function MoveBtn({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
        ${disabled
          ? 'text-zinc-800 cursor-not-allowed'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-700/60 active:scale-95'
        }`}
    >
      {children}
    </button>
  );
}

// ── SongPicker ────────────────────────────────────────────────────────────────

export function SongPicker({
  songs,
  allSongs,
  inSegmentIds,
  onPick,
  onClose,
}: {
  segmentId: string;
  songs: Song[];
  allSongs: Song[];
  inSegmentIds: Set<string>;
  onPick: (songId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'cue' | 'all'>('cue');

  const pool = scope === 'all' ? allSongs : songs;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? pool.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    : pool;

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      {/* Search + scope toggle */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or artist…"
          className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white text-sm outline-none focus:border-zinc-500"
        />
        <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full p-0.5 shrink-0">
          <button
            onClick={() => setScope('cue')}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              scope === 'cue' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            This cue
          </button>
          <button
            onClick={() => setScope('all')}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              scope === 'all' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            All tags
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-zinc-500 text-sm px-3 py-3 text-center">
            {pool.length === 0 ? (
              <>
                {scope === 'cue' ? 'No songs tagged with this cue yet.' : 'No tagged songs yet.'}{' '}
                <a href="/tagging" className="text-zinc-400 underline">Tag songs →</a>
              </>
            ) : (
              'No matches.'
            )}
          </p>
        )}
        {filtered.map((song) => (
          <button
            key={song.id}
            onClick={() => onPick(song.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/60 last:border-0 text-left hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-base truncate">{song.title}</p>
              <p className="text-zinc-400 text-sm truncate">{song.artist}</p>
            </div>
            {scope === 'all' && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${CUE_TAG[song.cue]}`}>
                {song.cue}
              </span>
            )}
            <span className="text-zinc-600 text-sm tabular-nums shrink-0">
              {fmtMs(song.durationMs)}
            </span>
            {inSegmentIds.has(song.id) && (
              <span className="text-zinc-600 text-sm shrink-0">+1</span>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full text-center text-zinc-500 text-sm py-2 hover:text-zinc-300 border-t border-zinc-800"
      >
        cancel
      </button>
    </div>
  );
}

// ── AddSongEntry ──────────────────────────────────────────────────────────────
// Top-level "+ Add Song" control shown below the segment list. Lets the
// instructor add a song by picking a cue first (then a song within it) or by
// searching straight across every tagged song, without pre-creating a
// segment. The caller (onPick) is responsible for finding-or-creating the
// matching segment.

export function AddSongEntry({
  allSongs,
  placedIds,
  onPick,
}: {
  allSongs: Song[];
  placedIds: Set<string>;
  onPick: (song: Song) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'byTag' | 'allTags'>('byTag');
  const [pickedCue, setPickedCue] = useState<Cue | null>(null);
  const [query, setQuery] = useState('');

  const close = () => {
    setOpen(false);
    setMode('byTag');
    setPickedCue(null);
    setQuery('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-zinc-400 hover:text-white text-base font-medium transition-colors flex items-center justify-center gap-2"
      >
        <span className="text-xl leading-none">+</span> Add Song
      </button>
    );
  }

  const showCuePicker = mode === 'byTag' && !pickedCue;
  const pool = mode === 'allTags' ? allSongs : allSongs.filter((s) => s.cue === pickedCue);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? pool.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
    : pool;

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-3 space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-full p-0.5 w-fit mx-auto">
        <button
          onClick={() => { setMode('byTag'); setPickedCue(null); setQuery(''); }}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            mode === 'byTag' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          By tag
        </button>
        <button
          onClick={() => { setMode('allTags'); setPickedCue(null); setQuery(''); }}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            mode === 'allTags' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
          }`}
        >
          All tags
        </button>
      </div>

      {showCuePicker ? (
        <div className="space-y-2">
          <p className="text-zinc-400 text-base font-medium text-center">Choose a cue to search within:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CUE_TYPES.map((cue) => (
              <button
                key={cue}
                onClick={() => setPickedCue(cue)}
                className={`rounded-xl border py-3 text-base font-semibold transition-all active:scale-95 ${CUE_BTN[cue]}`}
              >
                {cue}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/60">
            {mode === 'byTag' && (
              <button
                onClick={() => setPickedCue(null)}
                className="text-zinc-500 hover:text-white text-sm shrink-0"
              >
                ← {pickedCue}
              </button>
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or artist…"
              autoFocus
              className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white text-sm outline-none focus:border-zinc-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-zinc-500 text-sm px-3 py-3 text-center">
                {pool.length === 0 ? (
                  <>
                    {mode === 'byTag' ? 'No songs tagged with this cue yet.' : 'No tagged songs yet.'}{' '}
                    <a href="/tagging" className="text-zinc-400 underline">Tag songs →</a>
                  </>
                ) : (
                  'No matches.'
                )}
              </p>
            )}
            {filtered.map((song) => (
              <button
                key={song.id}
                onClick={() => { onPick(song); close(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/60 last:border-0 text-left hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-base truncate">{song.title}</p>
                  <p className="text-zinc-400 text-sm truncate">{song.artist}</p>
                </div>
                {mode === 'allTags' && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${CUE_TAG[song.cue]}`}>
                    {song.cue}
                  </span>
                )}
                <span className="text-zinc-600 text-sm tabular-nums shrink-0">
                  {fmtMs(song.durationMs)}
                </span>
                {placedIds.has(song.id) && (
                  <span className="text-zinc-600 text-sm shrink-0">+1</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={close}
        className="w-full text-center text-zinc-500 text-sm py-1 hover:text-zinc-300"
      >
        cancel
      </button>
    </div>
  );
}

// ── SegmentCard ───────────────────────────────────────────────────────────────

export function SegmentCard({
  segment,
  segIdx,
  totalSegments,
  availableSongs,
  allSongs,
  onMoveSegment,
  onRemoveSegment,
  onAddSong,
  onRemoveSong,
  onMoveSong,
  isEditing = true,
  flatOffset = -1,
  activeFlatIndex = -1,
}: {
  segment: Segment;
  segIdx: number;
  totalSegments: number;
  availableSongs: Song[];
  allSongs: Song[];
  onMoveSegment: (id: string, dir: 'up' | 'down') => void;
  onRemoveSegment: (id: string) => void;
  onAddSong: (segId: string, songId: string) => void;
  onRemoveSong: (segId: string, songId: string, idx: number) => void;
  onMoveSong: (segId: string, idx: number, dir: 'up' | 'down') => void;
  isEditing?: boolean;
  flatOffset?: number;
  activeFlatIndex?: number;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const duration = segDuration(segment);
  const inSegmentIds = new Set(segment.songs.map((s) => s.id));
  const activeSongRef = useRef<HTMLDivElement | null>(null);
  const segmentRef = useRef<HTMLDivElement | null>(null);

  const isSegmentActive =
    flatOffset >= 0 &&
    activeFlatIndex >= flatOffset &&
    activeFlatIndex < flatOffset + segment.songs.length;

  useEffect(() => {
    if (activeFlatIndex < 0 || flatOffset < 0) return;
    const localIdx = activeFlatIndex - flatOffset;
    if (localIdx < 0 || localIdx >= segment.songs.length) return;
    segmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeFlatIndex, flatOffset, segment.songs.length]);

  // Close the picker if we leave edit mode while it's open
  if (!isEditing && showPicker) setShowPicker(false);

  return (
    <div ref={segmentRef} style={isSegmentActive ? { scrollMarginTop: '8rem' } : undefined} className={`rounded-2xl border overflow-hidden ${CUE_CARD_BORDER[segment.cue]} ${isSegmentActive ? 'ring-1 ring-white/20' : ''}`}>
      {/* Tag row — edit controls left, cue tag + duration right */}
      <div className={`flex items-center gap-2 px-3 py-2 ${isSegmentActive ? CUE_HEADER[segment.cue] : ''}`}>
        {isEditing && (
          <div className="flex flex-col gap-0.5 shrink-0">
            <MoveBtn
              label="Move segment up"
              disabled={segIdx === 0}
              onClick={() => onMoveSegment(segment.id, 'up')}
            >▲</MoveBtn>
            <MoveBtn
              label="Move segment down"
              disabled={segIdx === totalSegments - 1}
              onClick={() => onMoveSegment(segment.id, 'down')}
            >▼</MoveBtn>
          </div>
        )}

        <div className="flex-1" />

            {/* {duration > 0 && (
              <span className="text-sm tabular-nums text-zinc-500">{fmtMs(duration)}</span>
            )} */}

            {/* <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${CUE_TAG[segment.cue]}`}>
              {segment.cue}
            </span> */}

            {isEditing && (
              <button
                onClick={() => onRemoveSegment(segment.id)}
                className="text-zinc-600 shrink-0 text-2xl leading-none transition-opacity"
                aria-label="Remove segment"
              >
                ×
              </button>
            )}
          </div>

      {/* Songs */}
      <div className="bg-zinc-950/60">
        {segment.songs.map((song, songIdx) => {
          const isSongActive = flatOffset >= 0 && flatOffset + songIdx === activeFlatIndex;
          return (
          <div
            key={`${song.id}-${songIdx}`}
            ref={isSongActive ? activeSongRef : undefined}
            className={`flex items-start px-3 py-2.5 border-b border-zinc-800/60 last:border-0 ${isEditing ? 'gap-1' : ''} ${isSongActive ? 'bg-white/30' : ''}`}
          >
            {/* Reorder arrows — edit mode only */}
            {isEditing && (
              <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                <MoveBtn
                  label="Move song up"
                  disabled={songIdx === 0}
                  onClick={() => onMoveSong(segment.id, songIdx, 'up')}
                >▲</MoveBtn>
                <MoveBtn
                  label="Move song down"
                  disabled={songIdx === segment.songs.length - 1}
                  onClick={() => onMoveSong(segment.id, songIdx, 'down')}
                >▼</MoveBtn>
              </div>
            )}

            {/* Song info + in-track sequences — tap to open timestamp editor */}
            <Link
              href={`/songs/${encodeURIComponent(song.spotifyUri)}`}
              className={`flex-1 min-w-0 group ${isEditing ? 'ml-1' : ''}`}
            >
              <p className="text-white text-base font-medium truncate group-hover:text-zinc-200">{song.title}</p>
              <p className="text-zinc-400 text-sm truncate">
                {song.artist}
                <span className={`ml-2 tabular-nums ${isSongActive ? 'text-zinc-200' : 'text-zinc-600'}`}>{fmtMs(song.durationMs)}</span>
                {song.sequences.length > 0 && (
                  <span className={`ml-2 ${isSongActive ? 'text-zinc-100' : 'text-zinc-600'}`}>{song.sequences.length} {song.sequences.length === 1 ? 'cue' : 'cues'}</span>
                )}
              </p>
            </Link>

            {/* Delete button — edit mode only */}
            {isEditing && (
              <button
                onClick={() => onRemoveSong(segment.id, song.id, songIdx)}
                className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors text-2xl leading-none px-1 mt-0.5"
                aria-label="Remove song"
              >
                ×
              </button>
            )}
          </div>
          );
        })}

        {segment.songs.length === 0 && (
          <p className="text-zinc-600 text-sm px-4 py-3">No songs yet.</p>
        )}

        {/* Add song row — edit mode only */}
        {isEditing && (
          <div className="px-3 py-2">
            {showPicker ? (
              <SongPicker
                segmentId={segment.id}
                songs={availableSongs}
                allSongs={allSongs}
                inSegmentIds={inSegmentIds}
                onPick={(songId) => { onAddSong(segment.id, songId); setShowPicker(false); }}
                onClose={() => setShowPicker(false)}
              />
            ) : (
              <button
                onClick={() => setShowPicker(true)}
                className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
              >
                + Add Song
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
