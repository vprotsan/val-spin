import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'spotify_session';
const secretKey = process.env.SESSION_SECRET;

function getKey(): Uint8Array {
  if (!secretKey) throw new Error('SESSION_SECRET env var is not set');
  return new TextEncoder().encode(secretKey);
}

export interface SpotifySession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms timestamp
}

export async function encryptSession(payload: SpotifySession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getKey());
}

export async function decryptSession(token: string): Promise<SpotifySession | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    return payload as unknown as SpotifySession;
  } catch {
    return null;
  }
}

export async function saveSession(session: SpotifySession): Promise<void> {
  const token = await encryptSession(session);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function getSession(): Promise<SpotifySession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return decryptSession(raw);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
