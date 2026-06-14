import 'server-only';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Saved Tracks ──────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
}

interface SavedTracksPage {
  items: { track: SpotifyTrack }[];
  next: string | null;
  total: number;
}

/** Fetch up to `maxTracks` saved tracks (handles pagination). */
export async function getSavedTracks(
  token: string,
  maxTracks = 200,
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null = `${BASE}/me/tracks?limit=50`;

  while (url && tracks.length < maxTracks) {
    const page: SavedTracksPage = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then((r) => {
      if (!r.ok) throw new Error(`Spotify saved tracks → ${r.status}`);
      return r.json();
    });
    tracks.push(...page.items.map((i) => i.track));
    url = page.next;
  }

  return tracks.slice(0, maxTracks);
}

// ── Playlists ─────────────────────────────────────────────────────────────────

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  tracks: { total: number };
  images: { url: string }[];
  owner: { display_name: string };
}

interface PlaylistsPage {
  items: SpotifyPlaylist[];
  next: string | null;
}

/** Fetch the current user's playlists (first page, up to 50). */
export async function getUserPlaylists(token: string): Promise<SpotifyPlaylist[]> {
  const page = await spotifyFetch<PlaylistsPage>('/me/playlists?limit=50', token);
  return page.items;
}

// ── Playlist tracks ───────────────────────────────────────────────────────────

export interface PlaylistDetail {
  id: string;
  name: string;
  images: { url: string }[];
  owner: { display_name: string };
  total: number;     // total track count from Spotify
  tracks: SpotifyTrack[];
}

interface PlaylistTracksPage {
  items: { track: SpotifyTrack | null }[];
  next: string | null;
  total: number;
}

/**
 * Fetch a playlist's metadata and up to `maxTracks` tracks.
 * Uses two separate endpoints:
 *   - GET /playlists/{id}?fields=...  → name, images, owner, total
 *   - GET /playlists/{id}/tracks      → paginated track list
 * (The combined endpoint silently drops `tracks` when given unknown params.)
 */
export async function getPlaylistWithTracks(
  playlistId: string,
  token: string,
  maxTracks = 200,
): Promise<PlaylistDetail> {
  const encodedId = encodeURIComponent(playlistId);

  // ── 1. Metadata only ────────────────────────────────────────────────────────
  const meta = await spotifyFetch<{
    id: string;
    name: string;
    images: { url: string }[];
    owner: { display_name: string };
    tracks: { total: number };
  }>(
    `/playlists/${encodedId}?fields=id%2Cname%2Cimages%2Cowner%2Ctracks.total`,
    token,
  );

  // ── 2. Tracks (paginated via the dedicated endpoint) ────────────────────────
  const tracks: SpotifyTrack[] = [];
  let url: string | null =
    `${BASE}/playlists/${encodedId}/items?limit=50`;

  while (url && tracks.length < maxTracks) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Spotify playlist tracks → ${res.status}`);
    const page = (await res.json()) as PlaylistTracksPage;
    tracks.push(
      ...page.items
        .map((i: { track: SpotifyTrack | null }) => i.track)
        .filter((t: SpotifyTrack | null): t is SpotifyTrack => !!t?.id),
    );
    url = page.next;
  }

  return {
    id: meta.id,
    name: meta.name,
    images: meta.images,
    owner: meta.owner,
    total: meta.tracks.total,
    tracks: tracks.slice(0, maxTracks),
  };
}
