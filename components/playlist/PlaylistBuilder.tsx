'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import {
  addSegmentAction,
  removeSegmentAction,
  moveSegmentAction,
  addSongToSegmentAction,
  removeSongFromSegmentAction,
  moveSongAction,
} from '@/app/actions/playlist';
import type { Cue, Segment, Song } from '@/types';
import SaveToSpotify from './SaveToSpotify';
import { SegmentCard, AddSongEntry, CUE_TAG, OPEN_TAG, fmtMs, segDuration, fillCueGaps } from './shared';

export default function PlaylistBuilder({
  initialSegments,
  songsByCue,
}: {
  initialSegments: Segment[];
  songsByCue: Record<Cue, Song[]>;
}) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [isPending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<'songs' | 'cues'>('songs');

  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);
  const allSongs = useMemo(() => Object.values(songsByCue).flat(), [songsByCue]);
  const placedSongIds = useMemo(
    () => new Set(segments.flatMap((seg) => seg.songs.map((s) => s.id))),
    [segments],
  );

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

  // ── Add song (top-level) ───────────────────────────────────────────────────
  // Finds the existing segment matching the song's cue, or creates one, then
  // adds the song to it — collapses "add segment" + "add song" into one step.
  const handlePickSongTopLevel = useCallback((song: Song) => {
    startTransition(async () => {
      let segmentId = segments.find((s) => s.cue === song.cue)?.id;
      if (!segmentId) {
        const segResult = await addSegmentAction(song.cue);
        if (!segResult.ok) return;
        segmentId = segResult.segment.id;
        setSegments((prev) => [...prev, segResult.segment]);
      }
      const songResult = await addSongToSegmentAction(segmentId, song.id);
      if (songResult.ok) {
        setSegments((prev) =>
          prev.map((seg) =>
            seg.id === segmentId
              ? { ...seg, songs: [...seg.songs, songResult.song] }
              : seg,
          ),
        );
      }
    });
  }, [segments]);

  // ── Cues view ────────────────────────────────────────────────────────────────
  // One row per cue span. Gaps between custom (noted) sequences are filled with
  // a synthetic "Open" span so every moment of every song shows up as a row.
  const flatCues = segments.flatMap((seg) =>
    seg.songs.flatMap((song) =>
      fillCueGaps(song.sequences, song.durationMs).map((span) => ({
        label: span.note,
        cue: seg.cue,
        song,
        durationMs: span.endMs - span.startMs,
        isOpen: span.isOpen,
      }))
    )
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
          {flatCues.map(({ label, cue, song, durationMs, isOpen }, idx) => (
            <div
              key={`${song.id}-${idx}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0"
            >
              <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${CUE_TAG[cue]}`}>{cue}</span>
              {isOpen ? (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${OPEN_TAG}`}>{label}</span>
              ) : (
                <span className="text-white text-base truncate">{label}</span>
              )}
              <span className="text-zinc-600 text-sm tabular-nums shrink-0 ml-auto">
                {fmtMs(durationMs)}
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
          allSongs={allSongs}
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
          No songs yet. Add one below to start building your class.
        </p>
      )}

      {/* Add song — hidden in cues view */}
      {viewMode === 'songs' && (
        <AddSongEntry
          allSongs={allSongs}
          placedIds={placedSongIds}
          onPick={handlePickSongTopLevel}
        />
      )}

      {/* Save to Spotify */}
      <div className="border-t border-zinc-800 pt-4">
        <SaveToSpotify
          totalTracks={segments.reduce((sum, seg) => sum + seg.songs.length, 0)}
        />
      </div>
    </div>
  );
}
