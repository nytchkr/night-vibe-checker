export default function MapLoading() {
  return (
    <div className="relative h-screen overflow-hidden bg-[#0A0A0E]" role="status" aria-label="Loading map">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:42px_42px] opacity-60" />
      <div className="absolute left-4 top-4 h-10 w-40 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute left-1/2 top-14 h-9 w-52 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute bottom-20 left-1/2 h-9 w-64 -translate-x-1/2 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="absolute inset-x-0 bottom-0 h-[72px] rounded-t-3xl border-t border-white/[0.08] bg-[#0A0A0E]/95 px-4 pt-3 backdrop-blur-xl">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
        <div className="mx-auto mt-3 h-9 w-44 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <span className="sr-only">Loading map venues...</span>
    </div>
  );
}
