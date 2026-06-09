import { redirect, notFound } from 'next/navigation';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { getSong } from '@/lib/store';
import SequenceEditor from '@/components/sequences/SequenceEditor';

export default async function SongSequencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = await getValidAccessToken();
  if (!token) redirect('/api/auth/clear');

  const { id } = await params;
  const song = getSong(id);
  if (!song) notFound();

  return <SequenceEditor song={song} />;
}
