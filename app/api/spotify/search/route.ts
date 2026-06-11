import { getValidAccessToken } from '@/lib/spotify-auth';
import type { SpotifyTrack } from '@/lib/spotify-api';

// GET /api/spotify/search?q=...
export async function GET(request: Request) {
  const token = await getValidAccessToken();
  if (!token) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('q')?.trim() ?? '';

  // Strip HTML tags/entities — Spotify returns 400 "Invalid html" if the
  // query contains < > & or HTML-encoded characters (can happen with iOS
  // autocomplete or smart-quote substitution).
  const q = raw.replace(/[<>&"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return Response.json({ tracks: [] });

  // Use encodeURIComponent directly — URLSearchParams encodes spaces as '+'
  // which some Spotify API versions misinterpret as literal plus signs.
  // Omit limit — use Spotify's default (20) to avoid parameter validation quirks.
  const spotifyUrl =
    `https://api.spotify.com/v1/search` +
    `?q=${encodeURIComponent(q)}&type=track`;

  console.log('[search] q:', JSON.stringify(q), '→', spotifyUrl);

  const res = await fetch(spotifyUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[search] Spotify ${res.status} for q="${q}":`, body);
    // Pass the raw Spotify error body to the client so we can see exactly what failed
    let detail = body;
    try { detail = JSON.stringify(JSON.parse(body)); } catch { /* keep raw */ }
    return Response.json(
      { error: `Spotify error ${res.status}`, detail },
      { status: res.status },
    );
  }

  const data = await res.json();
  const tracks: SpotifyTrack[] = data.tracks?.items ?? [];
  return Response.json({ tracks });
}
