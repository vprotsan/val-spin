import Link from 'next/link';
import type { Cue } from '@/types';
import { CUE_TYPES } from '@/types';

const CUE_PILL: Record<Cue, { idle: string; active: string }> = {
  Jumps:   { idle: 'bg-amber-950/60 border-amber-700/50 text-amber-300',     active: 'bg-amber-500 border-amber-400 text-black' },
  Climbs:  { idle: 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300', active: 'bg-emerald-500 border-emerald-400 text-black' },
  Sprints: { idle: 'bg-red-950/60 border-red-700/50 text-red-300',           active: 'bg-red-500 border-red-400 text-black' },
  Choreo:  { idle: 'bg-purple-950/60 border-purple-700/50 text-purple-300',  active: 'bg-purple-500 border-purple-400 text-black' },
  Flat:    { idle: 'bg-sky-950/60 border-sky-700/50 text-sky-300',           active: 'bg-sky-500 border-sky-400 text-black' },
};

export default function CueGrid({
  selectedCue,
  counts,
  totalCount,
}: {
  selectedCue: Cue | null;
  counts: Record<Cue, number>;
  totalCount: number;
}) {
  return (
    // Horizontal scrollable row — overflow hidden on the page, scrollable here
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>

      {/* "All" tile */}
      <Link
        href="/tagging"
        className={`shrink-0 rounded-full border px-4 py-1.5 text-base font-medium transition-colors active:scale-95 ${
          selectedCue === null
            ? 'bg-white border-white text-black'
            : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
        }`}
      >
        All
        <span className={`ml-1.5 text-sm ${selectedCue === null ? 'opacity-60' : 'opacity-50'}`}>
          {totalCount}
        </span>
      </Link>

      {/* Per-cue tiles */}
      {CUE_TYPES.map((cue) => {
        const pill = CUE_PILL[cue];
        const isSelected = cue === selectedCue;
        return (
          <Link
            key={cue}
            href={`/tagging?cue=${cue}`}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-base font-medium transition-colors active:scale-95 ${
              isSelected ? pill.active : pill.idle
            }`}
          >
            {cue}
            <span className={`ml-1.5 text-sm ${isSelected ? 'opacity-60' : 'opacity-50'}`}>
              {counts[cue]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
