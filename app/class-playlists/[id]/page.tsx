import { notFound, redirect } from 'next/navigation';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { loadPlaylistById } from '@/lib/db/playlists';
import { loadTagsForUser } from '@/lib/db/tags';
import { loadSequencesForUser } from '@/lib/db/sequences';
import { CUE_TYPES } from '@/types';
import type { Cue, Segment, Song, Sequence } from '@/types';
import PlaylistEditorPage from '@/components/class-playlists/PlaylistEditorPage';

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

  // Load playlist row + all song metadata in parallel
  const [row, tags, seqsByUri] = await Promise.all([
    loadPlaylistById(userId, id),
    loadTagsForUser(userId),
    loadSequencesForUser(userId),
  ]);
  if (!row) notFound();

  // Build uri → Song map (song.id = spotifyUri — stable, store-independent)
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

  // Songs available per cue for the Add Song picker
  const songsByCue = Object.fromEntries(
    CUE_TYPES.map((cue) => [
      cue,
      [...songByUri.values()].filter((s) => s.cue === cue),
    ]),
  ) as Record<Cue, Song[]>;

  return (
    <PlaylistEditorPage
      playlistId={row.id}
      initialName={row.name}
      initialSegments={initialSegments}
      songsByCue={songsByCue}
      savedAt={row.updated_at}
    />
  );
}
