"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      setError("Invalid admin password.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0A0F] px-4 text-white">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.03] p-6"
      >
        <p className="text-sm uppercase tracking-[0.2em] text-[#00F5D4]">NightVibe Admin</p>
        <h1 className="mt-2 text-2xl font-bold">Admin login</h1>
        <label className="mt-6 block text-sm text-white/70" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-[#00F5D4]"
          autoComplete="current-password"
          required
        />
        {error ? <p className="mt-3 text-sm text-[#FF2D78]">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-md bg-[#7C3AED] px-4 py-2 font-semibold text-white transition hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Checking..." : "Enter dashboard"}
        </button>
      </form>
    </main>
  );
}
