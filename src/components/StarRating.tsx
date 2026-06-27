type StarRatingProps = {
  rating: number;
  count: number;
  className?: string;
};

function formatReviewCount(count: number): string {
  const rounded = Math.round(count);
  return rounded.toLocaleString();
}

function getStarParts(rating: number): Array<"full" | "half" | "empty"> {
  const clamped = Math.min(5, Math.max(0, rating));
  const fullStars = Math.floor(clamped);
  const hasHalfStar = clamped - fullStars >= 0.25 && fullStars < 5;
  const parts: Array<"full" | "half" | "empty"> = [];

  for (let index = 0; index < 5; index += 1) {
    if (index < fullStars) parts.push("full");
    else if (index === fullStars && hasHalfStar) parts.push("half");
    else parts.push("empty");
  }

  return parts;
}

function StarIcon({ part }: { part: "full" | "half" | "empty" }) {
  return (
    <span className="relative inline-block h-[1em] w-[1em]" aria-hidden="true">
      <span className="absolute inset-0 text-white/20">★</span>
      {part !== "empty" && (
        <span
          className="absolute inset-0 overflow-hidden text-[#8B6CFF]"
          style={{ width: part === "half" ? "50%" : "100%" }}
        >
          ★
        </span>
      )}
    </span>
  );
}

export function StarRating({ rating, count, className = "" }: StarRatingProps) {
  if (!Number.isFinite(rating) || !Number.isFinite(count) || rating <= 0 || count <= 0) return null;

  const ratingLabel = Math.min(5, Math.max(0, rating)).toFixed(1);
  const reviewLabel = formatReviewCount(count);
  const stars = getStarParts(rating);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 font-semibold leading-none ${className}`}
      aria-label={`Google rating ${ratingLabel} from ${reviewLabel} reviews`}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-[1em]">
        {stars.map((star, index) => (
          <StarIcon key={`${star}-${index}`} part={star} />
        ))}
      </span>
      <span className="shrink-0 text-white/75">{ratingLabel}</span>
      <span className="min-w-0 truncate text-white/45">({reviewLabel})</span>
    </span>
  );
}
