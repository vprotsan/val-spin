'use client';

import { useState, useTransition } from 'react';
import { tagSong } from '@/app/actions/songs';
import { CUE_TYPES } from '@/types';
import type { Cue } from '@/types';
import type { SpotifyTrack } from '@/lib/spotify-api';

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

export default function PlaylistTrackRow({
  track,
  initialTag,
}: {
  track: SpotifyTrack;
  initialTag: Cue | undefined;
}) {
  const [currentTag, setCurrentTag] = useState<Cue | undefined>(initialTag);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const artistNames = track.artists.map((a) => a.name).join(', ');
  const thumb =
    track.album.images.find((img) => img.width && img.width <= 64)?.url ??
    track.album.images.at(-1)?.url;

  function handleTag(cue: Cue) {
    startTransition(async () => {
      await tagSong({
        spotifyUri: track.uri,
        title: track.name,
        artist: artistNames,
        durationMs: track.duration_ms,
        cue,
      });
      setCurrentTag(cue);
      setExpanded(false);
    });
  }

  return (
    <li className={`transition-opacity ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>
      {/* Track row */}
      <div className="flex items-center gap-3 py-3 border-b border-zinc-800/60">
        {/* Thumbnail */}
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={track.album.name} className="w-11 h-11 rounded object-cover shrink-0 bg-zinc-800" />
        ) : (
          <div className="w-11 h-11 rounded bg-zinc-800 shrink-0" />
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-base font-medium truncate">{track.name}</p>
          <p className="text-zinc-400 text-sm truncate">{artistNames}</p>
        </div>

        <span className="text-zinc-600 text-sm tabular-nums shrink-0">{fmtMs(track.duration_ms)}</span>

        {/* Tag badge / button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-medium transition-colors ml-1 ${
            currentTag
              ? CUE_BTN[currentTag]
              : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
          }`}
        >
          {currentTag ?? 'Tag'}
        </button>
      </div>

      {/* Inline cue picker — expands below the row */}
      {expanded && (
        <div className="pl-14 py-2 border-b border-zinc-800/60 flex flex-wrap gap-2">
          {CUE_TYPES.map((cue) => (
            <button
              key={cue}
              onClick={() => handleTag(cue)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                currentTag === cue ? CUE_SELECTED[cue] : CUE_BTN[cue]
              }`}
            >
              {currentTag === cue ? '✓ ' : ''}{cue}
            </button>
          ))}
          <button
            onClick={() => setExpanded(false)}
            className="text-zinc-500 text-sm px-1"
          >
            cancel
          </button>
        </div>
      )}
    </li>
  );
}
