import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — nytchkr",
  description: "nytchkr is unavailable while this device is offline.",
  alternates: {
    canonical: "/offline",
  },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen-safe items-center justify-center bg-[#0A0A0E] px-6 text-center text-white">
      <div className="max-w-sm space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8B6CFF]">Offline</p>
        <h1 className="text-2xl font-semibold">You're offline.</h1>
        <p className="text-sm leading-6 text-white/70">Open nytchkr when you're back online.</p>
      </div>
    </main>
  );
}
