"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" stroke={filled ? "none" : "currentColor"} fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

function ExploreIcon({ filled }: { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={12} cy={12} r={10} />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
        fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

function ProfileIcon({ filled }: { filled?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/discover", label: "Explore", icon: ExploreIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/agent-board")) {
    return null;
  }

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.08] bg-[#07070B]/92 backdrop-blur-2xl safe-area-inset-bottom"
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch px-3 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={`
                relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2.5
                transition-all duration-150 focus:outline-none focus-visible:ring-2
                focus-visible:ring-[#00F5D4]/50
                ${isActive ? "bg-white/[0.07] text-[#00F5D4] shadow-[0_0_18px_rgba(0,245,212,0.08)]" : "text-white/38 hover:bg-white/[0.04] hover:text-white/75"}
              `}
            >
              <Icon filled={isActive} />
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
              {isActive && (
                <span className="absolute bottom-1 h-0.5 w-7 rounded-full bg-[#00F5D4]/80" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNav;
