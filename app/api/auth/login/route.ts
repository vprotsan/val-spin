import { redirect } from 'next/navigation';
import { buildAuthUrl } from '@/lib/spotify-auth';
import { cookies } from 'next/headers';

// GET /api/auth/login — redirects the user to Spotify's authorization page
export async function GET() {
  // Random state value for CSRF protection
  const state = crypto.randomUUID();

  // Stash state in a short-lived cookie to verify on callback
  const store = await cookies();
  store.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  redirect(buildAuthUrl(state));
}
