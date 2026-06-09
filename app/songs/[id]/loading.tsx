export default function Loading() {
  return (
    <div className="min-h-screen bg-black px-4 pt-5 pb-48">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="h-5 w-24 bg-zinc-800 rounded animate-pulse" />
        <div className="space-y-1">
          <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-zinc-800/70 rounded animate-pulse" />
        </div>
        <div className="h-1.5 w-full bg-zinc-800 rounded animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-900 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
