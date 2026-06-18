"use client";

// ============================================================
// VibeCheckInput
//
// Form component for kicking off a vibe check.
// Collects venue name (required), optional description,
// and optional photo URL, then calls onSubmit.
// ============================================================

import { useState, FormEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface VibeCheckInputProps {
  onSubmit: (input: {
    venueName: string;
    description?: string;
    photoBase64?: string;
  }) => void;
  isLoading?: boolean;
  /** Pre-fill the venue name field (e.g. from URL query params) */
  initialVenueName?: string;
}

export function VibeCheckInput({ onSubmit, isLoading = false, initialVenueName = "" }: VibeCheckInputProps) {
  const [venueName, setVenueName] = useState(initialVenueName);
  const [description, setDescription] = useState("");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoBase64(result); // full data URL; API strips the prefix
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
  }

  function updateVenueName(value: string) {
    setVenueName(value);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!venueName.trim()) return;

    onSubmit({
      venueName: venueName.trim(),
      description: description.trim() || undefined,
      photoBase64: photoBase64 ?? undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      aria-label="Vibe check form"
    >
      {/* Hero intro — only shown when no venue is pre-filled */}
      {!initialVenueName && (
        <div className="text-center py-4 space-y-2">
          <div className="text-4xl mb-3" aria-hidden="true">🎛️</div>
          <h2 className="text-white font-bold text-xl">What's the vibe?</h2>
          <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed">
            Enter a venue name and our AI will score the energy, crowd, and atmosphere.
          </p>
        </div>
      )}

      {/* Form card */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 space-y-5">
      {/* Venue name — required */}
      <div className="space-y-1.5">
        <Label htmlFor="venueName" className="text-white/70">
          Venue name <span className="text-rose-400" aria-hidden="true">*</span>
        </Label>
        <Input
          id="venueName"
          type="text"
          required
          value={venueName}
          onChange={(e) => updateVenueName(e.currentTarget.value)}
          onInput={(e) => updateVenueName(e.currentTarget.value)}
          placeholder="e.g. The Midnight Lounge"
          disabled={isLoading}
          className="bg-white/[0.07] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400/40 focus-visible:border-cyan-400/60"
        />
      </div>

      {/* Description — optional */}
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-white/70">
          Description{" "}
          <span className="text-white/30 font-normal text-xs">(optional)</span>
        </Label>
        <Textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the vibe, what you saw, or anything notable…"
          disabled={isLoading}
          className="bg-white/[0.07] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-cyan-400/40 focus-visible:border-cyan-400/60 resize-none"
        />
      </div>

      {/* Photo upload — optional */}
      <div className="space-y-1.5">
        <label
          htmlFor="photoUpload"
          className="block text-sm font-medium text-white/70"
        >
          Photo{" "}
          <span className="text-white/30 font-normal text-xs">(optional)</span>
        </label>

        {previewUrl ? (
          <div className="relative w-full rounded-xl overflow-hidden border border-white/10">
            <img
              src={previewUrl}
              alt="Photo preview"
              data-testid="photo-preview"
              className="w-full max-h-48 object-cover"
            />
            <button
              type="button"
              onClick={() => { setPhotoBase64(null); setPreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="absolute top-2 right-2 rounded-full bg-black/60 border border-white/20 text-white/70 hover:text-white px-2 py-0.5 text-xs"
            >
              Remove
            </button>
          </div>
        ) : (
          <label
            htmlFor="photoUpload"
            className="
              flex flex-col items-center justify-center gap-1.5
              w-full rounded-xl border border-dashed border-white/20
              bg-white/[0.03] hover:bg-white/[0.06]
              px-4 py-5 cursor-pointer transition-colors duration-150
              text-white/40 hover:text-white/60 text-sm
            "
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Upload a photo</span>
            <input
              ref={fileInputRef}
              id="photoUpload"
              type="file"
              accept="image/*"
              disabled={isLoading}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isLoading || !venueName.trim()}
        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold py-3"
        style={{ boxShadow: "0 0 20px rgba(168,85,247,0.25)" }}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Checking vibe…
          </span>
        ) : (
          "Check Vibe"
        )}
      </Button>
      </div>
    </form>
  );
}

export default VibeCheckInput;
