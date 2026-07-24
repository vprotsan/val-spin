'use client';

import { useTransition, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  spAddSegmentAction,
  spRemoveSegmentAction,
  spMoveSegmentAction,
  spAddSongAction,
  spRemoveSongAction,
  spMoveSongAction,
} from '@/app/actions/savedPlaylists';
import type { Cue, Segment, Song } from '@/types';
import { SegmentCard, AddSongEntry, CUE_TAG, OPEN_TAG, fmtMs, segDuration, fillCueGaps } from '@/components/playlist/shared';

/**
 * Editable/viewable playlist builder for a specific saved playlist.
 *
 * Segments state lives in the parent (PlaylistEditorPage) so the header
 * subtitle stays in sync. Every mutation persists directly to Supabase and
 * the parent is notified via onSegmentsChange.
 *
 * isEditing controls whether editing controls (arrows, delete, add) are shown.
 */
export default function SavedPlaylistBuilder({
  playlistId,
  segments,
  onSegmentsChange,
  songsByCue,
  isEditing,
  activeFlatIndex = -1,
  activePositionMs = -1,
  viewMode = 'songs',
}: {
  playlistId: string;
  segments: Segment[];
  onSegmentsChange: (segments: Segment[]) => void;
  songsByCue: Record<Cue, Song[]>;
  isEditing: boolean;
  activeFlatIndex?: number;
  activePositionMs?: number;
  viewMode?: 'songs' | 'cues';
}) {
  const [isPending, startTransition] = useTransition();

  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);
  const allSongs = useMemo(() => Object.values(songsByCue).flat(), [songsByCue]);
  const placedSongIds = useMemo(
    () => new Set(segments.flatMap((seg) => seg.songs.map((s) => s.id))),
    [segments],
  );

  // Fire action → notify parent with updated segments on success
  const sync = useCallback(
    (action: () => Promise<{ ok: true; segments: Segment[] } | { ok: false; error: string }>) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) onSegmentsChange(result.segments);
        else console.error('[SavedPlaylistBuilder]', result.error);
      });
    },
    [onSegmentsChange],
  );

  const handleRemoveSegment = useCallback((segmentId: string) => {
    sync(() => spRemoveSegmentAction(playlistId, segmentId));
  }, [playlistId, sync]);

  const handleMoveSegment = useCallback((segmentId: string, dir: 'up' | 'down') => {
    sync(() => spMoveSegmentAction(playlistId, segmentId, dir));
  }, [playlistId, sync]);

  const handleAddSong = useCallback((segmentId: string, songId: string) => {
    sync(() => spAddSongAction(playlistId, segmentId, songId));
  }, [playlistId, sync]);

  const handleRemoveSong = useCallback(
    (segmentId: string, _songId: string, idx: number) => {
      sync(() => spRemoveSongAction(playlistId, segmentId, idx));
    },
    [playlistId, sync],
  );

  const handleMoveSong = useCallback(
    (segmentId: string, songIdx: number, dir: 'up' | 'down') => {
      sync(() => spMoveSongAction(playlistId, segmentId, songIdx, dir));
    },
    [playlistId, sync],
  );

  // ── Add song (top-level) ───────────────────────────────────────────────────
  // Finds the existing segment matching the song's cue, or creates one, then
  // adds the song to it — collapses "add segment" + "add song" into one step.
  const handlePickSongTopLevel = useCallback((song: Song) => {
    startTransition(async () => {
      let segId = segments.find((s) => s.cue === song.cue)?.id;
      if (!segId) {
        const segResult = await spAddSegmentAction(playlistId, song.cue);
        if (!segResult.ok) { console.error('[SavedPlaylistBuilder]', segResult.error); return; }
        onSegmentsChange(segResult.segments);
        segId = segResult.segments[segResult.segments.length - 1].id;
      }
      const songResult = await spAddSongAction(playlistId, segId, song.id);
      if (songResult.ok) onSegmentsChange(songResult.segments);
      else console.error('[SavedPlaylistBuilder]', songResult.error);
    });
  }, [playlistId, segments, onSegmentsChange]);

  // flatIdx matches the flat song ordering used by PlaylistPlayer's queue
  // (segments.flatMap(seg => seg.songs)) so activeFlatIndex lines up here too.
  // Gaps between custom cues are filled with a synthetic "Open" span so every
  // moment of every song shows up as a row.
  let songFlatIdx = -1;
  const flatCues = segments.flatMap((seg) =>
    seg.songs.flatMap((song) => {
      songFlatIdx++;
      const flatIdx = songFlatIdx;
      return fillCueGaps(song.sequences, song.durationMs).map((span) => ({
        label: span.note,
        cue: seg.cue,
        song,
        flatIdx,
        durationMs: span.endMs - span.startMs,
        startMs: span.startMs,
        endMs: span.endMs,
        isOpen: span.isOpen,
      }));
    })
  );

  return (
    <div className={`space-y-1 transition-opacity ${isPending ? 'opacity-60 pointer-events-none' : ''}`}>
      <p className="text-zinc-500 text-sm">
        {isPending && <span className="ml-2 text-zinc-600">saving…</span>}
      </p>

      {/* Cues view */}
      {viewMode === 'cues' && (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          {flatCues.length === 0 && (
            <p className="text-zinc-600 text-sm px-4 py-3 text-center">No songs in playlist yet.</p>
          )}
          {flatCues.map(({ label, cue, song, flatIdx, durationMs, startMs, endMs, isOpen }, idx) => {
            const isActive =
              flatIdx === activeFlatIndex &&
              activePositionMs >= startMs &&
              activePositionMs < endMs;
            return (
              <CueRow
                key={`${song.id}-${idx}`}
                idx={idx}
                label={label}
                cue={cue}
                durationMs={durationMs}
                isActive={isActive}
                isOpen={isOpen}
              />
            );
          })}
        </div>
      )}

      {/* Segment list */}
      {viewMode === 'songs' && segments.reduce<{ els: React.ReactNode[]; offset: number }>(
        ({ els, offset }, seg, segIdx) => {
          els.push(
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
              isEditing={isEditing}
              flatOffset={offset}
              activeFlatIndex={activeFlatIndex}
            />,
          );
          return { els, offset: offset + seg.songs.length };
        },
        { els: [] as ReactNode[], offset: 0 },
      ).els}

      {viewMode === 'songs' && segments.length === 0 && (
        <p className="text-zinc-600 text-base text-center py-8">
          {isEditing
            ? 'No songs yet. Add one below to start building your class.'
            : 'This playlist has no songs yet.'}
        </p>
      )}

      {/* Add song — edit mode + songs view only */}
      {viewMode === 'songs' && isEditing && (
        <AddSongEntry
          allSongs={allSongs}
          placedIds={placedSongIds}
          onPick={handlePickSongTopLevel}
        />
      )}
    </div>
  );
}

