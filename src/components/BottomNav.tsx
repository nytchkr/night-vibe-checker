"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  children,
}: {
  href: string;
  label: string;
  active: boolean;
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
      {children}
      <span className="text-[11px] font-normal leading-[1.5]">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  if (
    pathname.startsWith("/internal") ||
    pathname.startsWith("/agent-board") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login")
  ) {
    return null;
  }

  const mapActive = pathname.startsWith("/map") || pathname === "/";
  const exploreActive = pathname.startsWith("/explore");
  const youActive = pathname.startsWith("/profile");

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0A0A0F]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 w-full max-w-lg items-stretch px-3">
        <NavItem href="/map" label="Map" active={mapActive}>
          <MapIcon filled={mapActive} />
        </NavItem>

        <NavItem href="/explore" label="Explore" active={exploreActive}>
          <ExploreIcon filled={exploreActive} />
        </NavItem>

        <NavItem href="/profile" label="You" active={youActive}>
          <MeIcon filled={youActive} />
        </NavItem>
      </div>
    </nav>
  );
}

export default BottomNav;
