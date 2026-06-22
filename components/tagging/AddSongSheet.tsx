'use client';

import { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { tagSong } from '@/app/actions/songs';
import { CUE_TYPES } from '@/types';
import type { Cue } from '@/types';
import type { SpotifyTrack, SpotifyPlaylist } from '@/lib/spotify-api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  defaultCue: Cue;
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

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Trigger ───────────────────────────────────────────────────────────────────

export default function AddSongSheet({ defaultCue, taggedUris }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleTagged = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 py-3.5 text-white font-medium text-base transition-colors active:scale-95"
      >
        <span className="text-xl leading-none">+</span> Add Song
      </button>
      {open && (
        <Sheet defaultCue={defaultCue} taggedUris={taggedUris} onClose={() => setOpen(false)} onTagged={handleTagged} />
      )}
    </>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

type Tab = 'library' | 'playlists' | 'search';

function Sheet({ defaultCue, taggedUris, onClose, onTagged }: Props & { onClose: () => void; onTagged: () => void }) {
  const [tab, setTab] = useState<Tab>('library');

  // ── Library state ──────────────────────────────────────────────────────────
  const [libraryTracks, setLibraryTracks] = useState<SpotifyTrack[] | null>(null);

  // ── Playlists state ────────────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [openPlaylist, setOpenPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[] | null>(null);
  const [playlistError, setPlaylistError] = useState('');

  // ── Search state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const submitSearch = useCallback(() => {
    const q = searchQuery.replace(/[<>&"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return;
    setSubmittedQuery(q);
  }, [searchQuery]);

  // ── Load library on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/spotify/tracks?limit=100')
      .then((r) => r.json())
      .then(({ tracks }) => setLibraryTracks(tracks ?? []))
      .catch(() => setLibraryTracks([]));
  }, []);

  // ── Load playlists when playlists tab is first opened ─────────────────────
  useEffect(() => {
    if (tab !== 'playlists' || playlists !== null) return;
    fetch('/api/spotify/playlists')
      .then((r) => r.json())
      .then(({ playlists: pl }) => setPlaylists(pl ?? []))
      .catch(() => setPlaylists([]));
  }, [tab, playlists]);

  // ── Load playlist tracks when a playlist is opened ─────────────────────────
  useEffect(() => {
    if (!openPlaylist) return;
    setPlaylistTracks(null);
    setPlaylistError('');
    fetch(`/api/spotify/playlist-tracks?id=${encodeURIComponent(openPlaylist.id)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) { setPlaylistError(json.error ?? 'Failed to load tracks'); return; }
        setPlaylistTracks(json.tracks ?? []);
      })
      .catch(() => setPlaylistError('Network error — try again.'));
  }, [openPlaylist]);

  // ── Search on explicit submit ──────────────────────────────────────────────
  useEffect(() => {
    if (!submittedQuery) { setSearchResults([]); setSearchError(''); return; }
    setSearching(true);
    setSearchError('');
    fetch(`/api/spotify/search?q=${encodeURIComponent(submittedQuery)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          const msg = [json.error, json.detail].filter(Boolean).join(' — ');
          setSearchError(msg || `Search failed (${r.status})`);
          setSearchResults([]);
        } else {
          setSearchResults(json.tracks ?? []);
        }
      })
      .catch(() => { setSearchError('Network error — check your connection.'); setSearchResults([]); })
      .finally(() => setSearching(false));
  }, [submittedQuery]);

  // ── Focus search input on tab switch ──────────────────────────────────────
  useEffect(() => {
    if (tab === 'search') setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [tab]);

  // ── Header label (back button when in a playlist) ─────────────────────────
  const headerLeft = openPlaylist ? (
    <button
      onClick={() => { setOpenPlaylist(null); setPlaylistTracks(null); }}
      className="text-zinc-400 hover:text-white text-base transition-colors"
    >
      ← Playlists
    </button>
  ) : (
    <h2 className="text-white font-semibold text-xl">Add Song</h2>
  );

  // ── Derived loading / track list for library & search ─────────────────────
  const isLoading = tab === 'library' ? libraryTracks === null : searching;
  const tracks = tab === 'library' ? (libraryTracks ?? []) : searchResults;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-zinc-800 shrink-0">
        {headerLeft}
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white text-3xl leading-none transition-colors"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Tabs — hidden when inside a playlist */}
      {!openPlaylist && (
        <div className="flex gap-1 px-4 pt-3 pb-1 shrink-0 overflow-x-auto">
          {(['library', 'playlists', 'search'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
                tab === t ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {t === 'library' ? 'My Library' : t === 'playlists' ? 'Playlists' : 'Search Spotify'}
            </button>
          ))}
        </div>
      )}

      {/* Search input */}
      {tab === 'search' && !openPlaylist && (
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

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">

        {/* ── PLAYLISTS TAB: list view ──────────────────────────────────────── */}
        {tab === 'playlists' && !openPlaylist && (
          <>
            {playlists === null && <Skeleton />}
            {playlists !== null && playlists.length === 0 && (
              <p className="text-zinc-500 text-base text-center py-12">No playlists found.</p>
            )}
            {playlists !== null && playlists.length > 0 && (
              <ul className="pt-1">
                {playlists.map((pl) => {
                  const thumb = pl.images?.[0]?.url;
                  return (
                    <li key={pl.id}>
                      <button
                        onClick={() => setOpenPlaylist(pl)}
                        className="w-full flex items-center gap-3 py-3 border-b border-zinc-800/50 text-left hover:bg-zinc-900/40 -mx-4 px-4 transition-colors"
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="w-11 h-11 rounded object-cover shrink-0 bg-zinc-800" />
                        ) : (
                          <div className="w-11 h-11 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600">
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-base font-medium truncate">{pl.name}</p>
                          <p className="text-zinc-400 text-sm truncate">
                            {pl.owner.display_name} · {pl.tracks?.total} tracks
                          </p>
                        </div>
                        <span className="text-zinc-600 text-base shrink-0">→</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* ── PLAYLISTS TAB: tracks drill-down ─────────────────────────────── */}
        {tab === 'playlists' && openPlaylist && (
          <>
            {/* Playlist name as sub-header */}
            <p className="text-zinc-400 text-sm pt-3 pb-1 font-medium">{openPlaylist.name}</p>

            {playlistTracks === null && !playlistError && <Skeleton />}

            {playlistError && (
              <p className="text-red-400 text-base text-center py-12">{playlistError}</p>
            )}

            {playlistTracks !== null && playlistTracks.length === 0 && (
              <p className="text-zinc-500 text-base text-center py-12">This playlist has no tracks.</p>
            )}

            {playlistTracks !== null && playlistTracks.length > 0 && (
              <ul>
                {playlistTracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    defaultCue={defaultCue}
                    currentTag={taggedUris[track.uri]}
                    onTagged={onTagged}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        {/* ── LIBRARY & SEARCH TABS ─────────────────────────────────────────── */}
        {tab !== 'playlists' && (
          <>
            {isLoading && <Skeleton />}

            {!isLoading && tab === 'search' && !searchQuery && (
              <p className="text-zinc-500 text-base text-center py-12">Type to search Spotify</p>
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
                    onTagged={onTagged}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-1 pt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="w-11 h-11 bg-zinc-800 rounded shrink-0 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-zinc-800 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-zinc-800/70 rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── TrackRow ──────────────────────────────────────────────────────────────────

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
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [localTag, setLocalTag] = useState<Cue | undefined>(currentTag);

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
      setLocalTag(cue);
      setExpanded(false);
      onTagged();
    });
  }

  const tag = localTag;

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
          <p className="text-zinc-400 text-sm truncate">
            {artistNames}
            <span className="ml-2 text-zinc-600 tabular-nums">{fmtMs(track.duration_ms)}</span>
          </p>
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-medium transition-colors ${
            tag ? CUE_BTN[tag] : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
        >
          {tag ?? 'Tag'}
        </button>
      </div>

      {expanded && (
        <div className="pl-14 pb-3 border-b border-zinc-800/50 flex flex-wrap gap-2 pt-2">
          {CUE_TYPES.map((cue) => (
            <button
              key={cue}
              onClick={() => handleTag(cue)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                tag === cue ? CUE_SELECTED[cue] : CUE_BTN[cue]
              }`}
            >
              {tag === cue ? '✓ ' : ''}{cue}
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

