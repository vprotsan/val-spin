import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { getPlaylistWithTracks } from '@/lib/spotify-api';
import { ensureHydrated } from '@/lib/db/hydrate';
import { getAllSongs } from '@/lib/store';
import type { Cue } from '@/types';
import PlaylistTrackRow from '@/components/library/PlaylistTrackRow';

export default async function PlaylistTracksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [token, userId] = await Promise.all([
    getValidAccessToken(),
    getSpotifyUserId(),
  ]);
  if (!token || !userId) redirect('/api/auth/clear');

  // Ensure the in-memory store is hydrated so we know which songs are already tagged
  await ensureHydrated(userId);
  const taggedUris: Record<string, Cue> = {};
  for (const song of getAllSongs()) {
    taggedUris[song.spotifyUri] = song.cue;
  }

  let playlist;
  try {
    playlist = await getPlaylistWithTracks(id, token, 200);
  } catch (err) {
    console.error('[playlist tracks] fetch failed:', err);
    // Return a proper error UI instead of a hard 404 so the user
    // can navigate back rather than hitting a dead end.
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400 text-base text-center">
          Could not load this playlist. It may be private or unavailable.
        </p>
        <a href="/library?tab=playlists" className="text-zinc-400 hover:text-white text-base underline">
          ← Back to playlists
        </a>
      </main>
    );
  }

  const thumb = playlist.images?.[0]?.url;

  return (
    <main className="min-h-screen bg-black pb-24">
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-3 pb-2">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {/* Playlist thumbnail */}
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={playlist.name} className="w-10 h-10 rounded object-cover shrink-0 bg-zinc-800" />
          ) : (
            <div className="w-10 h-10 rounded bg-zinc-800 shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white truncate">{playlist.name}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {playlist.owner.display_name} &middot; {playlist.total} tracks
            </p>
          </div>

          <Link
            href="/library?tab=playlists"
            className="text-zinc-400 hover:text-white text-base transition-colors shrink-0 ml-2"
          >
            ← Back
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-2">
        {playlist.tracks.length === 0 ? (
          <p className="text-zinc-500 text-base text-center py-12">This playlist has no tracks.</p>
        ) : (
          <ul>
            {playlist.tracks.map((track) => (
              <PlaylistTrackRow
                key={track.id}
                track={track}
                initialTag={taggedUris[track.uri]}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
