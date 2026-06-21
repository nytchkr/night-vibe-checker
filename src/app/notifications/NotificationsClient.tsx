"use client";

import { useMemo, useState } from "react";
import { Bell, BellOff, Trash2 } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

export type NotificationPrefs = {
  pushEnabled: boolean;
  savedVenueBusy: boolean;
  subscribedVenueAlerts: boolean;
  friendCheckIns: boolean;
  weeklyLeaderboard: boolean;
};

export type AlertVenue = {
  id: string;
  name: string;
};

type NotificationsClientProps = {
  initialPrefs: NotificationPrefs;
  initialAlertVenues: AlertVenue[];
};

type SaveState = "idle" | "saving" | "saved" | "error";

const PREF_ROWS: Array<{
  key: keyof Omit<NotificationPrefs, "pushEnabled">;
  label: string;
}> = [
  { key: "savedVenueBusy", label: "When my saved venues get busy" },
  { key: "subscribedVenueAlerts", label: "Venue alerts I subscribed to" },
  { key: "friendCheckIns", label: "New check-ins from friends" },
  { key: "weeklyLeaderboard", label: "Weekly leaderboard update" },
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
      className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-[#8B6CFF]/60 bg-[#8B6CFF]/28" : "border-white/15 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-lg transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function NotificationsClient({ initialPrefs, initialAlertVenues }: NotificationsClientProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [alertVenues, setAlertVenues] = useState<AlertVenue[]>(initialAlertVenues);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (saveState === "saving") return "Saving...";
    if (saveState === "saved") return "Saved";
    if (saveState === "error") return "Could not save";
    return null;
  }, [saveState]);

  async function getToken(): Promise<string | null> {
    const { data } = await createBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function savePrefs(nextPrefs: NotificationPrefs) {
    setPrefs(nextPrefs);
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
        body: JSON.stringify({ notificationPrefs: nextPrefs }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
    } catch {
      setPrefs(prefs);
      setSaveState("error");
    }
  }

  async function removeVenueAlert(venueId: string) {
    setRemovingId(venueId);

    try {
      const token = await getToken();
      if (!token) throw new Error("Missing session");

      const res = await fetch(`/api/venues/${encodeURIComponent(venueId)}/alerts`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Remove failed");
      setAlertVenues((venues) => venues.filter((venue) => venue.id !== venueId));
    } catch {
      setSaveState("error");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="Push alerts">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Push Alerts</h2>
          {statusLabel && (
            <p className={`text-xs font-bold ${saveState === "error" ? "text-[#F0568C]" : "text-white/40"}`} role="status">
              {statusLabel}
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[#8B6CFF]">
                {prefs.pushEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-black leading-tight text-white">Enable push notifications</h3>
                {!prefs.pushEnabled && <p className="mt-1 text-sm font-semibold text-white/40">Turn on to get venue updates</p>}
              </div>
            </div>
            <Toggle
              checked={prefs.pushEnabled}
              label="Enable push notifications"
              onClick={() => savePrefs({ ...prefs, pushEnabled: !prefs.pushEnabled })}
              disabled={saveState === "saving"}
            />
          </div>

          {prefs.pushEnabled && (
            <div className="border-t border-white/[0.07]">
              {PREF_ROWS.map((row, index) => (
                <div
                  key={row.key}
                  className={`flex items-center justify-between gap-4 p-4 ${
                    index > 0 ? "border-t border-white/[0.07]" : ""
                  }`}
                >
                  <p className="min-w-0 text-sm font-bold text-white/80">{row.label}</p>
                  <Toggle
                    checked={prefs[row.key]}
                    label={row.label}
                    onClick={() => savePrefs({ ...prefs, [row.key]: !prefs[row.key] })}
                    disabled={saveState === "saving"}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section aria-label="Saved venues">
        <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/40">Saved Venues</h2>
        {alertVenues.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-5">
            <p className="text-sm font-semibold leading-6 text-white/45">
              No venue alerts yet. Tap &apos;Alert Me&apos; on any venue to get notified.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.04]">
            {alertVenues.map((venue, index) => (
              <li
                key={venue.id}
                className={`flex items-center justify-between gap-4 p-4 ${index > 0 ? "border-t border-white/[0.07]" : ""}`}
              >
                <p className="min-w-0 truncate text-sm font-bold text-white">{venue.name}</p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={removingId === venue.id}
                  onClick={() => removeVenueAlert(venue.id)}
                  className="h-9 shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white/60 hover:bg-white/[0.08] hover:text-white"
                >
                  <Trash2 size={14} />
                  {removingId === venue.id ? "Removing" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
