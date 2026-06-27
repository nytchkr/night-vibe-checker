// ============================================================
// VibeTagBadge
//
// Pill badge for a single vibe tag.
// Dark background with a neon-colored border glow.
//
// variant="primary"   → high-saturation neon border
// variant="secondary" → subdued muted border
// ============================================================

interface VibeTagBadgeProps {
  tag: string;
  variant?: "primary" | "secondary";
  /** Optional click handler — makes the badge interactive */
  onClick?: () => void;
  className?: string;
}

// Deterministically pick a neon color from the tag string
// so the same tag always renders the same color.
const NEON_COLORS = [
  "#ff2d78", // hot pink
  "#a855f7", // purple
  "#8B6CFF", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#6366f1", // indigo
  "#f472b6", // light pink
  "#fb923c", // orange
];

function tagToColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return NEON_COLORS[hash % NEON_COLORS.length];
}

export function VibeTagBadge({
  tag,
  variant = "primary",
  onClick,
  className = "",
}: VibeTagBadgeProps) {
  const color = tagToColor(tag);

  const borderColor = variant === "primary" ? color : "rgba(255,255,255,0.2)";
  const textColor = variant === "primary" ? color : "rgba(255,255,255,0.6)";
  const boxShadow =
    variant === "primary"
      ? `0 0 8px ${color}55, inset 0 0 8px ${color}18`
      : "none";

  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      onClick={onClick}
      className={`
        inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
        tracking-wide select-none transition-all duration-200
        ${onClick ? "cursor-pointer hover:opacity-80 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6CFF]/70" : "cursor-default"}
        ${className}
      `}
      style={{
        backgroundColor: "rgba(10, 10, 20, 0.85)",
        border: `1px solid ${borderColor}`,
        color: textColor,
        boxShadow,
        backdropFilter: "blur(4px)",
      }}
      // Accessibility
      {...(onClick ? { type: "button" as const, "aria-label": `Filter by ${tag}` } : {})}
    >
      {tag}
    </Tag>
  );
}

export default VibeTagBadge;
