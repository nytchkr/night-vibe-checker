"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createBrowserClient } from "@/lib/supabase-browser";

type ProGateProps = {
  children: ReactNode;
  feature: string;
};

type ProState = "loading" | "pro" | "locked";

export function ProGate({ children, feature }: ProGateProps) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [state, setState] = useState<ProState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function checkProAccess() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) setState("locked");
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("subscription_status")
        .eq("id", userId)
        .single();

      if (!cancelled) {
        setState(data?.subscription_status === "active" ? "pro" : "locked");
      }
    }

    void checkProAccess().catch(() => {
      if (!cancelled) setState("locked");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      setState("loading");
      void checkProAccess().catch(() => {
        if (!cancelled) setState("locked");
      });
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  if (state === "pro") return <>{children}</>;

  return (
    <Card className="overflow-hidden rounded-[22px] border-white/[0.08] bg-white/[0.04]">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#8B6CFF]/35 bg-[#8B6CFF]/15 text-[#8B6CFF]">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#00F5D4]">Pro</p>
            <h2 className="mt-1 font-display text-lg font-black text-white">{feature}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/55">
              Unlock full-week BestTime forecasts, saved-venue busy alerts, and more neighborhoods.
            </p>
            <Button
              asChild
              className="mt-4 h-11 rounded-full bg-[#8B6CFF] px-5 text-sm font-black text-[#0A0A0E] hover:bg-[#A896FF]"
              disabled={state === "loading"}
            >
              <Link href="/api/stripe/checkout?plan=pro">Upgrade to Pro</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
