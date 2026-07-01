'use client';

import { useTransition, useCallback, type ReactNode } from 'react';
import {
  spAddSegmentAction,
  spRemoveSegmentAction,
  spMoveSegmentAction,
  spAddSongAction,
  spRemoveSongAction,
  spMoveSongAction,
} from '@/app/actions/savedPlaylists';
import { CUE_TYPES } from '@/types';
import type { Cue, Segment, Song } from '@/types';
import { SegmentCard, CUE_BTN, CUE_TAG, fmtMs, segDuration } from '@/components/playlist/shared';
import { useState } from 'react';

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
  viewMode = 'songs',
}: {
  playlistId: string;
  segments: Segment[];
  onSegmentsChange: (segments: Segment[]) => void;
  songsByCue: Record<Cue, Song[]>;
  isEditing: boolean;
  activeFlatIndex?: number;
  viewMode?: 'songs' | 'cues';
}) {
  const [addingCuePicker, setAddingCuePicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);

  // Close the cue picker when leaving edit mode
  if (!isEditing && addingCuePicker) setAddingCuePicker(false);

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

  const handleAddSegment = useCallback((cue: Cue) => {
    setAddingCuePicker(false);
    sync(() => spAddSegmentAction(playlistId, cue));
  }, [playlistId, sync]);

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

  const flatCues = segments.flatMap((seg) =>
    seg.songs.map((song) => ({ song, cue: seg.cue }))
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
          {flatCues.map(({ song, cue }, idx) => (
            <div
              key={`${song.id}-${idx}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 last:border-0"
            >
              <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0 text-right">{idx + 1}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${CUE_TAG[cue]}`}>
                {cue}
              </span>
              <span className="text-white text-base truncate">{song.title}</span>
              <span className="text-zinc-600 text-sm tabular-nums shrink-0 ml-auto">
                {fmtMs(song.durationMs)}
              </span>
            </div>
          ))}
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
            ? 'No segments yet. Add one below to start building your class.'
            : 'This playlist has no segments yet.'}
        </p>
      )}

      {/* Add segment — edit mode + songs view only */}
      {viewMode === 'songs' && isEditing && (
        addingCuePicker ? (
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
        )
      )}
    </div>
  );
}
