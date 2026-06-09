import {
  validateSequenceShape,
  validateNoOverlap,
  sequencesOverlap,
} from '../lib/validation';
import type { Sequence } from '../types';

function makeSeq(startMs: number, endMs: number, note?: string): Sequence {
  return { id: 'test-' + startMs, startMs, endMs, ...(note ? { note } : {}) };
}

describe('validateSequenceShape', () => {
  it('accepts valid span', () => {
    expect(validateSequenceShape(0, 5000)).toEqual({ ok: true });
  });

  it('rejects endMs <= startMs', () => {
    expect(validateSequenceShape(5000, 5000)).toMatchObject({ ok: false });
    expect(validateSequenceShape(5000, 3000)).toMatchObject({ ok: false });
  });

  it('rejects negative values', () => {
    expect(validateSequenceShape(-1, 1000)).toMatchObject({ ok: false });
  });

  it('rejects non-integer values', () => {
    expect(validateSequenceShape(1.5, 3000)).toMatchObject({ ok: false });
  });
});

describe('sequencesOverlap', () => {
  it('detects overlap', () => {
    expect(sequencesOverlap(makeSeq(0, 5000), makeSeq(3000, 8000))).toBe(true);
  });

  it('detects containment', () => {
    expect(sequencesOverlap(makeSeq(0, 10000), makeSeq(2000, 5000))).toBe(true);
  });

  it('allows adjacent (touching) sequences', () => {
    // endMs of first == startMs of second → not overlapping
    expect(sequencesOverlap(makeSeq(0, 5000), makeSeq(5000, 10000))).toBe(false);
  });

  it('allows fully disjoint sequences', () => {
    expect(sequencesOverlap(makeSeq(0, 5000), makeSeq(6000, 10000))).toBe(false);
  });
});

describe('validateNoOverlap', () => {
  const existing = [makeSeq(0, 5000, 'A'), makeSeq(10000, 15000, 'B')];

  it('allows a gap between existing sequences', () => {
    expect(validateNoOverlap(existing, { startMs: 6000, endMs: 9000 })).toEqual({ ok: true });
  });

  it('rejects overlap with first sequence', () => {
    const result = validateNoOverlap(existing, { startMs: 4000, endMs: 8000 });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toContain('"A"');
  });

  it('rejects overlap with second sequence', () => {
    const result = validateNoOverlap(existing, { startMs: 8000, endMs: 12000 });
    expect(result).toMatchObject({ ok: false });
    expect((result as { ok: false; error: string }).error).toContain('"B"');
  });

  it('excludes the sequence being updated from overlap check', () => {
    // Updating sequence A to a new span that would overlap itself — must pass when excluded
    expect(
      validateNoOverlap(existing, { startMs: 0, endMs: 6000 }, 'test-0'),
    ).toEqual({ ok: true });
  });

  it('allows sequence exactly adjacent to existing', () => {
    expect(validateNoOverlap(existing, { startMs: 5000, endMs: 10000 })).toEqual({ ok: true });
  });
});
