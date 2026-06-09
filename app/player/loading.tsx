export default function PlayerLoading() {
  return (
    <main className="min-h-screen bg-black px-4 pt-6 pb-32">
      <div className="max-w-lg mx-auto">
        <div className="h-6 w-16 bg-zinc-800 rounded animate-pulse mb-6" />
        <div className="h-5 w-24 bg-zinc-800 rounded animate-pulse mb-1" />
        <div className="h-3 w-56 bg-zinc-800 rounded animate-pulse mb-6" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-zinc-800/60">
            <div className="w-11 h-11 bg-zinc-800 rounded shrink-0 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-zinc-800/70 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
