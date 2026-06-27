"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { div as MotionDiv } from "framer-motion/client";
import { VENUE_PHOTO_BLUR_DATA_URL } from "@/lib/imagePlaceholders";

type VenuePhotoProps = {
  name: string;
  photoUrl?: string | string[] | null;
  photoUrls?: string | string[] | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

const PHOTO_COLORS = ["#8B6CFF", "#F0568C", "#00F5D4"] as const;
const PHOTO_BG = "#0A0A0E";
const MAX_PHOTOS = 5;
const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 500;

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

function addPhotoUrls(urls: string[], value?: string | string[] | null) {
  if (Array.isArray(value)) {
    for (const item of value) addPhotoUrls(urls, item);
    return;
  }

  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length > 0 && !urls.includes(trimmed)) urls.push(trimmed);
}

function normalizePhotoUrls(photoUrl?: string | string[] | null, photoUrls?: string | string[] | null): string[] {
  const urls: string[] = [];
  addPhotoUrls(urls, photoUrl);
  addPhotoUrls(urls, photoUrls);
  return urls.slice(0, MAX_PHOTOS);
}

export function VenuePhoto({
  name,
  photoUrl,
  photoUrls,
  alt,
  className = "",
  imageClassName = "",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
  loading,
  fetchPriority,
}: VenuePhotoProps) {
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const photos = normalizePhotoUrls(photoUrl, photoUrls);
  const visiblePhotos = photos.filter((photo) => !failedPhotos.has(photo));
  const showPhoto = visiblePhotos.length > 0;
  const showCarousel = visiblePhotos.length > 1;
  const accent = PHOTO_COLORS[hashName(name) % PHOTO_COLORS.length];
  const photoKey = photos.join("|");

  useEffect(() => {
    setFailedPhotos(new Set());
    setActiveIndex(0);
  }, [photoKey]);

  useEffect(() => {
    if (activeIndex >= visiblePhotos.length) {
      setActiveIndex(Math.max(0, visiblePhotos.length - 1));
    }
  }, [activeIndex, visiblePhotos.length]);

  function markPhotoFailed(photo: string) {
    setFailedPhotos((current) => new Set(current).add(photo));
  }

  function goToPhoto(index: number) {
    setActiveIndex(Math.min(Math.max(index, 0), visiblePhotos.length - 1));
  }

  return (
    <div
      className={`relative overflow-hidden bg-[#0A0A0E] ${className}`}
      style={!showPhoto ? { background: gradientFor(name) } : undefined}
    >
      {showPhoto && !showCarousel ? (
        <Image
          src={visiblePhotos[0]}
          alt={alt ?? name}
          fill
          sizes={sizes}
          loading={priority ? undefined : loading ?? "lazy"}
          priority={priority}
          fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
          placeholder="blur"
          blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
          onError={() => markPhotoFailed(visiblePhotos[0])}
          className={`h-full w-full object-cover ${imageClassName}`}
          draggable={false}
        />
      ) : showPhoto ? (
        <>
          <MotionDiv
            className="flex h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
            animate={{ x: `-${activeIndex * 100}%` }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              const swipeLeft = info.offset.x < -SWIPE_DISTANCE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY_THRESHOLD;
              const swipeRight = info.offset.x > SWIPE_DISTANCE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY_THRESHOLD;
              if (swipeLeft) goToPhoto(activeIndex + 1);
              if (swipeRight) goToPhoto(activeIndex - 1);
            }}
          >
            {visiblePhotos.map((photo, index) => (
              <div key={photo} className="relative h-full min-w-full">
                <Image
                  src={photo}
                  alt={showCarousel ? `${alt ?? name} ${index + 1}` : alt ?? name}
                  fill
                  sizes={sizes}
                  loading={priority && index === 0 ? undefined : loading ?? "lazy"}
                  priority={priority && index === 0}
                  fetchPriority={index === 0 ? fetchPriority ?? (priority ? "high" : undefined) : undefined}
                  placeholder="blur"
                  blurDataURL={VENUE_PHOTO_BLUR_DATA_URL}
                  onError={() => markPhotoFailed(photo)}
                  className={`h-full w-full object-cover ${imageClassName}`}
                  draggable={false}
                />
              </div>
            ))}
          </MotionDiv>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2" aria-label="Venue photo position">
            {visiblePhotos.map((photo, index) => (
              <button
                key={photo}
                type="button"
                onClick={() => goToPhoto(index)}
                className="h-2.5 w-2.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/80"
                style={{ backgroundColor: index === activeIndex ? "#8B6CFF" : "rgba(255,255,255,0.3)" }}
                aria-label={`Show photo ${index + 1} of ${visiblePhotos.length}`}
                aria-current={index === activeIndex ? "true" : undefined}
              />
            ))}
          </div>
        </>
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
