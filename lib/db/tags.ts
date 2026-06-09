import 'server-only';
import { supabase } from '@/lib/supabase';
import type { Cue } from '@/types';

export interface TagRow {
  spotify_user_id: string;
  spotify_uri: string;
  title: string;
  artist: string;
  duration_ms: number;
  cue: Cue;
}

/** Load all tagged songs for a user from Supabase. */
export async function loadTagsForUser(userId: string): Promise<TagRow[]> {
  const { data, error } = await supabase
    .from('song_tags')
    .select('spotify_user_id, spotify_uri, title, artist, duration_ms, cue')
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`loadTagsForUser: ${error.message}`);
  return (data ?? []) as TagRow[];
}

/** Upsert a tag (insert or update cue if the URI already exists for this user). */
export async function upsertTag(tag: TagRow): Promise<void> {
  const { error } = await supabase
    .from('song_tags')
    .upsert(tag, { onConflict: 'spotify_user_id,spotify_uri' });
  if (error) throw new Error(`upsertTag: ${error.message}`);
}

/** Delete a tag (untag a song for this user). */
export async function deleteTag(userId: string, spotifyUri: string): Promise<void> {
  const { error } = await supabase
    .from('song_tags')
    .delete()
    .eq('spotify_user_id', userId)
    .eq('spotify_uri', spotifyUri);
  if (error) throw new Error(`deleteTag: ${error.message}`);
}
