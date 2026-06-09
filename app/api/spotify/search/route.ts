import { getValidAccessToken } from '@/lib/spotify-auth';
import type { SpotifyTrack } from '@/lib/spotify-api';

// GET /api/spotify/search?q=...
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  if (!q) return Response.json({ tracks: [] });

  const params = new URLSearchParams({ q, type: 'track', limit: '30', market: 'from_token' });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return Response.json({ error: 'Spotify search failed' }, { status: res.status });

  const data = await res.json();
  const tracks: SpotifyTrack[] = data.tracks?.items ?? [];
  return Response.json({ tracks });
}
