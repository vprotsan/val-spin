'use server';

import { getValidAccessToken } from '@/lib/spotify-auth';
import { getPlaylist } from '@/lib/store';

const API = 'https://api.spotify.com/v1';

type SaveResult =
  | { ok: true; playlistId: string; playlistUrl: string; name: string; trackCount: number }
  | { ok: false; error: string };

export async function savePlaylistAction(name: string): Promise<SaveResult> {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, error: 'Not authenticated — please log in again.' };

  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: 'Please enter a playlist name.' };

  const { segments } = getPlaylist();
  const uris = segments.flatMap((seg) => seg.songs.map((s) => s.spotifyUri));
  if (uris.length === 0) {
    return { ok: false, error: 'Your playlist has no songs yet. Add songs to your segments first.' };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // ── Create playlist (/me/playlists works for all account types) ───────────
  const createRes = await fetch(`${API}/me/playlists`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: trimmedName,
      public: false,
      description: 'Cycling class playlist',
    }),
    cache: 'no-store',
  });
  const createBody = await createRes.text();
  if (!createRes.ok) {
    return { ok: false, error: `Could not create Spotify playlist (${createRes.status}): ${createBody}` };
  }
  const { id: playlistId } = JSON.parse(createBody);

  // ── Add tracks in batches of 100 (/items is the current endpoint) ─────────
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const addRes = await fetch(`${API}/playlists/${playlistId}/items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ uris: batch }),
      cache: 'no-store',
    });
    if (!addRes.ok) {
      const body = await addRes.text();
      return {
        ok: false,
        error: `Playlist created but failed to add tracks at position ${i} (${addRes.status}): ${body}`,
      };
    }
  }

  return {
    ok: true,
    playlistId,
    playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
    name: trimmedName,
    trackCount: uris.length,
  };
}
