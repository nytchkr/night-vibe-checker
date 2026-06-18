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
  title: "NightVibe — Find Your Scene Tonight",
  description: "AI-powered nightlife vibe checker — find your scene tonight.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
