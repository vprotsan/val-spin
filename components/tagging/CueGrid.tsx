import Link from 'next/link';
import type { Cue } from '@/types';
import { CUE_TYPES } from '@/types';

const CUE_META: Record<Cue, { emoji: string; color: string; selected: string }> = {
  Jumps:   { emoji: '↕', color: 'bg-amber-950/60 border-amber-700/50 text-amber-300',   selected: 'bg-amber-500 border-amber-400 text-black' },
  Climbs:  { emoji: '↑', color: 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300', selected: 'bg-emerald-500 border-emerald-400 text-black' },
  Sprints: { emoji: '»', color: 'bg-red-950/60 border-red-700/50 text-red-300',         selected: 'bg-red-500 border-red-400 text-black' },
  Choreo:  { emoji: '✦', color: 'bg-purple-950/60 border-purple-700/50 text-purple-300', selected: 'bg-purple-500 border-purple-400 text-black' },
  Flat:    { emoji: '→', color: 'bg-sky-950/60 border-sky-700/50 text-sky-300',         selected: 'bg-sky-500 border-sky-400 text-black' },
};

export default function CueGrid({
  selectedCue,
  counts,
}: {
  selectedCue: Cue;
  counts: Record<Cue, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CUE_TYPES.map((cue) => {
        const meta = CUE_META[cue];
        const isSelected = cue === selectedCue;
        const count = counts[cue];
        return (
          <Link
            key={cue}
            href={`/tagging?cue=${cue}`}
            className={`
              flex flex-col items-center justify-center gap-1
              rounded-2xl border px-3 py-4 transition-all active:scale-95
              ${isSelected ? meta.selected : meta.color}
              ${cue === 'Flat' ? 'col-span-2 sm:col-span-1' : ''}
            `}
          >
            <span className="text-3xl leading-none">{meta.emoji}</span>
            <span className="text-base font-semibold tracking-wide">{cue}</span>
            <span className={`text-sm font-medium ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
              {count} {count === 1 ? 'song' : 'songs'}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
