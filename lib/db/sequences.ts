import 'server-only';
import { supabase } from '@/lib/supabase';

export interface SequenceRow {
  id: string;           // app-generated UUID — same id used in the in-memory store
  spotify_user_id: string;
  spotify_uri: string;  // which song this sequence belongs to
  start_ms: number;
  end_ms: number;
  note: string | null;
}

/** Load all sequences for a user, grouped by spotify_uri. */
export async function loadSequencesForUser(
  userId: string,
): Promise<Map<string, SequenceRow[]>> {
  const { data, error } = await supabase
    .from('song_sequences')
    .select('id, spotify_user_id, spotify_uri, start_ms, end_ms, note')
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`loadSequencesForUser: ${error.message}`);

  const map = new Map<string, SequenceRow[]>();
  for (const row of data ?? []) {
    const arr = map.get(row.spotify_uri) ?? [];
    arr.push(row as SequenceRow);
    map.set(row.spotify_uri, arr);
  }
  return map;
}

/** Insert or update a single sequence. */
export async function upsertSequence(row: SequenceRow): Promise<void> {
  const { error } = await supabase
    .from('song_sequences')
    .upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertSequence: ${error.message}`);
}

/** Delete a single sequence by its id (scoped to user for safety). */
export async function deleteSequence(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('song_sequences')
    .delete()
    .eq('id', id)
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`deleteSequence: ${error.message}`);
}

/** Delete all sequences for a song — called when the song is untagged. */
export async function deleteSequencesForSong(
  userId: string,
  spotifyUri: string,
): Promise<void> {
  const { error } = await supabase
    .from('song_sequences')
    .delete()
    .eq('spotify_user_id', userId)
    .eq('spotify_uri', spotifyUri);
  if (error) throw new Error(`deleteSequencesForSong: ${error.message}`);
}
