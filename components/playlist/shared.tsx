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

const CUE_CARD_BORDER: Record<Cue, string> = {
  Jumps:   'border-amber-700/40',
  Climbs:  'border-emerald-700/40',
  Sprints: 'border-red-700/40',
  Choreo:  'border-purple-700/40',
  Flat:    'border-sky-700/40',
};

const CUE_TAG: Record<Cue, string> = {
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
        <p className="text-zinc-500 text-sm">
          No songs tagged with this cue yet.{' '}
          <a href="/tagging" className="text-zinc-400 underline">Tag songs →</a>
        </p>
        <button onClick={onClose} className="text-zinc-600 text-sm mt-1">cancel</button>
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
              <p className="text-white text-base truncate">{song.title}</p>
              <p className="text-zinc-400 text-sm truncate">{song.artist}</p>
            </div>
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
  isEditing = true,
  flatOffset = -1,
  activeFlatIndex = -1,
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
  isEditing?: boolean;
  flatOffset?: number;
  activeFlatIndex?: number;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const duration = segDuration(segment);
  const inSegmentIds = new Set(segment.songs.map((s) => s.id));

  const isSegmentActive =
    flatOffset >= 0 &&
    activeFlatIndex >= flatOffset &&
    activeFlatIndex < flatOffset + segment.songs.length;

  // Close the picker if we leave edit mode while it's open
  if (!isEditing && showPicker) setShowPicker(false);

  return (
    <div className={`rounded-2xl border overflow-hidden ${CUE_CARD_BORDER[segment.cue]} ${isSegmentActive ? 'ring-1 ring-white/20' : ''}`}>
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

        {duration > 0 && (
          <span className="text-sm tabular-nums text-zinc-500">{fmtMs(duration)}</span>
        )}

        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${CUE_TAG[segment.cue]}`}>
          {segment.cue}
        </span>

        {isEditing && (
          <button
            onClick={() => onRemoveSegment(segment.id)}
            className="shrink-0 opacity-40 hover:opacity-80 text-2xl leading-none transition-opacity"
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
            className={`flex items-start px-3 py-2.5 border-b border-zinc-800/60 last:border-0 ${isEditing ? 'gap-1' : ''} ${isSongActive ? 'bg-white/10' : ''}`}
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

            {/* Song info + in-track sequences */}
            <div className={`flex-1 min-w-0 ${isEditing ? 'ml-1' : ''}`}>
              <p className="text-white text-base font-medium truncate">{song.title}</p>
              <p className="text-zinc-400 text-sm truncate">
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
                      <p key={seq.id} className="text-zinc-600 text-sm tabular-nums leading-snug">
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
