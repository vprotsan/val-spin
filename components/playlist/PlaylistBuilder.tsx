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
import { SegmentCard, CUE_BTN, CUE_HEADER, CUE_TAG, fmtMs, segDuration } from './shared';

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
  const [viewMode, setViewMode] = useState<'songs' | 'cues'>('songs');

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

  // ── Cues view ────────────────────────────────────────────────────────────────
  const flatCues = segments.flatMap((seg) =>
    seg.songs.map((song) => ({ song, cue: seg.cue }))
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-1 transition-opacity ${isPending ? 'opacity-70' : ''}`}>

      {/* View toggle */}
      {segments.length > 0 && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-full p-1">
            <button
              onClick={() => setViewMode('songs')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'songs'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Songs
            </button>
            <button
              onClick={() => setViewMode('cues')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'cues'
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Cues
            </button>
          </div>
        </div>
      )}

      {/* Cues view */}
      {viewMode === 'cues' && (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          {flatCues.length === 0 && (
            <p className="text-zinc-600 text-sm px-4 py-3 text-center">No songs in playlist yet.</p>
          )}
          {flatCues.map(({ song, cue }, idx) => (
            <div
              key={`${song.id}-${idx}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0"
            >
              <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${CUE_TAG[cue]}`}>
                {cue}
              </span>
              <span className="text-white text-base truncate">
                {song.title}
              </span>
              <span className="text-zinc-600 text-sm tabular-nums shrink-0 ml-auto">
                {fmtMs(song.durationMs)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Segment list */}
      {viewMode === 'songs' && segments.map((seg, segIdx) => (
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
      {segments.length === 0 && viewMode === 'songs' && (
        <p className="text-zinc-600 text-base text-center py-8">
          No segments yet. Add one below to start building your class.
        </p>
      )}

      {/* Add segment — hidden in cues view */}
      {viewMode === 'songs' && (addingCuePicker ? (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <p className="text-zinc-400 text-base font-medium">Choose a cue for this segment:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CUE_TYPES.map((cue) => (
              <button
                key={cue}
                onClick={() => handleAddSegment(cue)}
                className={`rounded-xl border py-3 text-base font-semibold transition-all active:scale-95 ${CUE_BTN[cue]}`}
              >
                {cue}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAddingCuePicker(false)}
            className="text-zinc-500 text-sm w-full text-center pt-1"
          >
            cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingCuePicker(true)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-zinc-400 hover:text-white text-base font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl leading-none">+</span> Add Segment
        </button>
      ))}

      {/* Save to Spotify */}
      <div className="border-t border-zinc-800 pt-4">
        <SaveToSpotify
          totalTracks={segments.reduce((sum, seg) => sum + seg.songs.length, 0)}
        />
      </div>
    </div>
  );
}
