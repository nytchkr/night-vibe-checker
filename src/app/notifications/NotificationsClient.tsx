"use client";

import { useMemo, useState } from "react";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

export type NotificationPrefs = {
  notifyBusyVenues: boolean;
  notifyWeeklySummary: boolean;
};

type NotificationsClientProps = {
  initialPrefs: NotificationPrefs;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const PREF_ROWS: Array<{
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}> = [
  {
    key: "notifyBusyVenues",
    label: "Notify me when a saved venue gets busy",
    description: "Get a heads-up when a saved spot starts heating up.",
  },
  {
    key: "notifyWeeklySummary",
    label: "Weekly neighborhood summary",
    description: "A weekly recap of venue movement in your launch neighborhood.",
  },
];

function Toggle({
  checked,
  label,
  onClick,
  disabled,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative min-h-11 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-[#8B6CFF]/60 bg-[#8B6CFF]/28" : "border-white/15 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-white/20 bg-[#111117] shadow-lg transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function NotificationsClient({ initialPrefs }: NotificationsClientProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const statusLabel = useMemo(() => {
    if (saveState === "saving") return "Saving...";
    if (saveState === "saved") return "Notification preferences saved.";
    if (saveState === "error") return "Could not save notification preferences.";
    return null;
  }, [saveState]);

  const hasChanges =
    prefs.notifyBusyVenues !== savedPrefs.notifyBusyVenues ||
    prefs.notifyWeeklySummary !== savedPrefs.notifyWeeklySummary;

  async function getToken(): Promise<string | null> {
    const { data } = await createBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function savePrefs() {
    setSaveState("saving");

    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session");

      const res = await fetch("/api/profile/notification-prefs", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notificationPrefs: prefs }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSavedPrefs(prefs);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="relative space-y-6">
      {saveState === "saved" && (
        <div
          className="fixed left-1/2 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#00F5D4]/25 bg-[#101018] px-4 py-3 text-sm font-black text-white shadow-2xl shadow-black/30"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00F5D4]" aria-hidden="true" />
          Notification preferences saved.
        </div>
      )}

      <section aria-label="Notification preferences">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Preferences</h2>
          {statusLabel && (
            <p className={`text-xs font-bold ${saveState === "error" ? "text-[#F0568C]" : "text-white/40"}`} role="status">
              {statusLabel}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
          {PREF_ROWS.map((row, index) => (
            <div
              key={row.key}
              className={`flex items-center justify-between gap-4 p-4 ${index > 0 ? "border-t border-white/[0.07]" : ""}`}
            >
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[#8B6CFF]">
                  <Bell size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-black leading-tight text-white">{row.label}</h3>
                  <p className="mt-1 text-sm font-semibold leading-5 text-white/40">{row.description}</p>
                </div>
              </div>
              <Toggle
                checked={prefs[row.key]}
                label={row.label}
                onClick={() => {
                  setPrefs((current) => ({ ...current, [row.key]: !current[row.key] }));
                  setSaveState("idle");
                }}
                disabled={saveState === "saving"}
              />
            </div>
          ))}
        </div>

        <Button
          type="button"
          disabled={saveState === "saving" || !hasChanges}
          onClick={() => void savePrefs()}
          className="mt-5 min-h-[52px] w-full rounded-full bg-[#8B6CFF] text-sm font-black text-white hover:bg-[#7A5CF2] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving
            </>
          ) : (
            "Save preferences"
          )}
        </Button>
      </section>
    </div>
  );
}
