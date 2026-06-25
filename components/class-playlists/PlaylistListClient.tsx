'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPlaylistAction, deletePlaylistAction } from '@/app/actions/savedPlaylists';
import type { PlaylistRow, StoredSegment } from '@/lib/db/playlists';

function totalSongCount(segments: StoredSegment[]): number {
  return segments.reduce((n, s) => n + s.songUris.length, 0);
}

function fmtDuration(ms: number): string {
  const totalSecs = Math.round(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function PlaylistListClient({
  initialPlaylists,
  durationsMs,
}: {
  initialPlaylists: PlaylistRow[];
  durationsMs: Record<string, number>;
}) {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<PlaylistRow[]>(initialPlaylists);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Create ──────────────────────────────────────────────────────────────────
  function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createPlaylistAction(trimmed);
      if (result.ok) {
        setPlaylists((prev) => [result.playlist, ...prev]);
        setNewName('');
        setShowCreate(false);
        router.push(`/class-playlists/${result.playlist.id}`);
      }
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    startTransition(async () => {
      const result = await deletePlaylistAction(id);
      if (result.ok) {
        setPlaylists((prev) => prev.filter((p) => p.id !== id));
      }
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-3">
      {/* Playlist cards */}
      {playlists.length === 0 && !showCreate && (
        <p className="text-zinc-600 text-base text-center py-12">
          No class playlists yet. Create one to get started.
        </p>
      )}

      {playlists.map((pl) => {
        const songs = totalSongCount(pl.segments);
        const totalMs = durationsMs[pl.id] ?? 0;
        const isDeleting = deletingId === pl.id;
        return (
          <div
            key={pl.id}
            className={`group rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-all ${isDeleting ? 'opacity-40' : ''}`}
          >
            <button
              onClick={() => router.push(`/class-playlists/${pl.id}`)}
              className="w-full flex items-center gap-4 px-4 py-4 text-left"
              disabled={isDeleting}
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-base truncate">{pl.name}</p>
                <p className="text-zinc-500 text-sm mt-0.5">
                  {songs > 0
                    ? <>{songs} {songs === 1 ? 'song' : 'songs'} &middot; {fmtDuration(totalMs)}</>
                    : 'Empty'}
                </p>
              </div>

              <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors text-xl shrink-0">→</span>
            </button>

            {/* Delete */}
            <div className="border-t border-zinc-800/60 px-4 py-2 flex justify-end">
              <button
                onClick={() => handleDelete(pl.id, pl.name)}
                disabled={isDeleting || isPending}
                className="text-zinc-700 hover:text-red-500 text-sm transition-colors"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        );
      })}

      {/* Create new */}
      {showCreate ? (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <p className="text-zinc-400 text-base font-medium">New class playlist</p>
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            placeholder="e.g. Tuesday Climb Ride"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-base placeholder:text-zinc-600 outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || isPending}
              className="flex-1 rounded-xl bg-white text-black text-base font-semibold py-2.5 disabled:opacity-40 transition-opacity"
            >
              {isPending ? 'Creating…' : 'Create & Open'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); }}
              className="px-4 rounded-xl bg-zinc-800 text-zinc-400 text-base"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 py-4 text-zinc-400 hover:text-white text-base font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl leading-none">+</span> New Class Playlist
        </button>
      )}
    </div>
  );
}
