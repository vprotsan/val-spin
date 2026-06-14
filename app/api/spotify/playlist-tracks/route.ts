import { getValidAccessToken } from '@/lib/spotify-auth';
import { getPlaylistWithTracks } from '@/lib/spotify-api';

// GET /api/spotify/playlist-tracks?id={playlistId}
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

  try {
    const playlist = await getPlaylistWithTracks(id, token, 200);
    return Response.json({ tracks: playlist.tracks, name: playlist.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[playlist-tracks]', message);
    return Response.json({ error: 'Failed to load playlist tracks', detail: message }, { status: 500 });
  }
}
