import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { getAllSongs, getSongsByCue } from '@/lib/store';
import { ensureHydrated } from '@/lib/db/hydrate';
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

  const userId = await getSpotifyUserId();
  if (userId) await ensureHydrated(userId);

  const { cue: cueParam } = await searchParams;

  // null = "All" (default); a valid Cue string = filtered view
  const selectedCue: Cue | null = CUE_TYPES.includes(cueParam as Cue)
    ? (cueParam as Cue)
    : null;

  const allSongs = getAllSongs().sort((a, b) => a.title.localeCompare(b.title));

  // Songs to display — all when no filter, or filtered by cue
  const displayedSongs = selectedCue
    ? getSongsByCue(selectedCue)
    : allSongs;

  // Per-cue counts for the filter tiles
  const counts = Object.fromEntries(
    CUE_TYPES.map((c) => [c, allSongs.filter((s) => s.cue === c).length])
  ) as Record<Cue, number>;

  // Map of spotifyUri → cue for the Add Song sheet
  const taggedUris: Record<string, Cue> = {};
  for (const song of allSongs) taggedUris[song.spotifyUri] = song.cue;

  const sectionLabel = selectedCue
    ? `${selectedCue} — ${displayedSongs.length} ${displayedSongs.length === 1 ? 'song' : 'songs'}`
    : `All — ${allSongs.length} ${allSongs.length === 1 ? 'song' : 'songs'}`;

  return (
    <main className="min-h-screen bg-black pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Song Tags</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {allSongs.length} {allSongs.length === 1 ? 'song' : 'songs'} tagged
            </p>
          </div>
          <Link href="/dashboard" className="text-zinc-400 hover:text-white text-base transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        {/* Cue filter tiles — horizontal scrollable row */}
        <CueGrid
          selectedCue={selectedCue}
          counts={counts}
          totalCount={allSongs.length}
        />

        {/* Add Song button */}
        <AddSongSheet
          defaultCue={selectedCue ?? 'Jumps'}
          taggedUris={taggedUris}
        />

        {/* Song list */}
        <section>
          <h2 className="text-zinc-500 text-sm font-semibold uppercase tracking-widest mb-1">
            {sectionLabel}
          </h2>

          {displayedSongs.length === 0 ? (
            <p className="text-zinc-600 text-base py-8 text-center">
              {selectedCue
                ? `No songs tagged as ${selectedCue} yet.`
                : 'No songs tagged yet.'}
              <br />
              <span className="text-zinc-700">Tap &ldquo;Add Song&rdquo; to get started.</span>
            </p>
          ) : (
            <ul>
              {displayedSongs.map((song) => (
                <TaggedSongRow key={song.id} song={song} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
