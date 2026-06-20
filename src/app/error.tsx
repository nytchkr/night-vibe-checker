"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0F] px-4 text-white">
      <p>Something went wrong</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-full bg-[#7C3AED] px-5 py-2 text-sm font-bold text-white"
      >
        Try again
      </button>
    </div>
  );
}
