export default function PlaylistLoading() {
  return (
    <main className="min-h-screen bg-black px-4 pt-6 pb-24">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="h-6 w-36 bg-zinc-800 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="h-12 bg-zinc-800/60 animate-pulse" />
            <div className="bg-zinc-900 p-3 space-y-2">
              {Array.from({ length: i }).map((_, j) => (
                <div key={j} className="h-10 bg-zinc-800/60 rounded animate-pulse" />
              ))}
              <div className="h-6 bg-zinc-800/30 rounded animate-pulse" />
            </div>
          </div>
        ))}
        <div className="h-12 bg-zinc-800/40 rounded-2xl animate-pulse" />
      </div>
    </main>
  );
}
