import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { listPlaylistsForUser } from '@/lib/db/playlists';
import PlaylistListClient from '@/components/class-playlists/PlaylistListClient';

export default async function ClassPlaylistsPage() {
  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) redirect('/api/auth/clear');

  const playlists = await listPlaylistsForUser(userId);

  return (
    <main className="min-h-screen bg-black pb-24">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Class Playlists</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {playlists.length} saved {playlists.length === 1 ? 'playlist' : 'playlists'}
            </p>
          </div>
          <Link href="/dashboard" className="text-zinc-400 hover:text-white text-sm transition-colors">
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5">
        <PlaylistListClient initialPlaylists={playlists} />
      </div>
    </main>
  );
}
