"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0F] px-4 text-center text-white">
      <h1 className="text-2xl font-black">Something went wrong</h1>
      <p className="mt-2 text-sm font-semibold text-white/55">Try refreshing</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-[#7C3AED] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#6D28D9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/60"
      >
        Try refreshing
      </button>
    </div>
  );
}
