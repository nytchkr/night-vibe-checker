"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0E] px-4 text-center text-white">
      <h1 className="font-display text-2xl font-black">Something went wrong</h1>
      <p className="mt-2 text-sm font-semibold text-white/50">We hit an unexpected error.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-[#8B6CFF] px-6 py-3 text-sm font-black text-[#0A0A0E] transition-colors hover:bg-[#765AF0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
      >
        Try again
      </button>
    </div>
  );
}
