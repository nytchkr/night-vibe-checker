"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, Search, User, type LucideIcon } from "lucide-react";

const VIEWED_VENUES_STORAGE_KEY = "nytchkr.viewed_venues";
const EXPLORE_NEW_VENUES_STORAGE_KEY = "nytchkr.explore_has_new_venues";
const EXPLORE_VENUES_EVENT = "nytchkr:explore-venues-updated";

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
      prefetch
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-16 flex-1 flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-150 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 ${
        active
          ? "text-[#8B6CFF] drop-shadow-[0_0_12px_rgba(139,108,255,0.35)] before:absolute before:inset-0 before:rounded-2xl before:bg-[#8B6CFF]/10"
          : "text-[#9CA2AE] hover:bg-white/[0.04] hover:text-[#F4F5F8]"
      }`}
    >
      <span className="relative z-10 transition-transform duration-150 ease-out group-hover:scale-105">
        {children}
        {showBadge && <BadgeDot />}
        {active && (
          <span
            aria-hidden="true"
            className="absolute -bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[#8B6CFF] shadow-[0_0_12px_rgba(139,108,255,0.7)]"
          />
        )}
      </span>
      <span className={`relative z-10 text-[11px] leading-[1.5] ${active ? "font-semibold" : "font-normal"}`}>
        {label}
      </span>
    </Link>
  );
}

const navItems = [
  { href: "/map", label: "Map", Icon: Map },
  { href: "/explore", label: "Explore", Icon: Search },
  { href: "/profile", label: "You", Icon: User },
];

function shouldHideNavigation(pathname: string): boolean {
  return (
    pathname.startsWith("/internal") ||
    pathname.startsWith("/agent-board") ||
    pathname.startsWith("/admin")
  );
}

function getActiveStates(pathname: string) {
  return {
    mapActive: pathname.startsWith("/map") || pathname === "/",
    exploreActive: pathname.startsWith("/explore"),
    youActive: pathname.startsWith("/profile"),
  };
}

function NavIcon({ Icon, active, filled = false }: { Icon: LucideIcon; active: boolean; filled?: boolean }) {
  return (
    <Icon
      size={24}
      strokeWidth={active ? 2.5 : 2}
      fill={filled && active ? "currentColor" : "none"}
      aria-hidden="true"
    />
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [showExploreBadge, setShowExploreBadge] = useState(false);
  const { mapActive, exploreActive, youActive } = getActiveStates(pathname);

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
      className="app-bottom-nav tap-highlight-none fixed bottom-0 left-0 right-0 z-[1200] border-t border-white/[0.06] bg-[#0A0A0E]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-20px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex h-16 w-full max-w-lg items-stretch px-3">
        <NavItem href="/map" label="Map" active={mapActive}>
          <NavIcon Icon={Map} active={mapActive} />
        </NavItem>

        <NavItem href="/explore" label="Explore" active={exploreActive} showBadge={!exploreActive && showExploreBadge}>
          <NavIcon Icon={Search} active={exploreActive} />
        </NavItem>

        <NavItem href="/profile" label="You" active={youActive}>
          <NavIcon Icon={User} active={youActive} />
        </NavItem>
      </div>
    </nav>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { mapActive, exploreActive, youActive } = getActiveStates(pathname);
  const activeByHref: Record<string, boolean> = {
    "/map": mapActive,
    "/explore": exploreActive,
    "/profile": youActive,
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
            <NavIcon Icon={Icon} active={active} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomNav;
