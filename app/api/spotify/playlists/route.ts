import { getValidAccessToken } from '@/lib/spotify-auth';
import { getUserPlaylists } from '@/lib/spotify-api';

// GET /api/spotify/playlists — user's Spotify playlists
export async function GET() {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const playlists = await getUserPlaylists(token);
  return Response.json({ playlists });
}
