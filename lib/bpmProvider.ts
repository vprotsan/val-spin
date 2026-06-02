import type { Song } from '@/types';

// BPM provider interface — v1 is a no-op; swap in a real provider later.
export interface BpmProvider {
  getBpm(song: Song): Promise<number | null>;
}

export const nullBpmProvider: BpmProvider = {
  getBpm: async (_song) => null,
};
