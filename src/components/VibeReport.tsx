"use client";

import type { VibeReport as VibeReportType } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { ShareButton } from "./ShareButton";
import { SaveSpotButton } from "./SaveSpotButton";

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
      <div role="alert" className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-6 text-center">
        <p className="text-rose-300 font-medium">{error}</p>
        <p className="text-rose-400/60 text-sm mt-1">Try searching for a different venue.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading vibe report" className="rounded-2xl bg-white/[0.04] border border-white/10 p-6 space-y-6">
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
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-8 text-center">
        <p className="text-white/40 text-sm">Search for a venue to see its vibe report.</p>
      </div>
    );
  }

  const confidencePct = Math.round(report.confidence * 100);
  const confidenceColor = confidencePct >= 70 ? "text-emerald-400" : confidencePct >= 40 ? "text-amber-400" : "text-rose-400";

  return (
    <article
      className="space-y-4"
      aria-label={`Vibe report for ${report.venueName}`}
    >
      {/* Score card */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
        <div className="flex items-start gap-4">
          <VibeScoreRing score={report.vibeScore} size={88} strokeWidth={8} className="flex-shrink-0" />
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-white font-bold text-lg leading-tight">{report.venueName}</h2>
            <p className="text-white/40 text-xs mt-1 capitalize">
              {report.crowdType} · {report.energyLevel} energy
            </p>
            <div className="mt-2">
              <EnergyBar level={report.energyLevel} />
            </div>
            <span className={`text-xs font-medium mt-1.5 block ${confidenceColor}`}>
              {confidencePct}% confidence
            </span>
          </div>
          {/* Action buttons in top-right of card */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <SaveSpotButton
              venueId={report.venueId}
              venueName={report.venueName}
              vibeScoreSnapshot={report.vibeScore}
              className="w-8 h-8 text-white/50 hover:text-white"
            />
            <ShareButton
              venueName={report.venueName}
              vibeScore={report.vibeScore}
              summary={report.summary}
              onCopied={onShareCopied}
            />
          </div>
        </div>
      </div>

      {/* Vibe tags */}
      <div className="flex flex-wrap gap-2 px-1">
        {report.vibeTags.map((tag) => (
          <VibeTagBadge key={tag} tag={tag} variant="primary" />
        ))}
      </div>

      {/* Detail rows */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] px-4 py-1">
        <InfoRow label="Music" value={report.musicVibe} />
        <InfoRow label="Crowd" value={report.crowdType} />
        <InfoRow label="Best for" value={report.bestFor.join(", ")} />
      </div>

      {/* AI summary */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4">
        <p className="text-white/70 text-sm leading-relaxed">{report.summary}</p>
        {report.fromPhoto && (
          <p className="text-white/30 text-xs mt-2 flex items-center gap-1.5">
            <span>📸</span> AI analysis via photo
          </p>
        )}
      </div>

      {/* Timestamp */}
      <p className="text-white/20 text-xs text-center pb-2">
        {new Date(report.generatedAt).toLocaleString()}
      </p>
    </article>
  );
}

export default VibeReport;
