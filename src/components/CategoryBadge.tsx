"use client";

type CategoryBadgeProps = {
  category: string | null | undefined;
  className?: string;
};

type PriceLevelDisplayProps = {
  priceLevel: 1 | 2 | 3 | 4 | number | null | undefined;
  className?: string;
};

const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  bar: { icon: "🍺", label: "Bar" },
  night_club: { icon: "🎵", label: "Club" },
  restaurant: { icon: "🍽️", label: "Restaurant" },
  lounge: { icon: "🛋️", label: "Lounge" },
};

const PRICE_CLASS_BY_LEVEL: Record<1 | 2 | 3 | 4, string> = {
  1: "text-[#9CA2AE]",
  2: "text-[#9CA2AE]",
  3: "text-[#9CA2AE]",
  4: "text-[#9CA2AE]",
};

function getCategoryMeta(category: string | null | undefined) {
  const key = (category ?? "").trim().toLowerCase();
  if (key.includes("club") || key.includes("night club") || key.includes("night_club") || key.includes("nightclub")) {
    return CATEGORY_META.night_club;
  }
  if (key.includes("restaurant") || key.includes("food")) return CATEGORY_META.restaurant;
  if (key.includes("lounge")) return CATEGORY_META.lounge;
  if (key.includes("bar")) return CATEGORY_META.bar;
  return CATEGORY_META[key] ?? { icon: "📍", label: "Venue" };
}

function normalizePriceLevel(priceLevel: PriceLevelDisplayProps["priceLevel"]): 1 | 2 | 3 | 4 | null {
  if (priceLevel === 1 || priceLevel === 2 || priceLevel === 3 || priceLevel === 4) return priceLevel;
  return null;
}

export function CategoryBadge({ category, className = "" }: CategoryBadgeProps) {
  const { icon, label } = getCategoryMeta(category);

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60 ${className}`}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export function PriceLevelDisplay({ priceLevel, className = "" }: PriceLevelDisplayProps) {
  const level = normalizePriceLevel(priceLevel);
  if (level === null) return null;

  return (
    <span className={`text-xs font-semibold ${PRICE_CLASS_BY_LEVEL[level]} ${className}`} aria-label={`Price level ${level} of 4`}>
      {"$".repeat(level)}
    </span>
  );
}
