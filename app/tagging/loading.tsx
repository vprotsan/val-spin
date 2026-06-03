export default function TaggingLoading() {
  return (
    <main className="min-h-screen bg-black px-4 pt-5 pb-24">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="h-6 w-28 bg-zinc-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-24 rounded-2xl bg-zinc-800 animate-pulse ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
            />
          ))}
        </div>
        <div className="h-12 rounded-2xl bg-zinc-800 animate-pulse" />
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3 border-b border-zinc-800/60">
              <div className="w-11 h-11 bg-zinc-800 rounded shrink-0 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-zinc-800/70 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
