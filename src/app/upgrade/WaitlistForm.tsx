"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

type SubmitState = "idle" | "submitting" | "success" | "duplicate" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setEmail("");
        setSubmitState("success");
        return;
      }

      setSubmitState(res.status === 409 ? "duplicate" : "error");
    } catch {
      setSubmitState("error");
    }
  }

  const message =
    submitState === "success"
      ? "You're on the list! We'll notify you when Pro launches."
      : submitState === "duplicate"
        ? "Already on the list!"
        : submitState === "error"
          ? "Could not join the waitlist. Try again in a minute."
          : null;

  return (
    <form className="mt-7 space-y-3" onSubmit={handleSubmit}>
      <label htmlFor="waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        className="w-full rounded-md border border-[#8B6CFF] bg-[#1A1A2E] px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70"
      />
      <Button
        type="submit"
        disabled={submitState === "submitting"}
        className="w-full bg-[#8B6CFF] font-black text-white hover:bg-[#A896FF] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitState === "submitting" ? "Joining..." : "Join Waitlist"}
      </Button>
      {message ? (
        <p
          className={`text-sm font-semibold ${
            submitState === "success" ? "text-[#00F5D4]" : submitState === "duplicate" ? "text-violet-100" : "text-red-200"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
