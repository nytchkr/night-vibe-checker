export default function Loading() {
  return (
    <main className="flex min-h-screen-safe items-center justify-center bg-[#0A0A0E] text-white">
      <div
        aria-label="Loading"
        className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#8B6CFF]"
        role="status"
      />
    </main>
  );
}
