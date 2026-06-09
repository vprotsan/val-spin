import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getValidAccessToken } from '@/lib/spotify-auth';

interface SpotifyUser {
  display_name: string;
  email: string;
  product: string;
  images: { url: string }[];
}

async function getSpotifyUser(token: string): Promise<SpotifyUser> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Spotify /me: ${res.status}`);
  return res.json();
}

export default async function DashboardPage() {
  const token = await getValidAccessToken();
  if (!token) redirect('/api/auth/clear');

  let user: SpotifyUser;
  try {
    user = await getSpotifyUser(token);
  } catch {
    redirect('/?error=spotify_api_failed');
  }

  const isPremium = user.product === 'premium';

  return (
    <main className="min-h-screen bg-black px-6 py-10">
      <div className="max-w-sm mx-auto flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-white">Connected ✓</h1>

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 flex items-center gap-4">
          {user.images?.[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.images[0].url}
              alt={user.display_name}
              className="w-14 h-14 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-zinc-400 text-2xl font-bold">
              {user.display_name?.[0] ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{user.display_name}</p>
            <p className="text-zinc-400 text-base truncate">{user.email}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-medium ${
                isPremium
                  ? 'bg-[#1DB954]/20 text-[#1DB954]'
                  : 'bg-yellow-900/40 text-yellow-400'
              }`}
            >
              {isPremium ? 'Premium ✓' : 'Free — Premium required'}
            </span>
          </div>
        </div>

        {!isPremium && (
          <p className="text-yellow-400 text-base bg-yellow-900/30 border border-yellow-800 rounded-lg px-4 py-3">
            This app requires Spotify Premium for full-track playback and timestamp marking.
          </p>
        )}

        {/* Navigation */}
        <Link
          href="/class-playlists"
          className="w-full flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
        >
          <div>
            <p className="text-white font-medium text-base">Class Playlists</p>
            <p className="text-zinc-500 text-sm mt-0.5">Saved class playlists · view &amp; edit segments</p>
          </div>
          <span className="text-zinc-500 text-xl">→</span>
        </Link>

        <Link
          href="/playlist"
          className="w-full flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
        >
          <div>
            <p className="text-white font-medium text-base">Playlist Builder</p>
            <p className="text-zinc-500 text-sm mt-0.5">Assemble cue segments · set running order</p>
          </div>
          <span className="text-zinc-500 text-xl">→</span>
        </Link>

        <Link
          href="/tagging"
          className="w-full flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
        >
          <div>
            <p className="text-white font-medium text-base">Tag Songs</p>
            <p className="text-zinc-500 text-sm mt-0.5">Assign cues · browse &amp; search</p>
          </div>
          <span className="text-zinc-500 text-xl">→</span>
        </Link>

        <Link
          href="/library"
          className="w-full flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
        >
          <div>
            <p className="text-white font-medium text-base">Browse Library</p>
            <p className="text-zinc-500 text-sm mt-0.5">Saved tracks &amp; playlists</p>
          </div>
          <span className="text-zinc-500 text-xl">→</span>
        </Link>

        <Link
          href="/player"
          className="w-full flex items-center justify-between rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors px-5 py-4"
        >
          <div>
            <p className="text-white font-medium text-base">Player</p>
            <p className="text-zinc-500 text-sm mt-0.5">Full playback · live position</p>
          </div>
          <span className="text-zinc-500 text-xl">→</span>
        </Link>

        <a
          href="/api/auth/logout"
          className="block w-full rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 py-3 text-base font-medium transition-colors text-center"
        >
          Log out / Disconnect
        </a>
      </div>
    </main>
  );
}
