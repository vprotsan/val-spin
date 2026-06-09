'use client';

import { useState, useTransition, useCallback } from 'react';
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
import { SegmentCard, CUE_BTN, fmtMs, segDuration } from '@/components/playlist/shared';

/**
 * Editable playlist builder for a specific saved playlist.
 *
 * Unlike PlaylistBuilder (which mirrors an in-memory store), every mutation
 * here goes directly to Supabase via a server action that returns the full
 * updated Segment[] — including freshly-loaded sequences for any newly-added
 * song. Local state is replaced wholesale on each action return.
 */
export default function SavedPlaylistBuilder({
  playlistId,
  initialSegments,
  songsByCue,
}: {
  playlistId: string;
  initialSegments: Segment[];
  songsByCue: Record<Cue, Song[]>;
}) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [addingCuePicker, setAddingCuePicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);

  // Convenience: fire action, replace segments on success
  const sync = useCallback(
    (action: () => Promise<{ ok: true; segments: Segment[] } | { ok: false; error: string }>) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) setSegments(result.segments);
        else console.error('[SavedPlaylistBuilder]', result.error);
      });
    },
    [],
  );

  // ── Add segment ─────────────────────────────────────────────────────────────
  const handleAddSegment = useCallback((cue: Cue) => {
    setAddingCuePicker(false);
    sync(() => spAddSegmentAction(playlistId, cue));
  }, [playlistId, sync]);

  // ── Remove segment ──────────────────────────────────────────────────────────
  const handleRemoveSegment = useCallback((segmentId: string) => {
    sync(() => spRemoveSegmentAction(playlistId, segmentId));
  }, [playlistId, sync]);

  // ── Move segment ────────────────────────────────────────────────────────────
  const handleMoveSegment = useCallback((segmentId: string, dir: 'up' | 'down') => {
    sync(() => spMoveSegmentAction(playlistId, segmentId, dir));
  }, [playlistId, sync]);

  // ── Add song ────────────────────────────────────────────────────────────────
  // Waits for server response so sequences are populated from DB
  const handleAddSong = useCallback((segmentId: string, songId: string) => {
    sync(() => spAddSongAction(playlistId, segmentId, songId));
  }, [playlistId, sync]);

  // ── Remove song ─────────────────────────────────────────────────────────────
  const handleRemoveSong = useCallback(
    (segmentId: string, _songId: string, idx: number) => {
      sync(() => spRemoveSongAction(playlistId, segmentId, idx));
    },
    [playlistId, sync],
  );

  // ── Move song ───────────────────────────────────────────────────────────────
  const handleMoveSong = useCallback(
    (segmentId: string, songIdx: number, dir: 'up' | 'down') => {
      sync(() => spMoveSongAction(playlistId, segmentId, songIdx, dir));
    },
    [playlistId, sync],
  );

  return (
    <div className={`space-y-4 transition-opacity ${isPending ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Summary */}
      <p className="text-zinc-500 text-xs">
        {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
        {totalMs > 0 && <> &middot; {fmtMs(totalMs)} total</>}
        {isPending && <span className="ml-2 text-zinc-600">saving…</span>}
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
    </div>
  );
}
