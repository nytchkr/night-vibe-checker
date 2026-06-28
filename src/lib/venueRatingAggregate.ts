import "server-only";

import { sql } from "@/lib/db";
import { redis } from "@/lib/upstashRedis";

export type VenueRatingAggregate = {
  avg: number;
  count: number;
};

const CACHE_TTL_SECONDS = 300;
const MIN_VISIBLE_RATING_COUNT = 3;

function cacheKey(venueId: string): string {
  return `nv:rating:${venueId}`;
}

function normalizeAggregate(value: unknown): VenueRatingAggregate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { avg?: unknown; count?: unknown };
  const avg = Number(candidate.avg);
  const count = Number(candidate.count);
  if (!Number.isFinite(avg) || !Number.isInteger(count) || count < 0) return null;
  return { avg, count };
}

function visibleAggregate(aggregate: VenueRatingAggregate): VenueRatingAggregate | null {
  return aggregate.count >= MIN_VISIBLE_RATING_COUNT ? aggregate : null;
}

function summarizeRatings(rows: Array<{ rating: unknown }>): VenueRatingAggregate {
  const ratings = rows
    .map((row) => Number(row.rating))
    .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);

  const count = ratings.length;
  if (count === 0) return { avg: 0, count: 0 };

  const avg = ratings.reduce((sum, rating) => sum + rating, 0) / count;
  return { avg: Math.round(avg * 100) / 100, count };
}

export async function getVenueRatingAggregate(venueId: string): Promise<VenueRatingAggregate | null> {
  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) return null;

  const key = cacheKey(normalizedVenueId);

  if (redis) {
    try {
      const cached = normalizeAggregate(await redis.get(key));
      if (cached) return visibleAggregate(cached);
    } catch (error) {
      console.warn("[venue rating aggregate] Redis get failed; falling back to Neon:", error);
    }
  }

  const rows = await sql`
    SELECT rating
    FROM venue_ratings
    WHERE venue_id = ${normalizedVenueId}
  `;

  const aggregate = summarizeRatings(rows as Array<{ rating: unknown }>);

  if (redis) {
    try {
      await redis.set(key, aggregate, { ex: CACHE_TTL_SECONDS });
    } catch (error) {
      console.warn("[venue rating aggregate] Redis set failed:", error);
    }
  }

  return visibleAggregate(aggregate);
}
