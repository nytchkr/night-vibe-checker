import Link from "next/link";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { WaitlistForm } from "./WaitlistForm";

const FEATURES = [
  "Full-week BestTime crowd forecast",
  "Best time to arrive alerts",
  "Vibe summary from real Google reviews",
  "Early access to new Pro signals",
];

export const metadata = {
  title: "NightVibe Pro | NightVibe",
};

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-[#0A0A0E] px-4 pb-24 pt-6 text-white">
      <div className="mx-auto max-w-md">
        <Link
          href="/map"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/60"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back
        </Link>

        <section className="mt-8 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-xs font-black uppercase text-violet-100">
            <Clock size={14} aria-hidden="true" />
            Coming Soon
          </div>
          <div>
            <h1 className="font-display text-4xl font-black tracking-normal text-white">NightVibe Pro</h1>
            <p className="mt-3 text-base leading-relaxed text-white/62">
              Predict the best time to arrive and see where the night is headed before you get there.
            </p>
          </div>
        </section>

        <Card className="mt-8 overflow-hidden border-violet-400/35 bg-violet-950/70 shadow-2xl shadow-violet-950/30 backdrop-blur">
          <CardContent className="p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-violet-100/70">Pro plan</p>
                <p className="mt-2 font-display text-3xl font-black text-white">$4.99/mo</p>
              </div>
              <span className="rounded-full border border-[#00F5D4]/30 bg-[#00F5D4]/10 px-3 py-1 text-xs font-black text-[#00F5D4]">
                Waitlist
              </span>
            </div>

            <ul className="mt-6 grid gap-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm font-semibold text-white/85">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#00F5D4]/12 text-[#00F5D4]">
                    <Check size={15} strokeWidth={3} aria-hidden="true" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <WaitlistForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
