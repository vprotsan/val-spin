import { redirect, notFound } from 'next/navigation';
import { getValidAccessToken, getSpotifyUserId } from '@/lib/spotify-auth';
import { getSongByUri } from '@/lib/store';
import { ensureHydrated } from '@/lib/db/hydrate';
import SequenceEditor from '@/components/sequences/SequenceEditor';

export default async function SongSequencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await getValidAccessToken();
  if (!token) redirect('/api/auth/clear');

  const userId = await getSpotifyUserId();
  if (userId) await ensureHydrated(userId);

  const { id } = await params;
  // The URL param is the encoded spotifyUri (stable across server restarts)
  const spotifyUri = decodeURIComponent(id);
  const song = getSongByUri(spotifyUri);
  if (!song) notFound();

  return <SequenceEditor song={song} />;
}