// ── CueRow ────────────────────────────────────────────────────────────────────
// Scrolls itself into view and gets a strong highlight the moment it becomes
// the active (currently playing) cue — mirrors the highlight treatment used
// for the active song row in the Songs view (see shared.tsx SegmentCard).

function CueRow({
  idx,
  label,
  cue,
  durationMs,
  isActive,
  isOpen,
}: {
  idx: number;
  label: string;
  cue: Cue;
  durationMs: number;
  isActive: boolean;
  isOpen: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isActive]);

  return (
    <div
      ref={rowRef}
      style={isActive ? { scrollMarginTop: '8rem', scrollMarginBottom: '8rem' } : undefined}
      className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0 transition-colors ${
        isActive ? 'bg-white/30' : ''
      }`}
    >
      <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${CUE_TAG[cue]}`}>{cue}</span>
      {isOpen ? (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${OPEN_TAG}`}>{label}</span>
      ) : (
        <span className={`text-base truncate ${isActive ? 'text-white font-semibold' : 'text-white'}`}>{label}</span>
      )}
      <span className={`text-sm tabular-nums shrink-0 ml-auto ${isActive ? 'text-zinc-100' : 'text-zinc-600'}`}>
        {fmtMs(durationMs)}
      </span>
    </div>
  );
}
