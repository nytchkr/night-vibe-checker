export default function ExploreLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0E] px-4 pb-24 pt-6">
      <div className="mb-1 h-7 w-48 animate-pulse rounded bg-white/10" />
      <div className="mb-4 h-4 w-28 animate-pulse rounded bg-white/5" />
      <div className="mb-6 h-10 w-full animate-pulse rounded-full bg-white/10" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mb-3 h-[114px] animate-pulse rounded-[18px] border border-white/10 bg-white/[0.04]" />
      ))}
    </div>
  );
}
