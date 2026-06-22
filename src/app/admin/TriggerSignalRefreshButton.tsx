"use client";

import { useState } from "react";

type RefreshState = "idle" | "loading" | "success" | "error";

export function TriggerSignalRefreshButton() {
  const [state, setState] = useState<RefreshState>("idle");
  const [message, setMessage] = useState("");

  async function triggerRefresh() {
    setState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/admin/trigger-refresh", {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setState("error");
        setMessage(data?.error?.message ?? "Signal refresh failed.");
        return;
      }

      setState("success");
      setMessage(`Triggered ${Array.isArray(data?.triggered) ? data.triggered.join(", ") : "signal refresh"}.`);
    } catch {
      setState("error");
      setMessage("Signal refresh request failed.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={triggerRefresh}
        disabled={state === "loading"}
        className="rounded-md bg-[#8B6CFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#765AF0] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? "Refreshing..." : "Trigger signal refresh"}
      </button>
      {message ? (
        <p className={`text-sm ${state === "success" ? "text-[#8B6CFF]" : "text-[#F0568C]"}`}>{message}</p>
      ) : null}
    </div>
  );
}
