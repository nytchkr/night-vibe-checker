import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0F] px-4 text-center text-white">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">404</p>
      <h1 className="mt-3 text-2xl font-black">Page not found</h1>
      <Link
        href="/"
        className="mt-6 rounded-full bg-[#7C3AED] px-5 py-2 text-sm font-bold text-white"
      >
        Back home
      </Link>
    </main>
  );
}
