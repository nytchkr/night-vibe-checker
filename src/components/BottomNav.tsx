"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase-browser";

const VIEWED_VENUES_STORAGE_KEY = "nightvibe.viewed_venues";
const EXPLORE_NEW_VENUES_STORAGE_KEY = "nightvibe.explore_has_new_venues";
const EXPLORE_VENUES_EVENT = "nightvibe:explore-venues-updated";
const SAVED_VENUES_EVENT = "nightvibe:saved-venues-changed";

function parseStoredVenueIds(value: string | null): Set<string> {
  if (!value) return new Set();

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))
      : new Set();
  } catch {
    return new Set();
  }
}

function BadgeDot() {
  return (
    <motion.span
      aria-hidden="true"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 28, mass: 0.7 }}
      className="absolute right-0 top-0 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF2D78] shadow-[0_0_10px_rgba(255,45,120,0.65)]"
    />
  );
}

function MapIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z" />
      <circle cx={12} cy={10} r={2.5} fill={filled ? "#0A0A0F" : "none"} stroke={filled ? "#0A0A0F" : "currentColor"} />
    </svg>
  );
}

function ExploreIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={11} cy={11} r={7} fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : undefined} />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function MeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : undefined} />
      <circle cx={12} cy={7} r={4} fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : undefined} />
    </svg>
  );
}

function NavItem({
  href,
  label,
  active,
  showBadge = false,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  showBadge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/60 ${
        active
          ? "text-[#00F5D4]"
          : "text-white/35 hover:text-white/65"
      }`}
    >
      {active && <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#00F5D4]" />}
      <span className="relative">
        {children}
        {showBadge && <BadgeDot />}
      </span>
      <span className="text-[11px] font-normal leading-[1.5]">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [showYouBadge, setShowYouBadge] = useState(false);
  const [showExploreBadge, setShowExploreBadge] = useState(false);
  const mapActive = pathname.startsWith("/map") || pathname === "/";
  const exploreActive = pathname.startsWith("/explore");
  const youActive = pathname.startsWith("/profile");

  useEffect(() => {
    let cancelled = false;
    let client: ReturnType<typeof createBrowserClient>;

    try {
      client = createBrowserClient();
    } catch {
      setShowYouBadge(false);
      return;
    }

    async function refreshYouBadge() {
      const { data: sessionData } = await client.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId) {
        if (!cancelled) setShowYouBadge(false);
        return;
      }

      const { count, error } = await client
        .from("saved_venues")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (!cancelled) setShowYouBadge(!error && (count ?? 0) > 0);
    }

    void refreshYouBadge();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      void refreshYouBadge();
    });
    const handleSavedVenuesChanged = () => {
      void refreshYouBadge();
    };
    const handleFocus = () => {
      void refreshYouBadge();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(SAVED_VENUES_EVENT, handleSavedVenuesChanged);
    };
  }, [pathname]);

  useEffect(() => {
    function refreshExploreBadge() {
      setShowExploreBadge(localStorage.getItem(EXPLORE_NEW_VENUES_STORAGE_KEY) === "true");
    }

    function handleExploreVenuesUpdated(event: Event) {
      const venueIds = (event as CustomEvent<string[]>).detail ?? [];
      const viewedVenueIds = parseStoredVenueIds(localStorage.getItem(VIEWED_VENUES_STORAGE_KEY));
      const hasNewVenues = venueIds.some((id) => !viewedVenueIds.has(id));

      if (exploreActive) {
        localStorage.removeItem(EXPLORE_NEW_VENUES_STORAGE_KEY);
        setShowExploreBadge(false);
        return;
      }

      if (hasNewVenues) {
        localStorage.setItem(EXPLORE_NEW_VENUES_STORAGE_KEY, "true");
      }

      refreshExploreBadge();
    }

    refreshExploreBadge();
    window.addEventListener("storage", refreshExploreBadge);
    window.addEventListener(EXPLORE_VENUES_EVENT, handleExploreVenuesUpdated);

    return () => {
      window.removeEventListener("storage", refreshExploreBadge);
      window.removeEventListener(EXPLORE_VENUES_EVENT, handleExploreVenuesUpdated);
    };
  }, [exploreActive]);

  useEffect(() => {
    if (!exploreActive) return;

    localStorage.removeItem(EXPLORE_NEW_VENUES_STORAGE_KEY);
    setShowExploreBadge(false);
  }, [exploreActive]);

  if (
    pathname.startsWith("/internal") ||
    pathname.startsWith("/agent-board") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/widget")
  ) {
    return null;
  }

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0A0A0F]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-lg items-stretch px-3">
        <NavItem href="/map" label="Map" active={mapActive}>
          <MapIcon filled={mapActive} />
        </NavItem>

        <NavItem href="/explore" label="Explore" active={exploreActive} showBadge={!exploreActive && showExploreBadge}>
          <ExploreIcon filled={exploreActive} />
        </NavItem>

        <NavItem href="/profile" label="You" active={youActive} showBadge={showYouBadge}>
          <MeIcon filled={youActive} />
        </NavItem>
      </div>
    </nav>
  );
}

export default BottomNav;
