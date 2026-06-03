import { type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { exchangeCode } from '@/lib/spotify-auth';
import { saveSession } from '@/lib/session';

// GET /api/auth/callback — Spotify redirects here with ?code=...&state=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    redirect(`/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    redirect('/?error=missing_params');
  }

  // Verify state matches what we set in the login route
  const store = await cookies();
  const storedState = store.get('oauth_state')?.value;
  store.delete('oauth_state');

  if (!storedState || state !== storedState) {
    redirect('/?error=state_mismatch');
  }

  try {
    const session = await exchangeCode(code);
    await saveSession(session);
  } catch (err) {
    console.error('Token exchange failed:', err);
    redirect('/?error=token_exchange_failed');
  }

  redirect('/dashboard');
}
