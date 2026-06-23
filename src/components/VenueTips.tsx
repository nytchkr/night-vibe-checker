"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useHaptic } from "@/hooks/useHaptic";
import { createBrowserClient } from "@/lib/supabase-browser";

type VenueTip = {
  id: string;
  tip_text: string;
  created_at: string;
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
    } catch {
      setError("Could not save that tip.");
    } finally {
      setSubmitting(false);
    }
  }

  const tipItems = useMemo(() => tips.slice(0, MAX_VISIBLE_TIPS), [tips]);

  return (
    <section className="space-y-3 border-t border-white/[0.06] pt-5" role="region" aria-label="Venue tips">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Tips</h2>
          <p className="mt-1 text-xs font-semibold text-white/40">Short notes from people who have been here.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Loading venue tips">
          <div className="h-16 rounded-xl bg-white/5" />
          <div className="h-16 rounded-xl bg-white/5" />
        </div>
      ) : tipItems.length > 0 ? (
        <ul className="space-y-2">
          {tipItems.map((tip) => (
            <li key={tip.id} className="rounded-xl bg-white/5 p-3">
              <p className="text-sm leading-relaxed text-white/80">{tip.tip_text}</p>
              {tip.created_at ? (
                <time dateTime={tip.created_at} className="mt-2 block text-xs font-medium text-white/40">
                  {formatTipDate(tip.created_at)}
                </time>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-white/5 p-3 text-sm text-white/50">No tips yet.</p>
      )}

      {authChecked && accessToken ? (
        <div className="space-y-2">
          <Textarea
            value={tipText}
            maxLength={MAX_TIP_LENGTH}
            onChange={(event) => setTipText(event.target.value)}
            placeholder="Leave a short tip"
            aria-label="Leave a short tip"
            className="min-h-[88px] resize-none rounded-xl bg-white/5 text-sm text-white/80 placeholder:text-white/35"
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
      ) : (
        <a
          href={`/login?return=${encodeURIComponent(`/venues/${venueId}`)}`}
          className="block rounded-xl border border-[#8B6CFF]/30 bg-[#8B6CFF]/10 p-3 text-center text-sm font-bold text-white transition-colors hover:bg-[#8B6CFF]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
        >
          Sign in to leave a tip
        </a>
      )}

      {error ? <p className="text-xs font-medium text-[#F0568C]">{error}</p> : null}
    </section>
  );
}
