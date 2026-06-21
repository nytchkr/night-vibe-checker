import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BottomNav } from "@/components/BottomNav";
import { OnboardingGateProvider } from "@/components/OnboardingGate";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://night-vibe-checker.vercel.app";
const title = "nytchkr — Know the vibe before you go";
const description = "Real-time busyness and crowd vibe for bars and clubs in Charlotte, NC.";
const themeColor = "#8B6CFF";

const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"));
const inter = Inter({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "nytchkr",
  },
  openGraph: {
    title: "nytchkr",
    description: "Real-time busyness for Charlotte nightlife.",
    url: "https://nytchkr.com",
    siteName: "nytchkr",
    images: ["/opengraph-image"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "nytchkr",
    description: "Know the vibe before you go.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor,
};

const isDev = process.env.NEXT_PUBLIC_ENV === "development";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <meta name="theme-color" content={themeColor} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://b.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://c.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-[#0A0A0E] text-white font-sans antialiased min-h-screen">
        <OfflineBanner />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10000] focus:rounded-full focus:bg-[#8B6CFF] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-[#0A0A0E] focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        {isDev && (
          <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center bg-amber-500/90 py-0.5">
            <span className="text-[11px] font-normal leading-[1.5] text-black">
              Dev, not production
            </span>
          </div>
        )}
        <OnboardingGateProvider>
          <main id="main-content" tabIndex={-1} className={isDev ? "pb-20 pt-5" : "pb-20"}>
            {children}
          </main>
        </OnboardingGateProvider>
        <Analytics />
        <SpeedInsights />
        <BottomNav />
        <Script id="service-worker-registration" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`}
        </Script>
      </body>
    </html>
  );
}
