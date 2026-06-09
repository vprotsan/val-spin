import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { loadPlaylistById } from '@/lib/db/playlists';
import { loadTagsForUser } from '@/lib/db/tags';
import { loadSequencesForUser } from '@/lib/db/sequences';
import { CUE_TYPES } from '@/types';
import type { Cue, Segment, Song, Sequence } from '@/types';
import SavedPlaylistBuilder from '@/components/class-playlists/SavedPlaylistBuilder';
import PlaylistPlayer from '@/components/class-playlists/PlaylistPlayer';

export default async function SavedPlaylistPage({
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

  // Load playlist row + all song data in parallel
  const [row, tags, seqsByUri] = await Promise.all([
    loadPlaylistById(userId, id),
    loadTagsForUser(userId),
    loadSequencesForUser(userId),
  ]);
  if (!row) notFound();

  // Build a uri → Song map (song.id = spotifyUri — stable, store-independent)
  const songByUri = new Map<string, Song>(
    tags.map((t) => {
      const sequences: Sequence[] = (seqsByUri.get(t.spotify_uri) ?? []).map((r) => ({
        id: r.id,
        startMs: r.start_ms,
        endMs: r.end_ms,
        ...(r.note ? { note: r.note } : {}),
      }));
      const song: Song = {
        id: t.spotify_uri,
        title: t.title,
        artist: t.artist,
        durationMs: t.duration_ms,
        spotifyUri: t.spotify_uri,
        cue: t.cue,
        bpm: null,
        sequences,
      };
      return [t.spotify_uri, song];
    }),
  );

  // Resolve stored segments → full Segment[] (silently drops deleted tags)
  const initialSegments: Segment[] = row.segments.map((seg) => ({
    id: seg.id,
    cue: seg.cue,
    songs: seg.songUris
      .map((uri) => songByUri.get(uri))
      .filter((s): s is Song => s !== undefined),
  }));

  // Songs available per cue for the picker
  const songsByCue = Object.fromEntries(
    CUE_TYPES.map((cue) => [
      cue,
      [...songByUri.values()].filter((s) => s.cue === cue),
    ]),
  ) as Record<Cue, Song[]>;

  const totalSongs = row.segments.reduce((n, s) => n + s.songUris.length, 0);

  // Flat ordered song list for the player (segment order → song order within segment)
  const flatSongs: Song[] = initialSegments.flatMap((seg) => seg.songs);

  return (
    <main className="min-h-screen bg-black pb-36">{/* pb-36 clears the sticky player bar */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-5 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white truncate max-w-xs">{row.name}</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {row.segments.length} {row.segments.length === 1 ? 'segment' : 'segments'}
              {totalSongs > 0 && (
                <> &middot; {totalSongs} {totalSongs === 1 ? 'song' : 'songs'}</>
              )}
              <span className="ml-2 text-zinc-700">
                · saved {new Date(row.updated_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </span>
            </p>
          </div>
          <Link
            href="/class-playlists"
            className="text-zinc-400 hover:text-white text-sm transition-colors shrink-0 ml-3"
          >
            ← Playlists
          </Link>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5">
        <SavedPlaylistBuilder
          playlistId={row.id}
          initialSegments={initialSegments}
          songsByCue={songsByCue}
        />
      </div>

      {/* Sticky playback bar — mounts the Spotify SDK, plays songs in order */}
      <PlaylistPlayer songs={flatSongs} />
    </main>
  );
}
