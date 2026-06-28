"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWED_VENUES_STORAGE_KEY = "nightvibe.viewed_venues";
const EXPLORE_NEW_VENUES_STORAGE_KEY = "nightvibe.explore_has_new_venues";
const EXPLORE_VENUES_EVENT = "nightvibe:explore-venues-updated";
const STREAK_UPDATED_EVENT = "nightvibe:streak-changed";

type UserStreakResponse = {
  streak?: number | null;
};

type YouStreakContextValue = {
  hasActiveStreak: boolean;
  refreshStreak: () => void;
};

const YouStreakContext = createContext<YouStreakContextValue>({
  hasActiveStreak: false,
  refreshStreak: () => undefined,
});

export function YouStreakProvider({ children }: { children: React.ReactNode }) {
  const [hasActiveStreak, setHasActiveStreak] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshStreak = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadStreak(accessToken: string | null | undefined) {
      if (!accessToken) {
        if (!cancelled) setHasActiveStreak(false);
        return;
      }

      try {
        const res = await fetch("/api/user/streak", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });

        if (!res.ok) {
          if (!cancelled) setHasActiveStreak(false);
          return;
        }

        const data = (await res.json()) as UserStreakResponse;
        if (!cancelled) setHasActiveStreak((data.streak ?? 0) >= 1);
      } catch {
        if (!cancelled) setHasActiveStreak(false);
      }
    }

    async function startStreakSync() {
      try {
        const { createBrowserClient } = await import("@/lib/supabase-browser");
        const client = createBrowserClient();
        const { data: sessionData } = await client.auth.getSession();

        if (cancelled) return;
        void loadStreak(sessionData.session?.access_token);

        const {
          data: { subscription },
        } = client.auth.onAuthStateChange((_event, session) => {
          void loadStreak(session?.access_token);
        });
        unsubscribe = () => subscription.unsubscribe();
      } catch {
        if (!cancelled) setHasActiveStreak(false);
      }
    }

    function handleFocus() {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(refreshStreak, 2000);
    }

    void startStreakSync();
    window.addEventListener("focus", handleFocus);
    window.addEventListener(STREAK_UPDATED_EVENT, refreshStreak);

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(STREAK_UPDATED_EVENT, refreshStreak);
    };
  }, [refreshKey, refreshStreak]);

  const value = useMemo(
    () => ({ hasActiveStreak, refreshStreak }),
    [hasActiveStreak, refreshStreak],
  );

  return <YouStreakContext.Provider value={value}>{children}</YouStreakContext.Provider>;
}

function useYouStreak() {
  return useContext(YouStreakContext);
}

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
    <span
      aria-hidden="true"
      className="absolute right-0 top-0 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F0568C] shadow-[0_0_10px_rgba(240,86,140,0.65)]"
    />
  );
}

function StreakDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[#8B6CFF]"
    />
  );
}

function MapIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11z" />
      <circle cx={12} cy={10} r={2.5} fill={filled ? "#0A0A0E" : "none"} stroke={filled ? "#0A0A0E" : "currentColor"} />
    </svg>
  );
}

function ExploreIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
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

function VibeCheckIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4h8" />
      <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : undefined} />
      <path d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : undefined} />
      <path d="m9 13 2 2 4-5" />
    </svg>
  );
}

function YouIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
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
  badgeVariant = "default",
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  showBadge?: boolean;
  badgeVariant?: "default" | "streak";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-150 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
        active
          ? "text-[#8B6CFF] drop-shadow-[0_0_12px_rgba(139,108,255,0.35)]"
          : "text-[#9CA2AE] hover:bg-white/[0.04] hover:text-[#F4F5F8]"
      }`}
    >
      <span className="relative transition-transform duration-150 ease-out group-hover:scale-105">
        {children}
        {showBadge && (badgeVariant === "streak" ? <StreakDot /> : <BadgeDot />)}
        {active && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#8B6CFF] shadow-[0_0_12px_rgba(139,108,255,0.7)]"
          />
        )}
      </span>
      <span className="text-[11px] font-normal leading-[1.5]">{label}</span>
    </Link>
  );
}

const navItems = [
  { href: "/map", label: "Map", Icon: MapIcon },
  { href: "/explore", label: "Explore", Icon: ExploreIcon },
  { href: "/vibe-check", label: "Vibe", Icon: VibeCheckIcon },
  { href: "/you", label: "You", Icon: YouIcon },
];

function shouldHideNavigation(pathname: string): boolean {
  return (
    pathname.startsWith("/internal") ||
    pathname.startsWith("/agent-board") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/widget")
  );
}

function getActiveStates(pathname: string) {
  return {
    mapActive: pathname.startsWith("/map") || pathname === "/",
    exploreActive: pathname.startsWith("/explore"),
    vibeCheckActive: pathname.startsWith("/vibe-check"),
    youActive: pathname.startsWith("/you") || pathname.startsWith("/profile"),
  };
}

export function BottomNav() {
  const pathname = usePathname();
  const [showExploreBadge, setShowExploreBadge] = useState(false);
  const { hasActiveStreak } = useYouStreak();
  const { mapActive, exploreActive, vibeCheckActive, youActive } = getActiveStates(pathname);

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

  if (shouldHideNavigation(pathname)) {
    return null;
  }

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="app-bottom-nav tap-highlight-none fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0A0A0E]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex h-16 w-full max-w-lg items-stretch px-3">
        <NavItem href="/explore" label="Explore" active={exploreActive} showBadge={!exploreActive && showExploreBadge}>
          <ExploreIcon filled={exploreActive} />
        </NavItem>

        <NavItem href="/map" label="Map" active={mapActive}>
          <MapIcon filled={mapActive} />
        </NavItem>

        <NavItem href="/vibe-check" label="Vibe" active={vibeCheckActive}>
          <VibeCheckIcon filled={vibeCheckActive} />
        </NavItem>

        <NavItem href="/you" label="You" active={youActive} showBadge={hasActiveStreak} badgeVariant="streak">
          <YouIcon filled={youActive} />
        </NavItem>
      </div>
    </nav>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { mapActive, exploreActive, vibeCheckActive, youActive } = getActiveStates(pathname);
  const activeByHref: Record<string, boolean> = {
    "/map": mapActive,
    "/explore": exploreActive,
    "/vibe-check": vibeCheckActive,
    "/you": youActive,
  };

  if (shouldHideNavigation(pathname)) {
    return null;
  }

  return (
    <nav className="app-sidebar tap-highlight-none hidden lg:flex flex-col fixed left-0 top-0 h-full w-60 bg-[#101017] border-r border-white/[0.06] z-50 py-8 px-4 gap-1" aria-label="Main navigation">
      <div className="mb-8 px-2">
        <span className="font-display text-[22px] font-semibold text-white tracking-tight">nytchkr</span>
      </div>
      {navItems.map(({ href, label, Icon }) => {
        const active = activeByHref[href];
        return (
          <Link
            key={href}
            href={href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-[48px] items-center gap-3 rounded-r-2xl border-l-2 px-4 py-3 text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
              active
                ? "border-[#8B6CFF] bg-[#8B6CFF]/10 text-[#8B6CFF] shadow-[0_0_18px_rgba(139,108,255,0.18)]"
                : "border-transparent text-[#9CA2AE] hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-[#F4F5F8]"
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-full bg-[#8B6CFF] shadow-[0_0_14px_rgba(139,108,255,0.65)]"
              />
            )}
            <Icon filled={active} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomNav;
