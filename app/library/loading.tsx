export default function LibraryLoading() {
  return (
    <main className="min-h-screen bg-black px-4 pt-6 pb-24">
      <div className="max-w-lg mx-auto">
        {/* Header skeleton */}
        <div className="h-7 w-32 bg-zinc-800 rounded-md animate-pulse mb-1" />
        <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse mb-6" />

        {/* Tab skeleton */}
        <div className="flex gap-2 mb-5">
          <div className="h-9 w-28 bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-9 w-28 bg-zinc-800 rounded-full animate-pulse" />
        </div>

        {/* Row skeletons */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-zinc-800/60">
            <div className="w-11 h-11 bg-zinc-800 rounded shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-zinc-800/70 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
