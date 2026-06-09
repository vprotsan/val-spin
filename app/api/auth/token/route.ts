import { getValidAccessToken } from '@/lib/spotify-auth';

// GET /api/auth/token — returns a fresh access token for client-side use (e.g. Web Playback SDK)
export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return Response.json({ accessToken: token });
}
