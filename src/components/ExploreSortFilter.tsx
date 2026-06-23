"use client";

import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

export type ExploreSortOption = "hottest" | "top-rated" | "trending" | "nearby";
export type ExploreFilterOption = "open-now" | "South End" | "Uptown" | "NoDa" | "Dilworth";

const SORT_OPTIONS: { value: ExploreSortOption; label: string }[] = [
  { value: "hottest", label: "Hottest" },
  { value: "top-rated", label: "Top Rated" },
  { value: "trending", label: "Trending" },
  { value: "nearby", label: "Nearby" },
];

const FILTER_OPTIONS: { value: ExploreFilterOption; label: string }[] = [
  { value: "open-now", label: "Open Now" },
  { value: "South End", label: "South End" },
  { value: "Uptown", label: "Uptown" },
  { value: "NoDa", label: "NoDa" },
  { value: "Dilworth", label: "Dilworth" },
];

type ExploreSortFilterProps = {
  selectedSort: ExploreSortOption;
  selectedFilters: Set<ExploreFilterOption>;
  nearbyEnabled: boolean;
  onSortChange: (sort: ExploreSortOption) => void;
  onFilterToggle: (filter: ExploreFilterOption) => void;
};

function Chip({
  active,
  disabled = false,
  label,
  onClick,
  pressed,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "min-h-[38px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70",
        active
          ? "border-[#8B6CFF] bg-violet-600 text-white shadow-[0_0_18px_rgba(139,108,255,0.28)]"
          : "border-white/[0.08] bg-white/10 text-gray-300 hover:border-white/20 hover:bg-white/[0.14] hover:text-white",
        disabled && "cursor-not-allowed opacity-40 hover:border-white/[0.08] hover:bg-white/10 hover:text-gray-300",
      )}
    >
      {label}
    </button>
  );
}

export function ExploreSortFilter({
  selectedSort,
  selectedFilters,
  nearbyEnabled,
  onSortChange,
  onFilterToggle,
}: ExploreSortFilterProps) {
  const haptic = useHaptic();

  return (
    <div className="space-y-2" role="group" aria-label="Explore sort and filters">
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={selectedSort === option.value}
            pressed={selectedSort === option.value}
            disabled={option.value === "nearby" && !nearbyEnabled}
            onClick={() => {
              haptic.light();
              onSortChange(option.value);
            }}
          />
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={selectedFilters.has(option.value)}
            pressed={selectedFilters.has(option.value)}
            onClick={() => {
              haptic.light();
              onFilterToggle(option.value);
            }}
          />
        ))}
      </div>
    </div>
  );
}
