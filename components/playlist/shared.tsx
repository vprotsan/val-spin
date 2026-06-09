'use client';

/**
 * Shared visual components used by both PlaylistBuilder (in-memory store)
 * and SavedPlaylistBuilder (Supabase-direct).
 */

import { useState } from 'react';
import type { Cue, Segment, Song } from '@/types';

// ── Cue colour tokens ─────────────────────────────────────────────────────────

export const CUE_HEADER: Record<Cue, string> = {
  Jumps:   'bg-amber-500/15 border-amber-700/40 text-amber-300',
  Climbs:  'bg-emerald-500/15 border-emerald-700/40 text-emerald-300',
  Sprints: 'bg-red-500/15 border-red-700/40 text-red-300',
  Choreo:  'bg-purple-500/15 border-purple-700/40 text-purple-300',
  Flat:    'bg-sky-500/15 border-sky-700/40 text-sky-300',
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

// ── SongPicker ────────────────────────────────────────────────────────────────

export function SongPicker({
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
      <button
        onClick={onClose}
        className="w-full text-center text-zinc-500 text-xs py-2 hover:text-zinc-300 border-t border-zinc-800"
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
  const inSegmentIds = new Set(segment.songs.map((s) => s.id));

  return (
    <div className={`rounded-2xl border overflow-hidden ${CUE_HEADER[segment.cue]}`}>
      {/* Segment header */}
      <div className={`flex items-center gap-1 px-3 py-3 border-b ${CUE_HEADER[segment.cue]}`}>
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
            className="flex items-start gap-1 px-3 py-2.5 border-b border-zinc-800/60 last:border-0"
          >
            {/* Up/down for song */}
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

            {/* Song info + in-track sequences */}
            <div className="flex-1 min-w-0 ml-1">
              <p className="text-white text-sm font-medium truncate">{song.title}</p>
              <p className="text-zinc-400 text-xs truncate">
                {song.artist}
                <span className="text-zinc-600 ml-2 tabular-nums">{fmtMs(song.durationMs)}</span>
              </p>

              {/* Sequences: start–end · duration · note */}
              {song.sequences.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {song.sequences.map((seq) => {
                    const durSec = Math.round((seq.endMs - seq.startMs) / 1000);
                    const mm = Math.floor(durSec / 60);
                    const ss = String(durSec % 60).padStart(2, '0');
                    return (
                      <p key={seq.id} className="text-zinc-600 text-xs tabular-nums leading-snug">
                        {fmtMs(seq.startMs)}–{fmtMs(seq.endMs)}
                        <span className="text-zinc-700 mx-1">·</span>
                        {mm}:{ss}
                        {seq.note && (
                          <span className="text-zinc-500 ml-2 not-italic font-normal">{seq.note}</span>
                        )}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Remove */}
            <button
              onClick={() => onRemoveSong(segment.id, song.id, songIdx)}
              className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors text-xl leading-none px-1 mt-0.5"
              aria-label="Remove song"
            >
              ×
            </button>
          </div>
        ))}

        {segment.songs.length === 0 && (
          <p className="text-zinc-600 text-xs px-4 py-3">No songs yet.</p>
        )}

        {/* Add song */}
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
