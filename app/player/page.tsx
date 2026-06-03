import { redirect } from 'next/navigation';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { getSavedTracks } from '@/lib/spotify-api';
import SpotifyPlayer from '@/components/SpotifyPlayer';
import Link from 'next/link';

export default async function PlayerPage() {
  const token = await getValidAccessToken();
  if (!token) redirect('/');

  // Fetch first 50 saved tracks — enough to pick one for the step-4 proof
  const tracks = await getSavedTracks(token, 50);

  return (
    <div>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
        <Link href="/dashboard" className="text-zinc-400 hover:text-white text-sm transition-colors">
          ← Back
        </Link>
      </div>
      {/* SpotifyPlayer is a Client Component — it owns the SDK + all playback state */}
      <SpotifyPlayer tracks={tracks} />
    </div>
  );
}
