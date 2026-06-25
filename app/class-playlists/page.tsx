import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { listPlaylistsForUser } from '@/lib/db/playlists';
import { loadTagsForUser } from '@/lib/db/tags';
import PlaylistListClient from '@/components/class-playlists/PlaylistListClient';

export default async function ClassPlaylistsPage() {
  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) redirect('/api/auth/clear');

  const [playlists, tags] = await Promise.all([
    listPlaylistsForUser(userId),
    loadTagsForUser(userId),
  ]);

  // uri → duration_ms lookup for computing playlist totals
  const durationByUri = new Map(tags.map((t) => [t.spotify_uri, t.duration_ms]));

  // Pre-compute total duration (ms) per playlist
  const durationsMs: Record<string, number> = {};
  for (const pl of playlists) {
    durationsMs[pl.id] = pl.segments.reduce(
      (sum, seg) => sum + seg.songUris.reduce((s, uri) => s + (durationByUri.get(uri) ?? 0), 0),
      0,
    );
  }

  return (
    <main className="min-h-screen bg-black pb-24">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Class Playlists</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {playlists.length} saved {playlists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>
          <Link href="/dashboard" className="text-zinc-400 hover:text-white text-base transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5">
        <PlaylistListClient initialPlaylists={playlists} durationsMs={durationsMs} />
      </div>
    </main>
  );
}
