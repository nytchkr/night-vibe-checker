import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen-safe bg-[#0A0A0E] px-4 py-8 pb-32 text-white">
      <section className="mx-auto max-w-lg">
        <p className="font-display text-[34px] font-semibold tracking-normal text-white">
          nyt<span className="text-[#8B6CFF]">chkr</span>
        </p>
        <h1 className="mt-8 font-display text-2xl font-semibold tracking-normal text-[#F4F5F8]">
          Know before you go.
        </h1>
        <p className="mt-4 text-[15px] font-medium leading-7 text-[#9CA2AE]">
          nytchkr shows real Charlotte venue signals from trusted sources: venue facts from Google Places,
          busyness from scheduled forecasts, and M/F vibe from user check-ins.
        </p>
        <div className="mt-8 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4">
          <h2 className="font-display text-[19px] font-semibold text-[#F4F5F8]">Data promise</h2>
          <p className="mt-3 text-[13px] font-medium leading-6 text-[#9CA2AE]">
            Empty venues stay empty until there is real data. We do not invent live crowd numbers,
            M/F splits, venue photos, or venue details.
          </p>
        </div>
        <Link
          href="/profile"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B6CFF] px-5 text-[13px] font-semibold text-[#0A0A0E] transition-colors hover:bg-[#9B82FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0E]"
        >
          Back to You
        </Link>
      </section>
    </div>
  );
}
