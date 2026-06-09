'use client';

import { useState, useTransition } from 'react';
import { savePlaylistAction } from '@/app/actions/savePlaylist';

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'success'; playlistUrl: string; name: string; trackCount: number }
  | { status: 'error'; message: string };

export default function SaveToSpotify({ totalTracks }: { totalTracks: number }) {
  const [name, setName] = useState('');
  const [state, setState] = useState<SaveState>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();

  const isBusy = isPending || state.status === 'saving';

  function handleSave() {
    setState({ status: 'saving' });
    startTransition(async () => {
      const result = await savePlaylistAction(name);
      if (result.ok) {
        setState({
          status: 'success',
          playlistUrl: result.playlistUrl,
          name: result.name,
          trackCount: result.trackCount,
        });
      } else {
        setState({ status: 'error', message: result.error });
      }
    });
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (state.status === 'success') {
    return (
      <div className="rounded-2xl border border-emerald-700/50 bg-emerald-950/40 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0">✓</span>
          <div>
            <p className="text-white font-semibold">Saved to Spotify</p>
            <p className="text-emerald-300 text-base mt-0.5">
              &ldquo;{state.name}&rdquo; &middot; {state.trackCount}{' '}
              {state.trackCount === 1 ? 'track' : 'tracks'}
            </p>
          </div>
        </div>
        <a
          href={state.playlistUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 transition-all py-3 text-black font-semibold text-base"
        >
          {/* Spotify logo */}
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Open in Spotify
        </a>
        <button
          onClick={() => setState({ status: 'idle' })}
          className="w-full text-center text-zinc-500 text-sm hover:text-zinc-400 transition-colors"
        >
          Save another version
        </button>
      </div>
    );
  }

  // ── Idle / error / saving ──────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      <p className="text-zinc-300 text-base font-medium">Save to Spotify</p>

      {totalTracks === 0 && (
        <p className="text-zinc-500 text-sm">
          Add songs to your segments before saving.
        </p>
      )}

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (state.status === 'error') setState({ status: 'idle' });
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy) handleSave(); }}
        placeholder="Playlist name…"
        maxLength={100}
        disabled={isBusy}
        className="w-full rounded-xl bg-zinc-800 border border-zinc-700 focus:border-zinc-500 text-white placeholder-zinc-500 px-4 py-2.5 text-base outline-none disabled:opacity-50 transition-colors"
      />

      {/* Error */}
      {state.status === 'error' && (
        <p className="text-red-400 text-sm leading-snug">{state.message}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={isBusy || totalTracks === 0}
        className="w-full flex items-center justify-center gap-2 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 transition-all py-3.5 text-black font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isBusy ? (
          <>
            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Saving…
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Save to Spotify
          </>
        )}
      </button>

      <p className="text-zinc-600 text-sm text-center">
        {totalTracks} {totalTracks === 1 ? 'track' : 'tracks'} &middot; saves as a private playlist
      </p>
    </div>
  );
}
