import { getValidAccessToken } from '@/lib/spotify-auth';
import type { SpotifyTrack } from '@/lib/spotify-api';

// GET /api/spotify/search?q=...
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  if (!q) return Response.json({ tracks: [] });

  // Omit 'market' — Spotify automatically scopes results to the account's
  // country when a user access token is present. The old 'from_token' value
  // was deprecated and can silently return empty results on current API versions.
  const params = new URLSearchParams({ q, type: 'track', limit: '30' });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[search] Spotify ${res.status}:`, body);
    return Response.json(
      { error: `Spotify error ${res.status}`, detail: body },
      { status: res.status },
    );
  }

  const data = await res.json();
  const tracks: SpotifyTrack[] = data.tracks?.items ?? [];
  return Response.json({ tracks });
}
