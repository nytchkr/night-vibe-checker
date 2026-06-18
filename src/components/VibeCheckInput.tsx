"use client";

// ============================================================
// VibeCheckInput
//
// Form component for kicking off a vibe check.
// Collects venue name (required), optional description,
// and optional photo URL, then calls onSubmit.
// ============================================================

import { useState, FormEvent } from "react";

interface VibeCheckInputProps {
  onSubmit: (input: {
    venueName: string;
    description?: string;
    photoUrl?: string;
  }) => void;
  isLoading?: boolean;
}

export function VibeCheckInput({ onSubmit, isLoading = false }: VibeCheckInputProps) {
  const [venueName, setVenueName] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!venueName.trim()) return;

    onSubmit({
      venueName: venueName.trim(),
      description: description.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-5"
      aria-label="Vibe check form"
    >
      {/* Venue name — required */}
      <div className="space-y-1.5">
        <label
          htmlFor="venueName"
          className="block text-sm font-medium text-white/70"
        >
          Venue name <span className="text-rose-400" aria-hidden="true">*</span>
        </label>
        <input
          id="venueName"
          type="text"
          required
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          placeholder="e.g. The Midnight Lounge"
          disabled={isLoading}
          className="
            w-full rounded-xl bg-white/[0.07] border border-white/10
            text-white placeholder:text-white/30 text-sm
            px-4 py-3
            focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        />
      </div>

      {/* Description — optional */}
      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-white/70"
        >
          Description{" "}
          <span className="text-white/30 font-normal text-xs">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the vibe, what you saw, or anything notable…"
          disabled={isLoading}
          className="
            w-full rounded-xl bg-white/[0.07] border border-white/10
            text-white placeholder:text-white/30 text-sm
            px-4 py-3 resize-none
            focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        />
      </div>

      {/* Photo URL — optional */}
      <div className="space-y-1.5">
        <label
          htmlFor="photoUrl"
          className="block text-sm font-medium text-white/70"
        >
          Photo URL{" "}
          <span className="text-white/30 font-normal text-xs">(optional)</span>
        </label>
        <input
          id="photoUrl"
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://example.com/venue-photo.jpg"
          disabled={isLoading}
          className="
            w-full rounded-xl bg-white/[0.07] border border-white/10
            text-white placeholder:text-white/30 text-sm
            px-4 py-3
            focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !venueName.trim()}
        className="
          w-full py-3 rounded-xl text-sm font-semibold text-white
          bg-gradient-to-r from-purple-600 to-pink-600
          hover:from-purple-500 hover:to-pink-500
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
          transition-all duration-150
        "
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Checking vibe…
          </span>
        ) : (
          "Check Vibe"
        )}
      </button>
    </form>
  );
}

export default VibeCheckInput;
