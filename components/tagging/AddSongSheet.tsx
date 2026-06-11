'use client';

import { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { tagSong } from '@/app/actions/songs';
import { CUE_TYPES } from '@/types';
import type { Cue } from '@/types';
import type { SpotifyTrack } from '@/lib/spotify-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  /** The cue currently selected on the tagging page — new tags default to it. */
  defaultCue: Cue;
  /** URIs already tagged, mapped to their cue — so we can show current tag state. */
  taggedUris: Record<string, Cue>;
}

const CUE_BTN: Record<Cue, string> = {
  Jumps:   'bg-amber-500/20 text-amber-300 border-amber-600/50 hover:bg-amber-500/40',
  Climbs:  'bg-emerald-500/20 text-emerald-300 border-emerald-600/50 hover:bg-emerald-500/40',
  Sprints: 'bg-red-500/20 text-red-300 border-red-600/50 hover:bg-red-500/40',
  Choreo:  'bg-purple-500/20 text-purple-300 border-purple-600/50 hover:bg-purple-500/40',
  Flat:    'bg-sky-500/20 text-sky-300 border-sky-600/50 hover:bg-sky-500/40',
};

const CUE_SELECTED: Record<Cue, string> = {
  Jumps:   'bg-amber-500 text-black border-amber-400',
  Climbs:  'bg-emerald-500 text-black border-emerald-400',
  Sprints: 'bg-red-500 text-black border-red-400',
  Choreo:  'bg-purple-500 text-black border-purple-400',
  Flat:    'bg-sky-500 text-black border-sky-400',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AddSongSheet({ defaultCue, taggedUris }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 py-3.5 text-white font-medium text-base transition-colors active:scale-95"
      >
        <span className="text-xl leading-none">+</span> Add Song
      </button>

      {/* Sheet overlay */}
      {open && (
        <Sheet defaultCue={defaultCue} taggedUris={taggedUris} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

function Sheet({
  defaultCue,
  taggedUris,
  onClose,
}: Props & { onClose: () => void }) {
  const [tab, setTab] = useState<'library' | 'search'>('library');
  const [libraryTracks, setLibraryTracks] = useState<SpotifyTrack[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState(''); // only set when user explicitly searches
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const submitSearch = useCallback(() => {
    // Strip HTML characters — iOS autocomplete can inject smart quotes or
    // formatted text that Spotify rejects with 400 "Invalid html".
    const q = searchQuery.replace(/[<>&"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return;
    setSubmittedQuery(q);
  }, [searchQuery]);

  // ── Load library once on mount ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/spotify/tracks?limit=100')
      .then((r) => r.json())
      .then(({ tracks }) => setLibraryTracks(tracks ?? []))
      .catch(() => setLibraryTracks([]));
  }, []);

  // ── Search only when submittedQuery changes (user pressed Enter or tapped Search) ──
  useEffect(() => {
    if (!submittedQuery) { setSearchResults([]); setSearchError(''); return; }
    setSearching(true);
    setSearchError('');
    fetch(`/api/spotify/search?q=${encodeURIComponent(submittedQuery)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          const msg = [json.error, json.detail].filter(Boolean).join(' — ');
          console.error('[search] error:', r.status, json);
          setSearchError(msg || `Search failed (${r.status})`);
          setSearchResults([]);
        } else {
          setSearchResults(json.tracks ?? []);
        }
      })
      .catch(() => {
        setSearchError('Network error — check your connection.');
        setSearchResults([]);
      })
      .finally(() => setSearching(false));
  }, [submittedQuery]);

  // ── Focus search input when tab switches ──────────────────────────────────
  useEffect(() => {
    if (tab === 'search') setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [tab]);

  const tracks = tab === 'library' ? (libraryTracks ?? []) : searchResults;
  const isLoading = tab === 'library' ? libraryTracks === null : searching;

  return (
    /* Full-screen overlay */
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-zinc-800 shrink-0">
        <h2 className="text-white font-semibold text-xl">Add Song</h2>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white text-3xl leading-none transition-colors"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-1 shrink-0">
        {(['library', 'search'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors capitalize ${
              tab === t ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {t === 'library' ? 'My Library' : 'Search Spotify'}
          </button>
        ))}
      </div>

      {/* Search input + button */}
      {tab === 'search' && (
        <div className="px-4 pt-2 pb-1 shrink-0 flex gap-2">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } }}
            placeholder="Artist, song, album…"
            className="flex-1 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-2.5 text-base outline-none focus:border-zinc-500"
          />
          <button
            onClick={submitSearch}
            disabled={!searchQuery.trim() || searching}
            className="shrink-0 rounded-xl bg-white text-black font-semibold text-base px-4 py-2.5 disabled:opacity-40 active:scale-95 transition-all"
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>
      )}

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {isLoading && (
          <div className="space-y-1 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="w-11 h-11 bg-zinc-800 rounded shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-zinc-800 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-zinc-800/70 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && tab === 'search' && !searchQuery && (
          <p className="text-zinc-500 text-base text-center py-12">
            Type to search Spotify
          </p>
        )}

        {!isLoading && tab === 'search' && searchError && (
          <div className="py-12 text-center space-y-2">
            <p className="text-red-400 text-base">{searchError}</p>
            <p className="text-zinc-600 text-sm">Try logging out and back in if this persists.</p>
          </div>
        )}

        {!isLoading && !searchError && tracks.length === 0 && (tab === 'library' || searchQuery) && (
          <p className="text-zinc-500 text-base text-center py-12">
            {tab === 'library' ? 'No saved tracks found.' : 'No results.'}
          </p>
        )}

        {!isLoading && tracks.length > 0 && (
          <ul className="pt-1">
            {tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                defaultCue={defaultCue}
                currentTag={taggedUris[track.uri]}
                onTagged={onClose}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── TrackRow inside the sheet ─────────────────────────────────────────────────

function TrackRow({
  track,
  defaultCue,
  currentTag,
  onTagged,
}: {
  track: SpotifyTrack;
  defaultCue: Cue;
  currentTag: Cue | undefined;
  onTagged: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const thumb =
    track.album.images.find((img) => img.width && img.width <= 64)?.url ??
    track.album.images.at(-1)?.url;
  const artistNames = track.artists.map((a) => a.name).join(', ');

  function handleTag(cue: Cue) {
    startTransition(async () => {
      await tagSong({
        spotifyUri: track.uri,
        title: track.name,
        artist: artistNames,
        durationMs: track.duration_ms,
        cue,
      });
      router.refresh();
      onTagged();
    });
  }

  // One-tap: tag with the default cue immediately
  // Hold/expand: show all 5 cue options
  return (
    <li className={`transition-opacity ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-3 py-3 border-b border-zinc-800/50">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="w-11 h-11 rounded object-cover shrink-0 bg-zinc-800" />
        ) : (
          <div className="w-11 h-11 rounded bg-zinc-800 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-white text-base font-medium truncate">{track.name}</p>
          <p className="text-zinc-400 text-sm truncate">{artistNames}</p>
        </div>

        {/* Current tag badge or expand button */}
        {currentTag ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-medium ${CUE_BTN[currentTag]}`}
          >
            {currentTag}
          </button>
        ) : (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-0.5 text-sm font-medium transition-colors"
          >
            Tag
          </button>
        )}
      </div>

      {/* Expanded cue picker */}
      {expanded && (
        <div className="pl-14 pb-3 border-b border-zinc-800/50 flex flex-wrap gap-2 pt-2">
          {CUE_TYPES.map((cue) => (
            <button
              key={cue}
              onClick={() => handleTag(cue)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors
                ${currentTag === cue ? CUE_SELECTED[cue] : CUE_BTN[cue]}`}
            >
              {currentTag === cue ? '✓ ' : ''}{cue}
            </button>
          ))}
          <button onClick={() => setExpanded(false)} className="text-zinc-500 text-sm px-1">
            cancel
          </button>
        </div>
      )}
    </li>
  );
}
