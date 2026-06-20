import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Night Vibe Checker — Live crowd reports",
  description: "Real-time crowd and vibe reports from nightlife venues. Check before you go.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NightVibe",
  },
  openGraph: {
    title: "Night Vibe Checker — Live crowd reports",
    description: "Real-time crowd and vibe reports from nightlife venues. Check before you go.",
    url: "https://night-vibe-checker.vercel.app",
    siteName: "Night Vibe Checker",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Night Vibe Checker — Live crowd reports",
    description: "Real-time crowd and vibe reports from nightlife venues. Check before you go.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

const isDev = process.env.NEXT_PUBLIC_ENV === "development";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0A0A0F] text-white font-sans antialiased min-h-screen">
        {isDev && (
          <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center bg-amber-500/90 py-0.5">
            <span className="text-black text-[10px] font-bold tracking-widest uppercase">
              DEV — not production
            </span>
          </div>
        )}
        <main className={isDev ? "pb-20 pt-5" : "pb-20"}>{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
