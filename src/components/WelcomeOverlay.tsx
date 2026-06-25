"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const WELCOME_SEEN_STORAGE_KEY = "nightvibe.welcomeSeen";

type WelcomeOverlayProps = {
  onDismiss: () => void;
};

const bullets = [
  {
    icon: MapPin,
    text: "See how busy venues are right now",
  },
  {
    icon: Users,
    text: "Check the crowd vibe from real check-ins",
  },
  {
    icon: Star,
    text: "Save your favorite spots",
  },
];

export function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex min-h-screen-safe items-center justify-center bg-black/80 px-4 py-8 text-white backdrop-blur-sm transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-overlay-title"
      aria-describedby="welcome-overlay-tagline"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#0A0A0E] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_40px_rgba(139,108,255,0.18)]">
        <p
          id="welcome-overlay-title"
          className="font-display text-[40px] font-black leading-none tracking-normal text-white"
        >
          nyt<span className="text-[#8B6CFF]">chkr</span>
        </p>
        <p id="welcome-overlay-tagline" className="mt-3 text-base font-semibold text-white/68">
          Know before you go.
        </p>

        <ul className="mt-7 space-y-3 text-left">
          {bullets.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8B6CFF]/16 text-[#8B6CFF]">
                <Icon className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="text-sm font-black leading-5 text-white/78">{text}</span>
            </li>
          ))}
        </ul>

        <Button
          asChild
          className="mt-7 min-h-[52px] w-full rounded-full bg-[#8B6CFF] text-base font-black text-[#0A0A0E] shadow-[0_0_26px_rgba(139,108,255,0.32)] hover:bg-[#9B82FF]"
          onClick={onDismiss}
        >
          <Link href="/map">Explore the map →</Link>
        </Button>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 text-sm font-semibold text-white/55 transition-colors hover:text-white/70 focus:outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0A0A0E]"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
