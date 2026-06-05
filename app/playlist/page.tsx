import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { getPlaylist, getAllSongs } from '@/lib/store';
import { CUE_TYPES } from '@/types';
import type { Cue, Song } from '@/types';
import PlaylistBuilder from '@/components/playlist/PlaylistBuilder';

export default async function PlaylistPage() {
  const token = await getValidAccessToken();
  if (!token) redirect('/api/auth/clear');

  const playlist = getPlaylist();
  const allSongs = getAllSongs();

  const songsByCue = Object.fromEntries(
    CUE_TYPES.map((cue) => [cue, allSongs.filter((s) => s.cue === cue)]),
  ) as Record<Cue, Song[]>;

  return (
    <main className="min-h-screen bg-black pb-24">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Playlist Builder</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Build your class cue by cue</p>
          </div>
          <Link href="/dashboard" className="text-zinc-400 hover:text-white text-sm transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5">
        {/* PlaylistBuilder owns all client state including SaveToSpotify */}
        <PlaylistBuilder
          initialSegments={playlist.segments}
          songsByCue={songsByCue}
        />
      </div>
    </main>
  );
}
