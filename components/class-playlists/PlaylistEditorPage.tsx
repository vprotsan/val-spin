'use client';

/**
 * Client shell for the saved-playlist editor page.
 *
 * Owns:
 *   - isEditing state (toggled by Edit / Done in the header)
 *   - segments state (lifted from SavedPlaylistBuilder so the header subtitle stays live)
 *   - playlist name state (editable inline when isEditing)
 *
 * The server page ([id]/page.tsx) just fetches data and renders this component.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { renamePlaylistAction } from '@/app/actions/savedPlaylists';
import SavedPlaylistBuilder from './SavedPlaylistBuilder';
import PlaylistPlayer from './PlaylistPlayer';
import ThemeToggle from '@/components/ThemeToggle';
import type { Cue, Segment, Song } from '@/types';
import { fmtMs, segDuration } from '../playlist/shared';

export default function PlaylistEditorPage({
  playlistId,
  initialName,
  initialSegments,
  songsByCue,
  savedAt,
}: {
  playlistId: string;
  initialName: string;
  initialSegments: Segment[];
  songsByCue: Record<Cue, Song[]>;
  savedAt: string; // ISO timestamp from Supabase
}) {
  const [isEditing, setIsEditing]       = useState(false);
  const [name, setName]                 = useState(initialName);
  const [segments, setSegments]         = useState<Segment[]>(initialSegments);
  const [activeSongIndex, setActiveSongIndex] = useState(0);
  const [viewMode, setViewMode]         = useState<'songs' | 'cues'>('songs');
  const nameInputRef                    = useRef<HTMLInputElement>(null);

  // Player queue is fixed at page-load time (adding/removing songs requires
  // a reload to reflect in the queue — known v1 limitation).
  const flatSongsForPlayer = useMemo(
    () => initialSegments.flatMap((seg) => seg.songs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally empty — freeze queue at mount
  );

  // ── Header: Edit / Done ────────────────────────────────────────────────────

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    // Small timeout lets React flush the input render before we focus it
    setTimeout(() => {
      nameInputRef.current?.select();
    }, 0);
  }, []);

  const handleDone = useCallback(() => {
    // Blur the name input first so its onBlur save fires if the user hasn't
    // already committed the name
    nameInputRef.current?.blur();
    setIsEditing(false);
  }, []);

  // ── Playlist name editing ──────────────────────────────────────────────────

  const savedNameRef = useRef(initialName); // tracks last-persisted name

  const persistName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      // Revert to the last good name if the field is cleared
      setName(savedNameRef.current);
      return;
    }
    if (trimmed === savedNameRef.current) return; // unchanged
    savedNameRef.current = trimmed;
    setName(trimmed);
    await renamePlaylistAction(playlistId, trimmed);
  }, [playlistId, name]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter')  { nameInputRef.current?.blur(); }
      if (e.key === 'Escape') { setName(savedNameRef.current); nameInputRef.current?.blur(); }
    },
    [],
  );

  // ── Derived subtitle values ────────────────────────────────────────────────
  const totalMs = segments.reduce((sum, s) => sum + segDuration(s), 0);

  return (
    <main className="min-h-screen bg-black pb-[36vh]">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-3 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">

           {/* Back link — hidden in edit mode to reduce noise */}
          {!isEditing && (
            <Link
              href="/class-playlists"
              className="text-zinc-400 hover:text-white text-base transition-colors shrink-0"
            >
              ← 
            </Link>
          )}

          {/* Name + subtitle — fills available width */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={persistName}
                onKeyDown={handleNameKeyDown}
                className="w-full bg-transparent text-2xl font-bold text-white outline-none
                           border-b border-zinc-600 focus:border-white pb-0.5 transition-colors"
                aria-label="Playlist name"
              />
            ) : (
              <div className="flex">
              <h1 className="text-2xl font-bold text-white truncate">{name}</h1>
               <p className="text-zinc-500 text-sm">
                {totalMs > 0 && <> &middot; {fmtMs(totalMs)} total</>}
              </p>
              </div>
            )}


            {/* <p className="text-zinc-500 text-sm mt-0.5">
              {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
              {totalSongs > 0 && (
                <> &middot; {totalSongs} {totalSongs === 1 ? 'song' : 'songs'}</>
              )}
              <span className="ml-2 text-zinc-700">
                · saved {new Date(savedAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            </p> */}
          </div>


          {/* <ThemeToggle /> */}

          {/* Songs / Cues toggle */}
          {!isEditing && segments.length > 0 && (
            <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-700 rounded-full p-0.5 shrink-0">
              <button
                onClick={() => setViewMode('songs')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'songs' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Songs
              </button>
              <button
                onClick={() => setViewMode('cues')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  viewMode === 'cues' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Cues
              </button>
            </div>
          )}

          {/* Edit / Done toggle */}
          {isEditing ? (
            <button
              onClick={handleDone}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-white text-black text-base font-semibold
                         active:scale-95 transition-transform"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleEdit}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700
                         text-zinc-300 hover:text-white text-base font-medium transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto px-4 pt-2">
        <SavedPlaylistBuilder
          playlistId={playlistId}
          segments={segments}
          onSegmentsChange={setSegments}
          songsByCue={songsByCue}
          isEditing={isEditing}
          activeFlatIndex={activeSongIndex}
          viewMode={viewMode}
        />
      </div>

      {/* ── Sticky playback bar ───────────────────────────────────────────── */}
      <PlaylistPlayer songs={flatSongsForPlayer} onCurrentIndexChange={setActiveSongIndex} />
    </main>
  );
}
