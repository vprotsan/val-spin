import 'server-only';
import { getSession, saveSession } from './session';
import type { SpotifySession } from './session';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
  'streaming',                    // Web Playback SDK (desktop)
  'user-read-email',
  'user-read-private',            // Premium check + Web Playback SDK
  'user-read-playback-state',     // Spotify Connect: read devices + current track
  'user-modify-playback-state',   // Spotify Connect: play, pause, seek, next, prev
  'user-read-currently-playing',  // Spotify Connect: current track polling
].join(' ');

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
    // Force the permissions dialog every login so Spotify re-grants all
    // current scopes rather than silently reusing an older authorization.
    show_dialog: 'true',
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function postToTokenEndpoint(body: URLSearchParams): Promise<TokenResponse> {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error ${res.status}: ${text}`);
  }
  return res.json();
}

// exchangeCode returns tokens only — the callback fetches /v1/me and adds spotifyUserId.
type TokensOnly = Omit<SpotifySession, 'spotifyUserId'>;

export async function exchangeCode(code: string): Promise<TokensOnly> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
  });
  const data = await postToTokenEndpoint(body);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token!,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifySession> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const data = await postToTokenEndpoint(body);
  // Carry the user ID forward — it doesn't change on refresh
  const currentSession = await getSession();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    spotifyUserId: currentSession?.spotifyUserId ?? '',
  };
}

/** Returns the Spotify user ID from the current session, or null if not logged in. */
export async function getSpotifyUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.spotifyUserId ?? null;
}

/**
 * Returns a valid access token, refreshing it if it expires within 5 minutes.
 * Saves the updated session cookie automatically.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const FIVE_MINUTES = 5 * 60 * 1000;
  if (Date.now() < session.expiresAt - FIVE_MINUTES) {
    return session.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(session.refreshToken);
    await saveSession(refreshed);
    return refreshed.accessToken;
  } catch {
    return null;
  }
}
