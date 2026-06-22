type StarRatingProps = {
  rating: number;
  count: number;
};

function formatReviewCount(count: number): string {
  const rounded = Math.round(count);
  return `${rounded.toLocaleString()} review${rounded === 1 ? "" : "s"}`;
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

export function StarRating({ rating, count }: StarRatingProps) {
  if (!Number.isFinite(rating) || !Number.isFinite(count) || rating <= 0 || count <= 0) return null;

  const ratingLabel = Math.min(5, Math.max(0, rating)).toFixed(1);
  const reviewLabel = formatReviewCount(count);
  const stars = getStarParts(rating);

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1 font-semibold leading-none"
      aria-label={`Google rating ${ratingLabel} from ${reviewLabel}`}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {stars.map((star, index) => (
          <span
            key={`${star}-${index}`}
            style={{ color: star === "empty" ? "#555" : "#FFD700" }}
          >
            {star === "full" ? "★" : star === "half" ? "½" : "☆"}
          </span>
        ))}
      </span>
      <span className="shrink-0 text-white/70">Google {ratingLabel}</span>
      <span className="min-w-0 truncate text-white/45">({reviewLabel})</span>
    </span>
  );
}
