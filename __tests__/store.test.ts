import {
  resetStore,
  addSong,
  getSong,
  getSongsByCue,
  hasSongByUri,
  removeSong,
  reassignCue,
  addSequence,
  updateSequence,
  removeSequence,
  addSegment,
  removeSegment,
  moveSegment,
  addSongToSegment,
  removeSongFromSegment,
  moveSongInSegment,
  getPlaylist,
  playlistDurationMs,
} from '../lib/store';

beforeEach(() => resetStore());

// ── Song mutations ─────────────────────────────────────────────────────────────

describe('addSong', () => {
  it('creates a song with required fields', () => {
    const song = addSong({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      durationMs: 200000,
      spotifyUri: 'spotify:track:abc',
      cue: 'Jumps',
    });
    expect(song.id).toBeTruthy();
    expect(song.bpm).toBeNull();
    expect(song.sequences).toEqual([]);
    expect(song.cue).toBe('Jumps');
  });

  it('deduplicates by Spotify URI', () => {
    const a = addSong({ title: 'X', artist: 'Y', durationMs: 1000, spotifyUri: 'uri:1', cue: 'Flat' });
    const b = addSong({ title: 'X', artist: 'Y', durationMs: 1000, spotifyUri: 'uri:1', cue: 'Flat' });
    expect(a.id).toBe(b.id);
  });

  it('updates cue when URI already exists with different cue', () => {
    const a = addSong({ title: 'X', artist: 'Y', durationMs: 1000, spotifyUri: 'uri:2', cue: 'Flat' });
    const b = addSong({ title: 'X', artist: 'Y', durationMs: 1000, spotifyUri: 'uri:2', cue: 'Climbs' });
    expect(b.id).toBe(a.id);
    expect(getSong(a.id)?.cue).toBe('Climbs');
  });
});

describe('getSongsByCue', () => {
  it('returns only songs for the requested cue, sorted by title', () => {
    addSong({ title: 'Zebra', artist: 'A', durationMs: 1000, spotifyUri: 'uri:z', cue: 'Sprints' });
    addSong({ title: 'Alpha', artist: 'B', durationMs: 1000, spotifyUri: 'uri:a', cue: 'Sprints' });
    addSong({ title: 'Other', artist: 'C', durationMs: 1000, spotifyUri: 'uri:o', cue: 'Jumps' });
    const sprints = getSongsByCue('Sprints');
    expect(sprints.map((s) => s.title)).toEqual(['Alpha', 'Zebra']);
  });
});

describe('removeSong', () => {
  it('removes the song and strips it from segments', () => {
    const song = addSong({ title: 'S', artist: 'A', durationMs: 1000, spotifyUri: 'uri:s', cue: 'Flat' });
    const seg = addSegment('Flat');
    addSongToSegment(seg.id, song.id);
    expect(getPlaylist().segments[0].songs).toHaveLength(1);
    removeSong(song.id);
    expect(getSong(song.id)).toBeUndefined();
    expect(getPlaylist().segments[0].songs).toHaveLength(0);
  });

  it('returns error for unknown id', () => {
    expect(removeSong('nope')).toMatchObject({ ok: false });
  });
});

describe('reassignCue', () => {
  it('changes the cue and preserves sequences', () => {
    const song = addSong({ title: 'R', artist: 'A', durationMs: 60000, spotifyUri: 'uri:r', cue: 'Flat' });
    addSequence(song.id, { startMs: 0, endMs: 5000, note: 'intro' });
    reassignCue(song.id, 'Climbs');
    const updated = getSong(song.id)!;
    expect(updated.cue).toBe('Climbs');
    expect(updated.sequences).toHaveLength(1);
    expect(updated.sequences[0].note).toBe('intro');
  });

  it('propagates cue update into playlist segments', () => {
    const song = addSong({ title: 'R', artist: 'A', durationMs: 1000, spotifyUri: 'uri:r2', cue: 'Flat' });
    const seg = addSegment('Flat');
    addSongToSegment(seg.id, song.id);
    reassignCue(song.id, 'Sprints');
    expect(getPlaylist().segments[0].songs[0].cue).toBe('Sprints');
  });
});

// ── Sequence mutations ─────────────────────────────────────────────────────────

describe('addSequence', () => {
  let songId: string;
  beforeEach(() => {
    songId = addSong({ title: 'T', artist: 'A', durationMs: 300000, spotifyUri: 'uri:t', cue: 'Jumps' }).id;
  });

  it('adds a sequence and sorts by startMs', () => {
    addSequence(songId, { startMs: 10000, endMs: 20000 });
    addSequence(songId, { startMs: 0, endMs: 5000 });
    const seqs = getSong(songId)!.sequences;
    expect(seqs[0].startMs).toBe(0);
    expect(seqs[1].startMs).toBe(10000);
  });

  it('rejects overlapping sequences', () => {
    addSequence(songId, { startMs: 0, endMs: 10000 });
    const result = addSequence(songId, { startMs: 5000, endMs: 15000 });
    expect(result).toMatchObject({ ok: false });
  });

  it('allows adjacent (touching) sequences', () => {
    addSequence(songId, { startMs: 0, endMs: 5000 });
    const result = addSequence(songId, { startMs: 5000, endMs: 10000 });
    expect(result).toMatchObject({ ok: true });
  });

  it('rejects endMs <= startMs', () => {
    expect(addSequence(songId, { startMs: 5000, endMs: 5000 })).toMatchObject({ ok: false });
  });

  it('stores an optional note', () => {
    const result = addSequence(songId, { startMs: 0, endMs: 5000, note: 'jump sequence' });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.sequence.note).toBe('jump sequence');
  });
});

