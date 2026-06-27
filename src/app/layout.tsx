import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Inter, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import { AppOnboardingGate } from "@/components/AppOnboardingGate";
import { BottomNav, SidebarNav } from "@/components/BottomNav";
import { OnboardingGateProvider } from "@/components/OnboardingGate";
import PWAInstallBanner, { PWAInstallVisitTracker } from "@/components/PWAInstallBanner";
import { RoutePrefetch } from "@/components/RoutePrefetch";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const siteUrl = "https://nytchkr.com";
const title = "NightVibe";
const description = "Find the hottest spots in Charlotte tonight";
const themeColor = "#0A0A0E";
const canonicalUrl = "https://nytchkr.com";
const ogImageUrl = `${canonicalUrl}/og-image.png`;

const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"));
const DesktopWarningBanner = dynamic(() => import("@/components/DesktopWarningBanner"));
const inter = Inter({
  subsets: ["latin"],
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
  metadataBase: new URL("https://nytchkr.com"),
  title: {
    default: title,
    template: "%s — NightVibe",
  },
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  themeColor: "#0A0A0E",
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
    title,
    description,
    url: canonicalUrl,
    siteName: "NightVibe",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "NightVibe nightlife vibe tracker preview",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImageUrl],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor,
};

const isDev = process.env.NEXT_PUBLIC_ENV === "development";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} bg-[#0A0A0E] text-white`} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
  (function() {
    function setVh() {
      document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
    }
    setVh();
    window.addEventListener('resize', setVh, { passive: true });
  })();
`,
          }}
        />
        <meta name="theme-color" content="#0A0A0E" />
        <meta name="mobile-web-app-capable" content="yes" />
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
      <body className="h-screen-safe bg-[#0A0A0E] text-white font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10000] focus:rounded-full focus:bg-[#8B6CFF] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-[#0A0A0E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
        >
          Skip to main content
        </a>
        <OfflineBanner />
        <DesktopWarningBanner />
        {isDev && (
          <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center bg-amber-500/90 py-0.5">
            <span className="text-[11px] font-normal leading-[1.5] text-black">
              Dev, not production
            </span>
          </div>
        )}
        <ToastProvider>
          <div className="app-shell h-screen-safe">
            <RoutePrefetch href="/map" />
            <RoutePrefetch href="/explore" />
            <SidebarNav />
            <OnboardingGateProvider>
              <main
                id="main-content"
                tabIndex={-1}
                className={`app-content scroll-touch ${isDev ? "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-5 lg:pb-0 lg:pt-0" : "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"}`}
              >
                {children}
              </main>
              <AppOnboardingGate />
            </OnboardingGateProvider>
          </div>
          <PWAInstallVisitTracker>
            <PWAInstallBanner />
          </PWAInstallVisitTracker>
          <BottomNav />
        </ToastProvider>
        <Script id="service-worker-registration" nonce={nonce} strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');`}
        </Script>
      </body>
    </html>
  );
}
