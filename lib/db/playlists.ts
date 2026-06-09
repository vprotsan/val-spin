import 'server-only';
import { supabase } from '@/lib/supabase';
import type { Cue } from '@/types';

// ── Multi-playlist types (post-migration schema) ──────────────────────────────

export interface PlaylistRow {
  id: string;
  spotify_user_id: string;
  name: string;
  segments: StoredSegment[];
  updated_at: string;
}

/**
 * Compact representation stored in Supabase.
 * Songs are referenced by URI only — full Song objects come from the tags store.
 */
export interface StoredSegment {
  id: string;
  cue: Cue;
  songUris: string[]; // ordered; duplicates allowed (same as in-memory model)
}

export async function loadPlaylist(userId: string): Promise<StoredSegment[] | null> {
  const { data, error } = await supabase
    .from('playlists')
    .select('segments')
    .eq('spotify_user_id', userId)
    .single();

  if (error) {
    // PGRST116 = no rows found — normal on first load
    if (error.code === 'PGRST116') return null;
    throw new Error(`loadPlaylist: ${error.message}`);
  }
  return (data?.segments ?? []) as StoredSegment[];
}

export async function savePlaylist(userId: string, segments: StoredSegment[]): Promise<void> {
  const { error } = await supabase
    .from('playlists')
    .upsert(
      { spotify_user_id: userId, segments },
      { onConflict: 'spotify_user_id' },
    );
  if (error) throw new Error(`savePlaylist: ${error.message}`);
}

// ── Multi-playlist API (requires schema migration: id uuid PK, name text) ────

/** All playlists for a user, most-recently-edited first. */
export async function listPlaylistsForUser(userId: string): Promise<PlaylistRow[]> {
  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, segments, updated_at')
    .eq('spotify_user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`listPlaylistsForUser: ${error.message}`);
  return (data ?? []) as PlaylistRow[];
}

/** Single playlist by id, user-scoped. */
export async function loadPlaylistById(
  userId: string,
  id: string,
): Promise<PlaylistRow | null> {
  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, segments, updated_at')
    .eq('id', id)
    .eq('spotify_user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`loadPlaylistById: ${error.message}`);
  }
  return data as PlaylistRow;
}

/** Create a new empty playlist; returns the created row. */
export async function createPlaylist(
  userId: string,
  name: string,
): Promise<PlaylistRow> {
  const { data, error } = await supabase
    .from('playlists')
    .insert({ spotify_user_id: userId, name, segments: [] })
    .select()
    .single();
  if (error) throw new Error(`createPlaylist: ${error.message}`);
  return data as PlaylistRow;
}

/** Overwrite the segments blob for one playlist. */
export async function updatePlaylistSegments(
  userId: string,
  id: string,
  segments: StoredSegment[],
): Promise<void> {
  const { error } = await supabase
    .from('playlists')
    .update({ segments })
    .eq('id', id)
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`updatePlaylistSegments: ${error.message}`);
}

/** Rename a playlist. */
export async function renamePlaylist(
  userId: string,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from('playlists')
    .update({ name })
    .eq('id', id)
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`renamePlaylist: ${error.message}`);
}

/** Delete a playlist. */
export async function deletePlaylist(
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', id)
    .eq('spotify_user_id', userId);
  if (error) throw new Error(`deletePlaylist: ${error.message}`);
}
