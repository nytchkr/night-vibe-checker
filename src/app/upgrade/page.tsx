import Link from "next/link";

export default function UpgradePage() {
  return (
    <main className="min-h-screen-safe bg-[#0A0A0E] px-4 py-10 pb-32 text-white">
      <section className="mx-auto max-w-lg">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#00F5D4]">Later</p>
        <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-white">
          More real signals are coming.
        </h1>
        <p className="mt-4 text-sm font-medium leading-6 text-white/75">
          The free MVP is focused on South End venue discovery, live check-ins, saved spots, and honest empty states.
        </p>

        <div className="mt-8 rounded-[18px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-lg shadow-black/10 backdrop-blur-sm">
          <h2 className="font-display text-lg font-semibold tracking-tight text-[#F4F5F8]">Future paid features</h2>
          <ul className="mt-4 space-y-3 text-sm font-medium leading-6 text-white/75">
            <li>Full-week BestTime forecasts</li>
            <li>Saved-venue vibe alerts</li>
            <li>More launch zones</li>
          </ul>
        </div>

        <Link
          href="/map"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] shadow-[0_0_22px_rgba(139,108,255,0.28)] transition-all duration-200 ease-out hover:bg-[#9B82FF] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Back to map
        </Link>
      </section>
    </main>
  );
}
