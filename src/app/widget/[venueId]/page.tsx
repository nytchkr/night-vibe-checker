import { notFound } from "next/navigation";
import { getBusynessState } from "@/lib/busyness";
import { getConsumerVenueById } from "@/lib/consumerVenue";
import type { ConsumerVenue } from "@/types";

type WidgetPageProps = {
  params: Promise<{ venueId: string }>;
};

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NightVibe busyness widget",
  robots: { index: false, follow: false },
};

function clampPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function barColor(value: number | null | undefined): string {
  if (value == null) return "bg-white/25";
  if (value >= 67) return "bg-[#FF5B6A]";
  if (value >= 34) return "bg-[#FFB020]";
  return "bg-[#5C6573]";
}

function crowdFeel(venue: ConsumerVenue): { label: string; icon: string } {
  const mfRatio = venue.signal?.mfRatio;
  if (mfRatio == null) return { label: "Mixed", icon: "👥" };
  if (mfRatio >= 60) return { label: "More guys", icon: "🕺" };
  if (mfRatio <= 40) return { label: "More women", icon: "💃" };
  return { label: "Mixed", icon: "👥" };
}

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { venueId } = await params;
  const venue = await getConsumerVenueById(venueId);
  if (!venue) notFound();

  const busyness = venue.signal?.busyness0To100 ?? null;
  const percent = clampPercent(busyness);
  const busynessState = getBusynessState(busyness);
  const feel = crowdFeel(venue);

  return (
    <div className="flex min-h-[100dvh] items-start justify-center bg-[#0A0A0E] p-0 text-white sm:items-center sm:p-4">
      <article className="h-[200px] w-[360px] rounded-2xl border border-white/10 bg-[#0A0A0E] p-4 shadow-2xl shadow-black/40">
        <div className="flex h-full flex-col justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8B6CFF]">Live crowd</p>
            <h1 className="font-display mt-2 truncate text-[22px] font-black leading-tight text-white">{venue.name}</h1>
            <p className="mt-1 truncate text-xs text-white/45">{venue.address}</p>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Busyness</p>
                <p className="mt-0.5 text-sm font-bold text-white">{busynessState.label}</p>
              </div>
              <p className="text-2xl font-black tabular-nums text-white">{busyness == null ? "--" : percent}</p>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/10"
              aria-label={`Busyness ${busyness == null ? "not available" : `${percent} out of 100`}`}
            >
              <div data-testid="busyness-bar-fill" className={`h-full rounded-full ${barColor(busyness)}`} style={{ width: `${percent}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-white/85">
              <span aria-hidden="true">{feel.icon}</span>
              {feel.label}
            </span>
            <span className="font-display text-[11px] font-semibold text-white/35">Powered by NightVibe</span>
          </div>
        </div>
      </article>
    </div>
  );
}
