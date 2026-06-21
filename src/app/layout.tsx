import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const siteUrl = "https://night-vibe-checker.vercel.app";
const title = "NightVibe — South End Charlotte";
const description = "See how busy South End bars and clubs are right now. Real-time crowd vibes.";
const ogImage = "/og-image.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NightVibe",
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "NightVibe",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

const isDev = process.env.NEXT_PUBLIC_ENV === "development";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://a.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://b.basemaps.cartocdn.com" />
        <link rel="preconnect" href="https://c.basemaps.cartocdn.com" />
      </head>
      <body className="bg-[#0A0A0F] text-white font-sans antialiased min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10000] focus:rounded-full focus:bg-[#00F5D4] focus:px-4 focus:py-2 focus:text-[13px] focus:font-medium focus:text-[#0A0A0F] focus:outline-none focus:ring-2 focus:ring-white"
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
        <main id="main-content" tabIndex={-1} className={isDev ? "pb-20 pt-5" : "pb-20"}>
          {children}
        </main>
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
