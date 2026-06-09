'use client';

import { useTransition, useState } from 'react';
import Link from 'next/link';
import { untagSong, changeSongCue } from '@/app/actions/songs';
import { CUE_TYPES } from '@/types';
import type { Cue, Song } from '@/types';

const CUE_PILL: Record<Cue, string> = {
  Jumps:   'bg-amber-500/20 text-amber-300 border-amber-600/40',
  Climbs:  'bg-emerald-500/20 text-emerald-300 border-emerald-600/40',
  Sprints: 'bg-red-500/20 text-red-300 border-red-600/40',
  Choreo:  'bg-purple-500/20 text-purple-300 border-purple-600/40',
  Flat:    'bg-sky-500/20 text-sky-300 border-sky-600/40',
};

export default function TaggedSongRow({ song }: { song: Song }) {
  const [isPending, startTransition] = useTransition();
  const [showCuePicker, setShowCuePicker] = useState(false);

  const thumb =
    // no album art on the Song model — we stored minimal data; skip gracefully
    undefined as string | undefined;

  function handleUntag() {
    startTransition(() => untagSong(song.id));
  }

  function handleChangeCue(cue: Cue) {
    setShowCuePicker(false);
    startTransition(() => changeSongCue(song.id, cue));
  }

  return (
    <li className={`transition-opacity ${isPending ? 'opacity-40' : 'opacity-100'}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 py-3 border-b border-zinc-800/60">
        {/* Placeholder art */}
        <div className="w-11 h-11 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-sm">
          ♪
        </div>

        {/* Info — tap to open sequence editor */}
        <Link href={`/songs/${song.id}`} className="flex-1 min-w-0 group">
          <p className="text-white text-base font-medium truncate group-hover:text-zinc-200">{song.title}</p>
          <p className="text-zinc-400 text-sm truncate">
            {song.artist}
            {song.sequences.length > 0 && (
              <span className="ml-2 text-zinc-600">
                {song.sequences.length} seq
              </span>
            )}
          </p>
        </Link>

        {/* Cue pill — tap to reassign */}
        <button
          onClick={() => setShowCuePicker((v) => !v)}
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm font-medium transition-opacity
            ${CUE_PILL[song.cue]} hover:opacity-80`}
        >
          {song.cue}
        </button>

        {/* Untag */}
        <button
          onClick={handleUntag}
          disabled={isPending}
          className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors px-1 text-xl leading-none"
          aria-label="Remove tag"
        >
          ×
        </button>
      </div>

      {/* Inline cue picker — shown when pill is tapped */}
      {showCuePicker && (
        <div className="flex flex-wrap gap-2 pb-3 pt-1 pl-14 border-b border-zinc-800/60">
          {CUE_TYPES.filter((c) => c !== song.cue).map((cue) => (
            <button
              key={cue}
              onClick={() => handleChangeCue(cue)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${CUE_PILL[cue]}`}
            >
              → {cue}
            </button>
          ))}
          <button
            onClick={() => setShowCuePicker(false)}
            className="text-zinc-500 text-sm px-1"
          >
            cancel
          </button>
        </div>
      )}
    </li>
  );
}
