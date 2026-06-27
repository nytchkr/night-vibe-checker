"use client";

import Image from "next/image";
import { useState } from "react";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";

type VenuePhotoProps = {
  name: string;
  photoUrl?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
};

const PHOTO_COLORS = ["#8B6CFF", "#F0568C", "#00F5D4"] as const;
const PHOTO_BG = "#0A0A0E";

function hashName(name: string): number {
  return Array.from(name.trim()).reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return initials || "NV";
}

function gradientFor(name: string): string {
  const hash = hashName(name);
  const primary = PHOTO_COLORS[hash % PHOTO_COLORS.length];
  const secondary = PHOTO_COLORS[(hash + 1) % PHOTO_COLORS.length];
  return `radial-gradient(circle at 28% 22%, ${primary}52 0, transparent 34%), radial-gradient(circle at 78% 68%, ${secondary}42 0, transparent 38%), linear-gradient(135deg, ${PHOTO_BG} 0%, ${primary}2E 52%, ${PHOTO_BG} 100%)`;
}

export function VenuePhoto({
  name,
  photoUrl,
  alt,
  className = "",
  imageClassName = "",
  sizes = "100vw",
  priority = false,
  loading,
}: VenuePhotoProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;
  const accent = PHOTO_COLORS[hashName(name) % PHOTO_COLORS.length];

  return (
    <div
      className={`relative overflow-hidden bg-[#0A0A0E] ${className}`}
      style={!showPhoto ? { background: gradientFor(name) } : undefined}
    >
      {showPhoto ? (
        <Image
          src={photoUrl as string}
          alt={alt ?? name}
          fill
          sizes={sizes}
          loading={priority ? undefined : loading ?? "lazy"}
          priority={priority}
          placeholder="blur"
          blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${imageClassName}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
          <span
            className="font-display text-[clamp(1.5rem,14cqw,4rem)] font-black tracking-tight"
            style={{ color: accent, textShadow: `0 0 28px ${accent}55` }}
          >
            {initialsFor(name)}
          </span>
        </div>
      )}
    </div>
  );
}

export default VenuePhoto;
