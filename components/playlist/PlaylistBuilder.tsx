'use client';

import { useState, useTransition, useCallback } from 'react';
import {
  addSegmentAction,
  removeSegmentAction,
  moveSegmentAction,
  addSongToSegmentAction,
  removeSongFromSegmentAction,
  moveSongAction,
} from '@/app/actions/playlist';
import { CUE_TYPES } from '@/types';
import type { Cue, Segment, Song } from '@/types';
import SaveToSpotify from './SaveToSpotify';

// ── Cue colour tokens ─────────────────────────────────────────────────────────

const CUE_HEADER: Record<Cue, string> = {
  Jumps:   'bg-amber-500/15 border-amber-700/40 text-amber-300',
  Climbs:  'bg-emerald-500/15 border-emerald-700/40 text-emerald-300',
  Sprints: 'bg-red-500/15 border-red-700/40 text-red-300',
  Choreo:  'bg-purple-500/15 border-purple-700/40 text-purple-300',
  Flat:    'bg-sky-500/15 border-sky-700/40 text-sky-300',
};
const CUE_BTN: Record<Cue, string> = {
  Jumps:   'bg-amber-500/20 border-amber-600/50 text-amber-300 hover:bg-amber-500/30',
  Climbs:  'bg-emerald-500/20 border-emerald-600/50 text-emerald-300 hover:bg-emerald-500/30',
  Sprints: 'bg-red-500/20 border-red-600/50 text-red-300 hover:bg-red-500/30',
  Choreo:  'bg-purple-500/20 border-purple-600/50 text-purple-300 hover:bg-purple-500/30',
  Flat:    'bg-sky-500/20 border-sky-600/50 text-sky-300 hover:bg-sky-500/30',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function segDuration(seg: Segment): number {
  return seg.songs.reduce((sum, s) => sum + s.durationMs, 0);
}

// ── Root component ────────────────────────────────────────────────────────────

export default function PlaylistBuilder({
  initialSegments,
  songsByCue,
}: {
  initialSegments: Segment[];
  songsByCue: Record<Cue, Song[]>;
}) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [addingCuePicker, setAddingCuePicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);

  // ── Add segment ─────────────────────────────────────────────────────────────
  const handleAddSegment = useCallback((cue: Cue) => {
    setAddingCuePicker(false);
    startTransition(async () => {
      const result = await addSegmentAction(cue);
      if (result.ok) {
        setSegments((prev) => [...prev, result.segment]);
      }
    });
  }, []);

  // ── Remove segment ──────────────────────────────────────────────────────────
  const handleRemoveSegment = useCallback((segmentId: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    startTransition(async () => { await removeSegmentAction(segmentId); });
  }, []);

  // ── Move segment ────────────────────────────────────────────────────────────
  const handleMoveSegment = useCallback((segmentId: string, dir: 'up' | 'down') => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segmentId);
      if (idx === -1) return prev;
      const toIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (toIdx < 0 || toIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[toIdx]] = [next[toIdx], next[idx]];
      return next;
    });
    startTransition(async () => { await moveSegmentAction(segmentId, dir); });
  }, []);

  // ── Add song ────────────────────────────────────────────────────────────────
  const handleAddSong = useCallback((segmentId: string, songId: string) => {
    startTransition(async () => {
      const result = await addSongToSegmentAction(segmentId, songId);
      if (result.ok) {
        setSegments((prev) =>
          prev.map((seg) =>
            seg.id === segmentId
              ? { ...seg, songs: [...seg.songs, result.song] }
              : seg,
          ),
        );
      }
    });
  }, []);

  // ── Remove song ─────────────────────────────────────────────────────────────
  const handleRemoveSong = useCallback((segmentId: string, songId: string, idx: number) => {
    setSegments((prev) =>
      prev.map((seg) => {
        if (seg.id !== segmentId) return seg;
        const songs = [...seg.songs];
        songs.splice(idx, 1);
        return { ...seg, songs };
      }),
    );
    startTransition(async () => { await removeSongFromSegmentAction(segmentId, songId); });
  }, []);

  // ── Move song ───────────────────────────────────────────────────────────────
  const handleMoveSong = useCallback(
    (segmentId: string, songIdx: number, dir: 'up' | 'down') => {
      setSegments((prev) =>
        prev.map((seg) => {
          if (seg.id !== segmentId) return seg;
          const songs = [...seg.songs];
          const toIdx = dir === 'up' ? songIdx - 1 : songIdx + 1;
          if (toIdx < 0 || toIdx >= songs.length) return seg;
          [songs[songIdx], songs[toIdx]] = [songs[toIdx], songs[songIdx]];
          return { ...seg, songs };
        }),
      );
      startTransition(async () => { await moveSongAction(segmentId, songIdx, dir); });
    },
    [],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      {/* Summary */}
      <p className="text-zinc-500 text-xs">
        {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
        {totalMs > 0 && <> &middot; {fmtMs(totalMs)} total</>}
      </p>

      {/* Segment list */}
      {segments.map((seg, segIdx) => (
        <SegmentCard
          key={seg.id}
          segment={seg}
          segIdx={segIdx}
          totalSegments={segments.length}
          availableSongs={songsByCue[seg.cue] ?? []}
          onMoveSegment={handleMoveSegment}
          onRemoveSegment={handleRemoveSegment}
          onAddSong={handleAddSong}
          onRemoveSong={handleRemoveSong}
          onMoveSong={handleMoveSong}
        />
      ))}

      {/* Empty state */}
      {segments.length === 0 && (
        <p className="text-zinc-600 text-sm text-center py-8">
          No segments yet. Add one below to start building your class.
        </p>
      )}

      {/* Add segment */}
      {addingCuePicker ? (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <p className="text-zinc-400 text-sm font-medium">Choose a cue for this segment:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CUE_TYPES.map((cue) => (
              <button
                key={cue}
                onClick={() => handleAddSegment(cue)}
                className={`rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95 ${CUE_BTN[cue]}`}
              >
                {cue}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAddingCuePicker(false)}
            className="text-zinc-500 text-xs w-full text-center pt-1"
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingCuePicker(true)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-zinc-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Add Segment
        </button>
      )}

      {/* Save — reads live segments state so track count stays accurate */}
      <div className="border-t border-zinc-800 pt-4">
        <SaveToSpotify
          totalTracks={segments.reduce((sum, seg) => sum + seg.songs.length, 0)}
        />
      </div>
    </div>
  );
}

// ── SegmentCard ───────────────────────────────────────────────────────────────

function SegmentCard({
  segment,
  segIdx,
  totalSegments,
  availableSongs,
  onMoveSegment,
  onRemoveSegment,
  onAddSong,
  onRemoveSong,
  onMoveSong,
}: {
  segment: Segment;
  segIdx: number;
  totalSegments: number;
  availableSongs: Song[];
  onMoveSegment: (id: string, dir: 'up' | 'down') => void;
  onRemoveSegment: (id: string) => void;
  onAddSong: (segId: string, songId: string) => void;
  onRemoveSong: (segId: string, songId: string, idx: number) => void;
  onMoveSong: (segId: string, idx: number, dir: 'up' | 'down') => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const duration = segDuration(segment);
  // Songs already in this segment (by id+position to allow duplicates)
  const inSegmentIds = new Set(segment.songs.map((s) => s.id));

  return (
    <div className={`rounded-2xl border overflow-hidden ${CUE_HEADER[segment.cue]}`}>
      {/* Segment header */}
      <div className={`flex items-center gap-1 px-3 py-3 border-b ${CUE_HEADER[segment.cue]}`}>
        {/* Up/down for segment */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <MoveBtn
            label="Move segment up"
            disabled={segIdx === 0}
            onClick={() => onMoveSegment(segment.id, 'up')}
          >
            ▲
          </MoveBtn>
          <MoveBtn
            label="Move segment down"
            disabled={segIdx === totalSegments - 1}
            onClick={() => onMoveSegment(segment.id, 'down')}
          >
            ▼
          </MoveBtn>
        </div>

        <span className="flex-1 font-bold text-sm tracking-wide ml-1">{segment.cue}</span>

        {duration > 0 && (
          <span className="text-xs font-medium opacity-70 tabular-nums">{fmtMs(duration)}</span>
        )}

        <button
          onClick={() => onRemoveSegment(segment.id)}
          className="ml-2 shrink-0 opacity-40 hover:opacity-80 text-xl leading-none transition-opacity"
          aria-label="Remove segment"
        >
          ×
        </button>
      </div>

      {/* Songs */}
      <div className="bg-zinc-950/60">
        {segment.songs.map((song, songIdx) => (
          <div
            key={`${song.id}-${songIdx}`}
            className="flex items-center gap-1 px-3 py-2.5 border-b border-zinc-800/60 last:border-0"
          >
            {/* Up/down for song */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <MoveBtn
                label="Move song up"
                disabled={songIdx === 0}
                onClick={() => onMoveSong(segment.id, songIdx, 'up')}
              >
                ▲
              </MoveBtn>
              <MoveBtn
                label="Move song down"
                disabled={songIdx === segment.songs.length - 1}
                onClick={() => onMoveSong(segment.id, songIdx, 'down')}
              >
                ▼
              </MoveBtn>
            </div>

            {/* Song info */}
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-white text-sm font-medium truncate">{song.title}</p>
              <p className="text-zinc-400 text-xs truncate">
                {song.artist}
                <span className="text-zinc-600 ml-2 tabular-nums">{fmtMs(song.durationMs)}</span>
              </p>
            </div>

            {/* Remove */}
            <button
              onClick={() => onRemoveSong(segment.id, song.id, songIdx)}
              className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors text-xl leading-none px-1"
              aria-label="Remove song"
            >
              ×
            </button>
          </div>
        ))}

        {/* No songs yet */}
        {segment.songs.length === 0 && (
          <p className="text-zinc-600 text-xs px-4 py-3">No songs yet.</p>
        )}

        {/* Add song row */}
        <div className="px-3 py-2">
          {showPicker ? (
            <SongPicker
              segmentId={segment.id}
              songs={availableSongs}
              inSegmentIds={inSegmentIds}
              onPick={(songId) => { onAddSong(segment.id, songId); setShowPicker(false); }}
              onClose={() => setShowPicker(false)}
            />
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
            >
              + Add Song
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SongPicker ────────────────────────────────────────────────────────────────

function SongPicker({
  segmentId,
  songs,
  inSegmentIds,
  onPick,
  onClose,
}: {
  segmentId: string;
  songs: Song[];
  inSegmentIds: Set<string>;
  onPick: (songId: string) => void;
  onClose: () => void;
}) {
  if (songs.length === 0) {
    return (
      <div className="py-2 text-center">
        <p className="text-zinc-500 text-xs">
          No songs tagged with this cue yet.{' '}
          <a href="/tagging" className="text-zinc-400 underline">Tag songs →</a>
        </p>
        <button onClick={onClose} className="text-zinc-600 text-xs mt-1">cancel</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
      <div className="max-h-52 overflow-y-auto">
        {songs.map((song) => (
          <button
            key={song.id}
            onClick={() => onPick(song.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/60 last:border-0 text-left hover:bg-zinc-800/60 active:bg-zinc-800 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm truncate">{song.title}</p>
              <p className="text-zinc-400 text-xs truncate">{song.artist}</p>
            </div>
            <span className="text-zinc-600 text-xs tabular-nums shrink-0">
              {fmtMs(song.durationMs)}
            </span>
            {inSegmentIds.has(song.id) && (
              <span className="text-zinc-600 text-xs shrink-0">+1</span>
            )}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="w-full text-center text-zinc-500 text-xs py-2 hover:text-zinc-300 border-t border-zinc-800">
        cancel
      </button>
    </div>
  );
}

// ── MoveBtn ───────────────────────────────────────────────────────────────────
// Touch-target minimum 44×22 px per button, pair is 44×44 combined.

function MoveBtn({
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
      className={`w-7 h-6 flex items-center justify-center rounded text-xs transition-colors
        ${disabled
          ? 'text-zinc-800 cursor-not-allowed'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-700/60 active:scale-95'
        }`}
    >
      {children}
    </button>
  );
}
