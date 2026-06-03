import type { Sequence } from '@/types';

// ── Result type ───────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export const OK: ValidationResult = { ok: true };
export function fail(error: string): ValidationResult {
  return { ok: false, error };
}

// ── Sequence validation ───────────────────────────────────────────────────────

/**
 * Validate a single sequence's own fields.
 */
export function validateSequenceShape(
  startMs: number,
  endMs: number,
): ValidationResult {
  if (!Number.isInteger(startMs) || startMs < 0) {
    return fail('startMs must be a non-negative integer');
  }
  if (!Number.isInteger(endMs) || endMs < 0) {
    return fail('endMs must be a non-negative integer');
  }
  if (endMs <= startMs) {
    return fail(`endMs (${endMs}) must be greater than startMs (${startMs})`);
  }
  return OK;
}

/**
 * Two sequences overlap when one starts before the other ends.
 * They are considered non-overlapping when they merely touch (a.endMs === b.startMs).
 */
export function sequencesOverlap(a: Sequence, b: Sequence): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Check that `candidate` does not overlap any sequence in `existing`.
 * Pass `excludeId` when updating an existing sequence so it isn't compared to itself.
 */
export function validateNoOverlap(
  existing: Sequence[],
  candidate: { startMs: number; endMs: number },
  excludeId?: string,
): ValidationResult {
  for (const seq of existing) {
    if (seq.id === excludeId) continue;
    if (sequencesOverlap(seq, candidate as Sequence)) {
      return fail(
        `Sequence ${formatSpan(candidate)} overlaps existing sequence ${formatSpan(seq)}` +
          (seq.note ? ` ("${seq.note}")` : ''),
      );
    }
  }
  return OK;
}

function formatSpan(s: { startMs: number; endMs: number }): string {
  return `[${msToTimestamp(s.startMs)}–${msToTimestamp(s.endMs)}]`;
}

function msToTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