describe('updateSequence', () => {
  it('updates span and re-sorts', () => {
    const songId = addSong({ title: 'U', artist: 'A', durationMs: 300000, spotifyUri: 'uri:u', cue: 'Jumps' }).id;
    const r1 = addSequence(songId, { startMs: 0, endMs: 5000 });
    addSequence(songId, { startMs: 20000, endMs: 25000 });
    if (!r1.ok) throw new Error('setup failed');
    updateSequence(songId, r1.sequence.id, { startMs: 10000, endMs: 15000 });
    const seqs = getSong(songId)!.sequences;
    expect(seqs[0].startMs).toBe(10000);
    expect(seqs[1].startMs).toBe(20000);
  });

  it('rejects update that causes overlap', () => {
    const songId = addSong({ title: 'U2', artist: 'A', durationMs: 300000, spotifyUri: 'uri:u2', cue: 'Jumps' }).id;
    const r1 = addSequence(songId, { startMs: 0, endMs: 5000 });
    addSequence(songId, { startMs: 10000, endMs: 15000 });
    if (!r1.ok) throw new Error('setup failed');
    const result = updateSequence(songId, r1.sequence.id, { endMs: 12000 });
    expect(result).toMatchObject({ ok: false });
  });
});

describe('removeSequence', () => {
  it('removes the sequence', () => {
    const songId = addSong({ title: 'D', artist: 'A', durationMs: 300000, spotifyUri: 'uri:d', cue: 'Jumps' }).id;
    const r = addSequence(songId, { startMs: 0, endMs: 5000 });
    if (!r.ok) throw new Error('setup failed');
    removeSequence(songId, r.sequence.id);
    expect(getSong(songId)!.sequences).toHaveLength(0);
  });
});

// ── Segment + playlist mutations ───────────────────────────────────────────────

describe('addSegment / removeSegment', () => {
  it('appends segments in order', () => {
    addSegment('Flat');
    addSegment('Climbs');
    addSegment('Sprints');
    expect(getPlaylist().segments.map((s) => s.cue)).toEqual(['Flat', 'Climbs', 'Sprints']);
  });

  it('removeSegment returns error for unknown id', () => {
    expect(removeSegment('nope')).toMatchObject({ ok: false });
  });
});

describe('moveSegment', () => {
  it('reorders segments', () => {
    const a = addSegment('Flat');
    const b = addSegment('Climbs');
    const c = addSegment('Sprints');
    moveSegment(c.id, 0);
    expect(getPlaylist().segments.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
  });

  it('rejects out-of-range index', () => {
    addSegment('Flat');
    const seg = addSegment('Climbs');
    expect(moveSegment(seg.id, 5)).toMatchObject({ ok: false });
  });
});

describe('addSongToSegment / removeSongFromSegment', () => {
  it('adds and removes songs', () => {
    const song = addSong({ title: 'P', artist: 'A', durationMs: 1000, spotifyUri: 'uri:p', cue: 'Flat' });
    const seg = addSegment('Flat');
    addSongToSegment(seg.id, song.id);
    expect(getPlaylist().segments[0].songs).toHaveLength(1);
    removeSongFromSegment(seg.id, song.id);
    expect(getPlaylist().segments[0].songs).toHaveLength(0);
  });

  it('rejects unknown song', () => {
    const seg = addSegment('Flat');
    expect(addSongToSegment(seg.id, 'ghost')).toMatchObject({ ok: false });
  });
});

describe('moveSongInSegment', () => {
  it('reorders songs within a segment', () => {
    const s1 = addSong({ title: '1', artist: 'A', durationMs: 1000, spotifyUri: 'uri:1', cue: 'Flat' });
    const s2 = addSong({ title: '2', artist: 'A', durationMs: 1000, spotifyUri: 'uri:2', cue: 'Flat' });
    const s3 = addSong({ title: '3', artist: 'A', durationMs: 1000, spotifyUri: 'uri:3', cue: 'Flat' });
    const seg = addSegment('Flat');
    addSongToSegment(seg.id, s1.id);
    addSongToSegment(seg.id, s2.id);
    addSongToSegment(seg.id, s3.id);
    moveSongInSegment(seg.id, 2, 0); // move s3 to front
    const ids = getPlaylist().segments[0].songs.map((s) => s.id);
    expect(ids).toEqual([s3.id, s1.id, s2.id]);
  });
});

// ── Derived reads ──────────────────────────────────────────────────────────────

describe('playlistDurationMs', () => {
  it('sums durations across all segments', () => {
    const s1 = addSong({ title: 'A', artist: 'X', durationMs: 60000, spotifyUri: 'uri:A', cue: 'Flat' });
    const s2 = addSong({ title: 'B', artist: 'X', durationMs: 90000, spotifyUri: 'uri:B', cue: 'Climbs' });
    const seg1 = addSegment('Flat');
    const seg2 = addSegment('Climbs');
    addSongToSegment(seg1.id, s1.id);
    addSongToSegment(seg2.id, s2.id);
    expect(playlistDurationMs()).toBe(150000);
  });
});

// ── BPM seam ──────────────────────────────────────────────────────────────────

describe('BPM field', () => {
  it('is always null in v1', () => {
    const song = addSong({ title: 'BPM', artist: 'X', durationMs: 1000, spotifyUri: 'uri:bpm', cue: 'Flat' });
    expect(song.bpm).toBeNull();
  });
});

describe('hasSongByUri', () => {
  it('returns true when uri already tagged', () => {
    addSong({ title: 'H', artist: 'A', durationMs: 1000, spotifyUri: 'uri:h', cue: 'Flat' });
    expect(hasSongByUri('uri:h')).toBe(true);
    expect(hasSongByUri('uri:nope')).toBe(false);
  });
});
