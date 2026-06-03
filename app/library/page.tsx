import { redirect } from 'next/navigation';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { getSavedTracks, getUserPlaylists } from '@/lib/spotify-api';
import type { SpotifyTrack, SpotifyPlaylist } from '@/lib/spotify-api';
import Link from 'next/link';

// Which tab is shown is driven by a ?tab= search param so it's server-rendered
// and bookmarkable, with no client JS needed.
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const token = await getValidAccessToken();
  if (!token) redirect('/');

  const { tab } = await searchParams;
  const activeTab = tab === 'playlists' ? 'playlists' : 'tracks';

  // Fetch both in parallel; each resolves independently
  const [tracks, playlists] = await Promise.all([
    getSavedTracks(token, 200),
    getUserPlaylists(token),
  ]);

  return (
    <main className="min-h-screen bg-black pb-24">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-white">Your Library</h1>
              <p className="text-zinc-500 text-xs mt-0.5">
                {tracks.length} saved tracks &middot; {playlists.length} playlists
              </p>
            </div>
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-white text-sm transition-colors"
            >
              ← Back
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <Link
              href="/library?tab=tracks"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'tracks'
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Saved Tracks
            </Link>
            <Link
              href="/library?tab=playlists"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'playlists'
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Playlists
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-2">
        {activeTab === 'tracks' ? (
          <TrackList tracks={tracks} />
        ) : (
          <PlaylistList playlists={playlists} />
        )}
      </div>
    </main>
  );
}

// ── Track list ─────────────────────────────────────────────────────────────────

function TrackList({ tracks }: { tracks: SpotifyTrack[] }) {
  if (tracks.length === 0) {
    return (
      <p className="text-zinc-500 text-sm py-12 text-center">
        No saved tracks found. Save some songs in Spotify first.
      </p>
    );
  }

  return (
    <ul>
      {tracks.map((track) => (
        <TrackRow key={track.id} track={track} />
      ))}
    </ul>
  );
}

function TrackRow({ track }: { track: SpotifyTrack }) {
  const artistNames = track.artists.map((a) => a.name).join(', ');
  const thumb = track.album.images.find((img) => img.width && img.width <= 64)?.url
    ?? track.album.images.at(-1)?.url;
  const duration = formatDuration(track.duration_ms);

  return (
    <li className="flex items-center gap-3 py-3 border-b border-zinc-800/60 last:border-0">
      {/* Album art */}
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={track.album.name}
          className="w-11 h-11 rounded object-cover shrink-0 bg-zinc-800"
        />
      ) : (
        <div className="w-11 h-11 rounded bg-zinc-800 shrink-0" />
      )}

      {/* Title / artist */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{track.name}</p>
        <p className="text-zinc-400 text-xs truncate">{artistNames}</p>
      </div>

      {/* Duration */}
      <span className="text-zinc-600 text-xs shrink-0 tabular-nums">{duration}</span>
    </li>
  );
}

// ── Playlist list ──────────────────────────────────────────────────────────────

function PlaylistList({ playlists }: { playlists: SpotifyPlaylist[] }) {
  if (playlists.length === 0) {
    return (
      <p className="text-zinc-500 text-sm py-12 text-center">
        No playlists found.
      </p>
    );
  }

  return (
    <ul>
      {playlists.map((pl) => (
        <PlaylistRow key={pl.id} playlist={pl} />
      ))}
    </ul>
  );
}

function PlaylistRow({ playlist }: { playlist: SpotifyPlaylist }) {
  const thumb = playlist.images?.[0]?.url;

  return (
    <li className="flex items-center gap-3 py-3 border-b border-zinc-800/60 last:border-0">
      {/* Cover art */}
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt={playlist.name}
          className="w-11 h-11 rounded object-cover shrink-0 bg-zinc-800"
        />
      ) : (
        <div className="w-11 h-11 rounded bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
        </div>
      )}

      {/* Name / owner / count */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
        <p className="text-zinc-400 text-xs truncate">
          {playlist.owner.display_name} &middot; {playlist?.tracks?.total} tracks
        </p>
      </div>
    </li>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
