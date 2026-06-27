"use client";

import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

export type ExploreSortOption = "hottest" | "top-rated" | "trending" | "nearby";
export type ExploreFilterOption =
  | "open-now"
  | "saved"
  | "bars"
  | "restaurants"
  | "clubs"
  | "coffee"
  | "South End"
  | "Uptown"
  | "NoDa"
  | "Dilworth"
  | "South Park";

const SORT_OPTIONS: { value: ExploreSortOption; label: string }[] = [
  { value: "hottest", label: "Hottest" },
  { value: "top-rated", label: "Top Rated" },
  { value: "trending", label: "Trending" },
  { value: "nearby", label: "Near Me" },
];

const FILTER_OPTIONS: { value: ExploreFilterOption; label: string; comingSoon?: boolean }[] = [
  { value: "open-now", label: "Open Now" },
  { value: "bars", label: "Bars" },
  { value: "restaurants", label: "Restaurants" },
  { value: "clubs", label: "Clubs" },
  { value: "coffee", label: "Coffee" },
];

type ExploreSortFilterProps = {
  selectedSort: ExploreSortOption;
  selectedFilters: Set<ExploreFilterOption>;
  nearbyLoading?: boolean;
  savedCount?: number;
  onSortChange: (sort: ExploreSortOption) => void;
  onFilterToggle: (filter: ExploreFilterOption) => void;
};

function Chip({
  active,
  disabled = false,
  label,
  onClick,
  pressed,
  count,
  comingSoon = false,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  pressed: boolean;
  count?: number;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={comingSoon ? undefined : onClick}
      disabled={disabled || comingSoon}
      aria-pressed={comingSoon ? undefined : pressed}
      title={comingSoon ? "Coming soon to nytchkr" : undefined}
      className={cn(
        "inline-flex min-h-[38px] shrink-0 items-center rounded-full border px-4 text-sm font-semibold backdrop-blur-sm transition-all duration-200 ease-out active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70",
        active
          ? "border-[#8B6CFF] bg-violet-600 text-white shadow-[0_0_18px_rgba(139,108,255,0.3)]"
          : "border-white/[0.06] bg-white/10 text-[#D8DCE5] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.14] hover:text-white hover:shadow-lg hover:shadow-violet/10",
        (disabled || comingSoon) && "cursor-not-allowed opacity-35 hover:translate-y-0 hover:border-white/[0.06] hover:bg-white/10 hover:text-[#D8DCE5] hover:shadow-none active:scale-100",
      )}
    >
      <span>{label}</span>
      {comingSoon && (
        <span className="ml-1.5 text-[10px] font-semibold text-white/40">soon</span>
      )}
      {typeof count === "number" && !comingSoon ? (
        <span
          className={cn(
            "ml-2 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none",
            active ? "bg-[#0A0A0E]/25 text-white" : "bg-white/10 text-white/65",
          )}
          aria-label={`${count} saved venues`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function ExploreSortFilter({
  selectedSort,
  selectedFilters,
  nearbyLoading = false,
  savedCount = 0,
  onSortChange,
  onFilterToggle,
}: ExploreSortFilterProps) {
  const haptic = useHaptic();

  return (
    <div className="space-y-2" role="group" aria-label="Explore sort and filters">
      <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={selectedSort === option.value}
            pressed={selectedSort === option.value}
            disabled={option.value === "nearby" && nearbyLoading}
            onClick={() => {
              haptic.light();
              onSortChange(option.value);
            }}
          />
        ))}
      </div>
      <div className="scroll-touch flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [will-change:scroll-position] [&::-webkit-scrollbar]:hidden">
        {FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={selectedFilters.has(option.value)}
            pressed={selectedFilters.has(option.value)}
            comingSoon={option.comingSoon}
            count={option.value === "saved" ? savedCount : undefined}
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
