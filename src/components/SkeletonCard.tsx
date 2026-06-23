export default function SkeletonCard() {
  return (
    <div className="bg-white/5 rounded-xl p-4 animate-pulse">
      <div className="h-4 w-3/4 bg-white/10 rounded mb-2" />
      <div className="h-3 w-1/2 bg-white/10 rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-6 w-16 bg-white/10 rounded-full" />
        <div className="h-6 w-20 bg-white/10 rounded-full" />
      </div>
    </div>
  );
}
