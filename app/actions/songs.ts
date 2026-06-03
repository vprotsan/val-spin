'use server';

import { revalidatePath } from 'next/cache';
import { getValidAccessToken } from '@/lib/spotify-auth';
import { addSong, removeSong, reassignCue } from '@/lib/store';
import type { Cue } from '@/types';

function requireAuth() {
  // Fire-and-forget auth check — throws if not signed in
  return getValidAccessToken().then((t) => {
    if (!t) throw new Error('Not authenticated');
  });
}

export interface TagSongInput {
  spotifyUri: string;
  title: string;
  artist: string;
  durationMs: number;
  cue: Cue;
}

/** Tag a song with a cue (or re-tag it if already in the store). */
export async function tagSong(input: TagSongInput): Promise<void> {
  await requireAuth();
  addSong(input);
  revalidatePath('/tagging');
}

/** Remove a song from the tag library entirely. */
export async function untagSong(songId: string): Promise<void> {
  await requireAuth();
  removeSong(songId);
  revalidatePath('/tagging');
}

/** Move a song to a different cue, preserving its sequences. */
export async function changeSongCue(songId: string, newCue: Cue): Promise<void> {
  await requireAuth();
  reassignCue(songId, newCue);
  revalidatePath('/tagging');
}
