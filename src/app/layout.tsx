import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// ============================================================
// Root layout — NightVibe App
// Dark background, Inter font, fixed bottom nav.
// ============================================================

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NightVibe",
  description: "AI-powered nightlife vibe checker — find your scene tonight.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// --------------- Bottom nav icons (inline SVG, no external deps) -----

function HomeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={12} cy={12} r={10} />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  );
}

// --------------- Nav item ----------------------------------------

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function NavItem({ href, label, icon }: NavItemProps) {
  return (
    <Link
      href={href}
      className="
        flex flex-col items-center justify-center gap-1
        flex-1 py-2
        text-white/40 hover:text-white
        transition-colors duration-150
        focus:outline-none focus-visible:text-white
      "
      aria-label={label}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </Link>
  );
}

// --------------- Root layout -------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0A0F] text-white font-sans antialiased min-h-screen">
        {/* Main content — padded at the bottom so content clears the nav */}
        <main className="pb-20">{children}</main>

        {/* Fixed bottom navigation bar */}
        <nav
          aria-label="Main navigation"
          className="
            fixed bottom-0 left-0 right-0 z-50
            flex items-stretch
            bg-[#0A0A0F]/90 backdrop-blur-xl
            border-t border-white/10
            safe-area-inset-bottom
          "
        >
          <NavItem href="/" label="Home" icon={<HomeIcon />} />
          <NavItem href="/discover" label="Explore" icon={<ExploreIcon />} />
          <NavItem href="/profile" label="Profile" icon={<ProfileIcon />} />
        </nav>
      </body>
    </html>
  );
}
