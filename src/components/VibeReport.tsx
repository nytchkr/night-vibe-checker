"use client";

import type { VibeReport as VibeReportType } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { ShareButton } from "./ShareButton";
import { SaveSpotButton } from "./SaveSpotButton";
import { Card, CardContent } from "@/components/ui/card";

interface VibeReportProps {
  report?: VibeReportType;
  isLoading: boolean;
  error?: string;
  onShareCopied?: () => void;
}

function SkeletonPulse({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse rounded-md bg-white/10 ${className}`} style={style} aria-hidden="true" />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/[0.07] last:border-0">
      <span className="text-white/40 text-xs font-medium uppercase tracking-wide flex-shrink-0">{label}</span>
      <span className="text-white text-sm text-right">{value}</span>
    </div>
  );
}

function EnergyBar({ level }: { level: string }) {
  const pct = { Low: 25, Medium: 50, High: 75, Intense: 100 }[level] ?? 50;
  const color = pct >= 75 ? "#FF2D78" : pct >= 50 ? "#a855f7" : "#00F5D4";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
        />
      </div>
      <span className="text-white/50 text-xs w-12 text-right">{level}</span>
    </div>
  );
}

export function VibeReport({ report, isLoading, error, onShareCopied }: VibeReportProps) {
  if (error) {
    return (
      <Card role="alert" className="rounded-2xl border-rose-500/40 bg-rose-950/60 text-center text-white shadow-none">
        <CardContent className="p-6">
          <p className="text-rose-300 font-medium">{error}</p>
          <p className="text-rose-400/60 text-sm mt-1">Try searching for a different venue.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card role="status" aria-label="Loading vibe report" className="rounded-2xl border-white/10 bg-white/[0.04] text-white shadow-none">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-center gap-5">
            <div className="w-[100px] h-[100px] rounded-full bg-white/10 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <SkeletonPulse className="h-5 w-3/4" />
              <SkeletonPulse className="h-3 w-1/2" />
              <SkeletonPulse className="h-3 w-1/3" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonPulse key={i} className="h-7 rounded-full" style={{ width: `${60 + i * 12}px` }} />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonPulse key={i} className="h-4 w-full" />
            ))}
          </div>
          <div className="space-y-2">
            <SkeletonPulse className="h-3 w-full" />
            <SkeletonPulse className="h-3 w-5/6" />
            <SkeletonPulse className="h-3 w-4/6" />
          </div>
          <span className="sr-only">Loading...</span>
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card className="rounded-2xl border-white/10 bg-white/[0.04] text-center text-white shadow-none">
        <CardContent className="p-8">
          <p className="text-white/40 text-sm">Search for a venue to see its vibe report.</p>
        </CardContent>
      </Card>
    );
  }

  const confidencePct = Math.round(report.confidence * 100);
  const confidenceColor = confidencePct >= 70 ? "text-emerald-400" : confidencePct >= 40 ? "text-amber-400" : "text-rose-400";

  return (
    <article
      className="space-y-4"
      aria-label={`Vibe report for ${report.venueName}`}
    >
      {/* Score card — atmospheric reveal */}
      <Card
        className="overflow-hidden rounded-[24px] border-white/15 text-white shadow-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(34,211,238,0.13), rgba(168,85,247,0.09) 44%, rgba(255,45,120,0.12))",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 72px rgba(0,0,0,0.3), 0 0 48px rgba(0,245,212,0.07)",
          animation: "vibeScoreReveal 0.5s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <VibeScoreRing score={report.vibeScore} size={100} strokeWidth={9} className="flex-shrink-0" />
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-xl font-black leading-tight text-white tracking-[-0.01em]">{report.venueName}</h2>
              <p className="mt-1 text-xs capitalize text-white/45">
                {report.crowdType} · {report.energyLevel} energy
              </p>
              <div className="mt-3">
                <EnergyBar level={report.energyLevel} />
              </div>
              <span className={`mt-3 inline-flex items-center text-xs font-semibold ${confidenceColor}`}>
                {confidencePct}% confidence
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <SaveSpotButton
                venueId={report.venueId}
                venueName={report.venueName}
                vibeScoreSnapshot={report.vibeScore}
                className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04] text-white/50 hover:border-pink-300/30 hover:bg-pink-300/10 hover:text-white"
              />
              <ShareButton
                venueName={report.venueName}
                vibeScore={report.vibeScore}
                summary={report.summary}
                onCopied={onShareCopied}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vibe tags */}
      <div className="flex flex-wrap gap-2 px-1">
        {report.vibeTags.map((tag) => (
          <VibeTagBadge key={tag} tag={tag} variant="primary" />
        ))}
      </div>

      {/* Detail rows */}
      <Card className="rounded-2xl border-white/[0.07] bg-white/[0.04] text-white shadow-none">
        <CardContent className="px-4 py-1">
          <InfoRow label="Music" value={report.musicVibe} />
          <InfoRow label="Crowd" value={report.crowdType} />
          <InfoRow label="Best for" value={report.bestFor.join(", ")} />
        </CardContent>
      </Card>

      {/* AI summary */}
      <Card className="rounded-2xl border-white/[0.07] bg-white/[0.04] text-white shadow-none">
        <CardContent className="p-4">
          <p className="text-white/70 text-sm leading-relaxed">{report.summary}</p>
          {report.fromPhoto && (
            <p className="mt-3 text-xs text-cyan-200/45">Photo analysis</p>
          )}
        </CardContent>
      </Card>

      {/* Timestamp */}
      <p className="text-white/20 text-xs text-center pb-2">
        {new Date(report.generatedAt).toLocaleString()}
      </p>
    </article>
  );
}

export default VibeReport;
