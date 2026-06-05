import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { exchangeCode } from '@/lib/spotify-auth';
import { saveSession } from '@/lib/session';
import { ensureHydrated } from '@/lib/db/hydrate';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) redirect(`/?error=${encodeURIComponent(error)}`);
  if (!code || !state) redirect('/?error=missing_params');

  const store = await cookies();
  const storedState = store.get('oauth_state')?.value;
  store.delete('oauth_state');

  if (!storedState || state !== storedState) redirect('/?error=state_mismatch');

  try {
    // Exchange code → tokens
    const session = await exchangeCode(code!);

    // Fetch the Spotify user ID and store it in the session cookie
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    });
    if (!meRes.ok) throw new Error(`/v1/me ${meRes.status}`);
    const { id: spotifyUserId } = await meRes.json();

    await saveSession({ ...session, spotifyUserId });

    // Hydrate the in-memory store from Supabase
    await ensureHydrated(spotifyUserId);
  } catch (err) {
    console.error('Token exchange failed:', err);
    redirect('/?error=token_exchange_failed');
  }

  redirect('/dashboard');
}
