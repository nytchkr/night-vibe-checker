import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0F] px-4 text-center">
      <p className="text-6xl font-black text-[#00F5D4]">404</p>
      <h1 className="mt-4 text-2xl font-black text-white">This spot doesn&apos;t exist</h1>
      <p className="mt-2 text-sm text-white/45">It may have moved or never been here.</p>
      <Link
        href="/map"
        className="mt-8 rounded-full bg-[#00F5D4] px-6 py-3 text-sm font-black text-[#0A0A0F]"
      >
        ← Back to Map
      </Link>
    </main>
  );
}
