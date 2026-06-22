"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ProGateProps = {
  children: ReactNode;
  feature: string;
  variant?: "card" | "compact";
  className?: string;
};

const FEATURES = [
  "AI crowd prediction",
  "Best time to arrive alerts",
  "Vibe forecast 12hrs ahead",
];

export function ProGate({ children, feature, variant = "card", className }: ProGateProps) {
  const { isPro, loading } = useSubscription();

  if (isPro) return <>{children}</>;

  if (variant === "compact") {
    return (
      <Button
        asChild
        aria-label={`Upgrade to Pro for ${feature}`}
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-300/25 bg-violet-400/15 p-0 text-violet-100 hover:bg-violet-400/25 ${className ?? ""}`}
      >
        <Link href="/upgrade">
          <Lock size={18} aria-hidden="true" />
        </Link>
      </Button>
    );
  }

  return (
    <Card className="overflow-hidden border-violet-400/35 bg-violet-950/80 shadow-2xl shadow-violet-950/30 backdrop-blur">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-300/10 text-violet-100">
            <Lock size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-black text-white">NightVibe Pro</p>
            <p className="mt-2 text-sm leading-relaxed text-violet-100/75">
              Unlock {feature} and predict where the night is headed
            </p>
            <ul className="mt-4 grid gap-2 text-sm font-semibold text-white/85">
              {FEATURES.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00F5D4]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-5 w-full bg-[#8B6CFF] font-black text-[#0A0A0E] hover:bg-[#A896FF]">
              <Link href="/upgrade">{loading ? "Checking Pro access..." : "Upgrade to Pro - $4.99/mo"}</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
