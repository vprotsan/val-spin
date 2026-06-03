import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { getAllSongs, getSongsByCue } from '@/lib/store';
import { CUE_TYPES } from '@/types';
import type { Cue } from '@/types';
import CueGrid from '@/components/tagging/CueGrid';
import TaggedSongRow from '@/components/tagging/TaggedSongRow';
import AddSongSheet from '@/components/tagging/AddSongSheet';

export default async function TaggingPage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>;
}) {
  const token = await getValidAccessToken();
  if (!token) redirect('/api/auth/clear');

  const { cue: cueParam } = await searchParams;
  const selectedCue: Cue = CUE_TYPES.includes(cueParam as Cue)
    ? (cueParam as Cue)
    : 'Jumps';

  // Read from the in-memory store
  const allSongs = getAllSongs();
  const taggedForCue = getSongsByCue(selectedCue);

  // Counts for the cue cards
  const counts = Object.fromEntries(
    CUE_TYPES.map((c) => [c, allSongs.filter((s) => s.cue === c).length])
  ) as Record<Cue, number>;

  // Build a map of spotifyUri → cue for the Add Song sheet
  const taggedUris: Record<string, Cue> = {};
  for (const song of allSongs) taggedUris[song.spotifyUri] = song.cue;

  return (
    <main className="min-h-screen bg-black pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Song Tags</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {allSongs.length} {allSongs.length === 1 ? 'song' : 'songs'} tagged
            </p>
          </div>
          <Link href="/dashboard" className="text-zinc-400 hover:text-white text-sm transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">
        {/* Cue cards */}
        <CueGrid selectedCue={selectedCue} counts={counts} />

        {/* Add Song button (Client Component) */}
        <AddSongSheet defaultCue={selectedCue} taggedUris={taggedUris} />

        {/* Tagged songs for the selected cue */}
        <section>
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-1">
            {selectedCue} — {taggedForCue.length} {taggedForCue.length === 1 ? 'song' : 'songs'}
          </h2>

          {taggedForCue.length === 0 ? (
            <p className="text-zinc-600 text-sm py-8 text-center">
              No songs tagged as {selectedCue} yet.
              <br />
              <span className="text-zinc-700">Tap &ldquo;Add Song&rdquo; to get started.</span>
            </p>
          ) : (
            <ul>
              {taggedForCue.map((song) => (
                <TaggedSongRow key={song.id} song={song} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
