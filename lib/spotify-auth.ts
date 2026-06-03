import 'server-only';
import { getSession, saveSession } from './session';
import type { SpotifySession } from './session';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
  'streaming',
  'user-read-email',
  'user-read-private', // required for Premium check + Web Playback SDK
].join(' ');

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
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

export async function exchangeCode(code: string): Promise<SpotifySession> {
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
  return {
    accessToken: data.access_token,
    // Spotify may or may not return a new refresh token
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
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
