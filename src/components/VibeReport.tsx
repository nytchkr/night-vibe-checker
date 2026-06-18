"use client";

// ============================================================
// VibeReport
//
// Full vibe report display component.
// Renders skeleton placeholders when isLoading=true.
// ============================================================

import type { VibeReport as VibeReportType } from "@/types";
import { VibeScoreRing } from "./VibeScoreRing";
import { VibeTagBadge } from "./VibeTagBadge";
import { ShareButton } from "./ShareButton";

interface VibeReportProps {
  report?: VibeReportType;
  isLoading: boolean;
  /** Optional error message to display instead of report */
  error?: string;
  /** Called when share link is copied to clipboard on desktop */
  onShareCopied?: () => void;
}

// --------------- Skeleton helpers --------------------------

function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/10 ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// --------------- Label row ---------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/10 last:border-0">
      <span className="text-white/50 text-sm">{label}</span>
      <span className="text-white font-medium text-sm text-right">{value}</span>
    </div>
  );
}

// --------------- Confidence indicator ----------------------

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-amber-400" : "text-rose-400";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {pct}% confidence
    </span>
  );
}

// --------------- Main component ----------------------------

export function VibeReport({ report, isLoading, error, onShareCopied }: VibeReportProps) {
  // Error state
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl bg-rose-950/60 border border-rose-500/40 p-6 text-center"
      >
        <p className="text-rose-300 font-medium">{error}</p>
        <p className="text-rose-400/60 text-sm mt-1">
          Try searching for a different venue.
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading vibe report"
        className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-6"
      >
        {/* Header row */}
        <div className="flex items-center gap-5">
          {/* Score ring skeleton */}
          <div className="w-[100px] h-[100px] rounded-full bg-white/10 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        {/* Tags skeleton */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded-full" style={{ width: `${60 + i * 12}px` }} />
          ))}
        </div>
        {/* Info rows skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        {/* Summary skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  // Empty state — no report yet and not loading
  if (!report) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center">
        <p className="text-white/40 text-sm">
          Search for a venue to see its vibe report.
        </p>
      </div>
    );
  }

  // Full report
  return (
    <article
      className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-6"
      aria-label={`Vibe report for ${report.venueName}`}
    >
      {/* Header: score ring + venue name */}
      <header className="flex items-center gap-5">
        <VibeScoreRing score={report.vibeScore} size={100} strokeWidth={9} />
        <div className="min-w-0">
          <h2 className="text-white font-bold text-xl leading-tight truncate">
            {report.venueName}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-white/40 text-xs capitalize">
              {report.energyLevel} energy · {report.crowdType}
            </span>
          </div>
          <div className="mt-1">
            <ConfidencePill confidence={report.confidence} />
          </div>
        </div>
      </header>

      {/* Vibe tags */}
      <section aria-label="Vibe tags">
        <div className="flex flex-wrap gap-2">
          {report.vibeTags.map((tag) => (
            <VibeTagBadge key={tag} tag={tag} variant="primary" />
          ))}
        </div>
      </section>

      {/* Detail rows */}
      <section
        className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-1"
        aria-label="Venue details"
      >
        <InfoRow label="Music" value={report.musicVibe} />
        <InfoRow label="Crowd" value={report.crowdType} />
        <InfoRow label="Energy" value={report.energyLevel} />
        <InfoRow
          label="Best for"
          value={report.bestFor.join(", ")}
        />
      </section>

      {/* AI summary */}
      <section aria-label="AI summary">
        <p className="text-white/80 text-sm leading-relaxed">{report.summary}</p>
      </section>

      {/* Footer meta */}
      <footer className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-white/25 text-xs">
          {report.fromPhoto ? "Photo analysis" : "Text analysis"} ·{" "}
          {new Date(report.generatedAt).toLocaleString()}
        </span>
        <div className="flex items-center gap-3">
          <ShareButton
            venueName={report.venueName}
            vibeScore={report.vibeScore}
            summary={report.summary}
            onCopied={onShareCopied}
          />
          {report.bestFor.slice(0, 2).map((label) => (
            <VibeTagBadge key={label} tag={label} variant="secondary" />
          ))}
        </div>
      </footer>
    </article>
  );
}

export default VibeReport;
