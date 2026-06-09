import { getValidAccessToken } from '@/lib/spotify-auth';
import { getSavedTracks } from '@/lib/spotify-api';

// GET /api/spotify/tracks?limit=50
// Returns the user's saved tracks for the Add Song sheet.
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  const tracks = await getSavedTracks(token, limit);
  return Response.json({ tracks });
}
