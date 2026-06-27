"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Send, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useHaptic } from "@/hooks/useHaptic";
import { createBrowserClient } from "@/lib/supabase-browser";

type VenueTip = {
  id: string;
  tip_text: string;
  created_at: string;
  helpful_count: number;
  author_initials: string;
};

const MAX_TIP_LENGTH = 200;
const MAX_VISIBLE_TIPS = 5;

function normalizeTips(json: unknown): VenueTip[] {
  const source = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: { tips?: unknown[] } })?.data?.tips)
      ? (json as { data: { tips: unknown[] } }).data.tips
      : [];

  return source
    .map((tip) => {
      const value = tip as Partial<VenueTip> & { tip?: string; createdAt?: string };
      return {
        id: typeof value.id === "string" ? value.id : "",
        tip_text: typeof value.tip_text === "string" ? value.tip_text : typeof value.tip === "string" ? value.tip : "",
        created_at: typeof value.created_at === "string" ? value.created_at : typeof value.createdAt === "string" ? value.createdAt : "",
        helpful_count:
          typeof value.helpful_count === "number"
            ? value.helpful_count
            : typeof (value as { helpfulCount?: unknown }).helpfulCount === "number"
              ? (value as { helpfulCount: number }).helpfulCount
              : 0,
        author_initials:
          typeof (value as { author_initials?: unknown }).author_initials === "string"
            ? (value as { author_initials: string }).author_initials
            : "NV",
      };
    })
    .filter((tip) => tip.id && tip.tip_text)
    .slice(0, MAX_VISIBLE_TIPS);
}

function formatTipDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function VenueTips({ venueId }: { venueId: string }) {
  const haptic = useHaptic();
  const [tips, setTips] = useState<VenueTip[]>([]);
  const [tipText, setTipText] = useState("");
  const [composing, setComposing] = useState(false);
  const [expandedTipIds, setExpandedTipIds] = useState<Set<string>>(() => new Set());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTip = tipText.trim();
  const remaining = MAX_TIP_LENGTH - tipText.length;
  const canSubmit = Boolean(accessToken) && trimmedTip.length > 0 && tipText.length <= MAX_TIP_LENGTH && !submitting;

  useEffect(() => {
    if (!venueId) return;
    const controller = new AbortController();

    async function fetchTips() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/venues/${encodeURIComponent(venueId)}/tips`, { signal: controller.signal });
        if (!res.ok) throw new Error(`${res.status}`);
        setTips(normalizeTips(await res.json()));
      } catch {
        if (!controller.signal.aborted) {
          setTips([]);
          setError("Could not load tips.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void fetchTips();
    return () => controller.abort();
  }, [venueId]);

  useEffect(() => {
    const client = createBrowserClient();
    let cancelled = false;

    async function fetchAuthState() {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      setAccessToken(data.session?.access_token ?? null);
      setAuthChecked(true);
    }

    void fetchAuthState();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setAuthChecked(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function submitTip() {
    if (!canSubmit || !accessToken) return;

    haptic.light();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/venues/${encodeURIComponent(venueId)}/tips`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tip_text: trimmedTip }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const savedTip = normalizeTips([await res.json()])[0];
      if (savedTip) setTips((current) => [savedTip, ...current].slice(0, MAX_VISIBLE_TIPS));
      setTipText("");
      setComposing(false);
    } catch {
      setError("Could not save that tip.");
    } finally {
      setSubmitting(false);
    }
  }

  async function markHelpful(tipId: string) {
    haptic.light();
    setError(null);
    try {
      const res = await fetch(`/api/tips/${encodeURIComponent(tipId)}/helpful`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = (await res.json()) as { data?: { tip?: { helpfulCount?: number } } };
      const helpfulCount = json.data?.tip?.helpfulCount;
      if (typeof helpfulCount !== "number") return;
      setTips((current) => current.map((tip) => (tip.id === tipId ? { ...tip, helpful_count: helpfulCount } : tip)));
    } catch {
      setError("Could not mark that tip helpful.");
    }
  }

  function toggleExpanded(tipId: string) {
    setExpandedTipIds((current) => {
      const next = new Set(current);
      if (next.has(tipId)) {
        next.delete(tipId);
      } else {
        next.add(tipId);
      }
      return next;
    });
  }

  const tipItems = useMemo(() => tips.slice(0, MAX_VISIBLE_TIPS), [tips]);

  return (
    <section className="space-y-3 border-t border-white/[0.06] pt-5" role="region" aria-label="Venue tips">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Tips</h2>
          <p className="mt-1 text-xs font-semibold text-white/40">Short notes from people who have been here.</p>
        </div>
        {authChecked && accessToken ? (
          <Button
            type="button"
            onClick={() => setComposing(true)}
            className="shrink-0 rounded-full bg-[#8B6CFF] px-4 font-bold text-[#0A0A0E] hover:bg-[#A896FF]"
          >
            <Plus size={16} aria-hidden="true" />
            Add a tip
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Loading...">
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
        </div>
      ) : tipItems.length > 0 ? (
        <ul className="space-y-2">
          {tipItems.map((tip) => (
            <li key={tip.id} className="rounded-xl bg-white/5 p-3">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B6CFF] to-[#F0568C] text-xs font-black text-[#0A0A0E] shadow-[0_0_18px_rgba(139,108,255,0.25)]">
                  {tip.author_initials.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-relaxed text-white/80 ${
                      expandedTipIds.has(tip.id)
                        ? ""
                        : "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
                    }`}
                  >
                    {tip.tip_text}
                  </p>
                  {tip.tip_text.length > 120 ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(tip.id)}
                      className="mt-1 text-xs font-bold text-[#8B6CFF] transition-colors hover:text-[#A896FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
                    >
                      {expandedTipIds.has(tip.id) ? "Show less" : "Read more"}
                    </button>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {tip.created_at ? (
                      <time dateTime={tip.created_at} className="block text-xs font-medium text-white/40">
                        {formatTipDate(tip.created_at)}
                      </time>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => void markHelpful(tip.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-white/60 transition-colors hover:border-[#F0568C]/40 hover:bg-[#F0568C]/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F0568C]/70"
                      aria-label={`${tip.helpful_count} people found this tip helpful`}
                    >
                      <ThumbsUp size={13} aria-hidden="true" />
                      {tip.helpful_count}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-[#8B6CFF]/20 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white/70">No tips yet — be the first!</p>
          {authChecked && accessToken ? (
            <Button
              type="button"
              onClick={() => setComposing(true)}
              className="mt-3 rounded-full bg-[#F0568C] px-4 font-bold text-[#0A0A0E] hover:bg-[#FF7AA6]"
            >
              <Plus size={16} aria-hidden="true" />
              Add a tip
            </Button>
          ) : null}
        </div>
      )}

      {authChecked && accessToken && composing ? (
        <div className="space-y-2">
          <Textarea
            value={tipText}
            maxLength={MAX_TIP_LENGTH}
            onChange={(event) => setTipText(event.target.value)}
            placeholder="Leave a short tip"
            aria-label="Leave a short tip"
            className="min-h-[88px] resize-none rounded-xl bg-white/5 text-sm text-white/80 placeholder:text-[#9CA2AE]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs font-medium ${remaining < 0 ? "text-[#F0568C]" : "text-white/40"}`}>
              {remaining} left
            </span>
            <Button
              type="button"
              onClick={() => void submitTip()}
              disabled={!canSubmit}
              className="rounded-full bg-[#8B6CFF] px-4 font-bold text-[#0A0A0E] hover:bg-[#A896FF]"
            >
              <Send size={16} aria-hidden="true" />
              Submit
            </Button>
          </div>
        </div>
      ) : authChecked && !accessToken ? (
        <a
          href={`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`}
          className="block rounded-xl border border-[#8B6CFF]/30 bg-[#8B6CFF]/10 p-3 text-center text-sm font-bold text-white transition-colors hover:bg-[#8B6CFF]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Sign in to leave a tip
        </a>
      ) : null}

      {error ? <p className="text-xs font-medium text-[#F0568C]">{error}</p> : null}
    </section>
  );
}
