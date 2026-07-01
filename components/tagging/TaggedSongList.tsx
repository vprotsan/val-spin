'use client';

import { useState } from 'react';
import type { Song } from '@/types';
import TaggedSongRow from './TaggedSongRow';

export default function TaggedSongList({
  songs,
  sectionLabel,
}: {
  songs: Song[];
  sectionLabel: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? songs.filter((s) => {
        const q = query.toLowerCase();
        return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
      })
    : songs;

  return (
    <section className="space-y-3">
      {/* Search input */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tagged songs…"
        className="w-full rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-2.5 text-base outline-none focus:border-zinc-500"
      />

      <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest">
        {query.trim()
          ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}`
          : sectionLabel}
      </h2>

      {filtered.length === 0 ? (
        <p className="text-zinc-600 text-base py-6 text-center">
          {query.trim() ? `No songs matching "${query}"` : 'No songs tagged yet.'}
        </p>
      ) : (
        <ul>
          {filtered.map((song) => (
            <TaggedSongRow key={song.id} song={song} />
          ))}
        </ul>
      )}
    </section>
  );
}
