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
      strokeWidth={filled ? 0 : 2}
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
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={11} cy={11} r={7} />
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
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx={12} cy={7} r={4} />
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
      className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5D4]/50 ${
        active
          ? "bg-white/[0.07] text-[#00F5D4] shadow-[0_0_18px_rgba(0,245,212,0.08)]"
          : "text-white/38 hover:bg-white/[0.04] hover:text-white/75"
      }`}
    >
      {children}
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
      {active && <span className="absolute bottom-1 h-0.5 w-7 rounded-full bg-[#00F5D4]/80" />}
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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#07070B]/92 backdrop-blur-2xl safe-area-inset-bottom"
    >
      <div className="mx-auto flex w-full max-w-lg items-end gap-1 px-3 py-2">
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
