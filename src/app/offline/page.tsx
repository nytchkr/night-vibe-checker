import type { Metadata } from "next";
import { TryAgainButton } from "./TryAgainButton";

export const metadata: Metadata = {
  title: "Offline — nytchkr",
  description: "nytchkr is unavailable while this device is offline.",
  alternates: {
    canonical: "/offline",
  },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen-safe items-center justify-center bg-[#0A0A0E] px-6 py-12 text-center text-white">
      <div className="mx-auto flex max-w-sm flex-col items-center">
        <img
          src="/icon.svg"
          alt=""
          className="h-16 w-16 rounded-2xl shadow-[0_0_40px_rgba(139,108,255,0.28)]"
          aria-hidden="true"
        />
        <p className="mt-5 font-display text-[34px] font-semibold leading-none tracking-normal text-white">nytchkr</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#8B6CFF]">Offline</p>
        <h1 className="mt-5 font-display text-3xl font-semibold leading-tight tracking-normal text-[#F4F5F8]">
          You&apos;re offline — check back when you&apos;re connected
        </h1>
        <p className="mt-4 text-sm leading-6 text-white/65">
          We&apos;ll reload tonight&apos;s venue signals as soon as your connection is back.
        </p>
        <div className="mt-8">
          <TryAgainButton />
        </div>
      </div>
    </main>
  );
}
