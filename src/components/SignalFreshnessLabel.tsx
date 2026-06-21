import { formatSignalFreshness } from "@/lib/signalFreshness";
import type { VenueSignal } from "@/types";

type SignalFreshnessLabelProps = {
  signal: VenueSignal | null | undefined;
  className?: string;
};

export function SignalFreshnessLabel({ signal, className = "" }: SignalFreshnessLabelProps) {
  const freshness = formatSignalFreshness(signal?.updatedAt ?? null);
  const isLive = signal?.busynessSource === "live";

  if (!isLive && !freshness) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold ${className}`}>
      {isLive ? (
        <span className="inline-flex items-center gap-1.5 text-emerald-300">
          <span
            className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.85)]"
            aria-hidden="true"
          />
          Live
        </span>
      ) : null}
      {freshness ? (
        <span className={freshness.stale ? "text-white/35" : "text-[#9CA2AE]"}>
          {freshness.label}
        </span>
      ) : null}
    </span>
  );
}

export default SignalFreshnessLabel;
