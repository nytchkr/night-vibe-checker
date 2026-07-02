import type { MetadataRoute } from "next";

import { SITE_URL, getVenuePublicPath } from "@/lib/seo";
import { sql } from "@/lib/db";

type SitemapVenueRow = {
  id: string;
  slug: string | null;
  updated_at: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  let data: SitemapVenueRow[] | null = null;

  try {
    data = (await sql`
      SELECT id, slug, updated_at
      FROM venues
      WHERE COALESCE(hidden, false) = false
      ORDER BY name ASC
    `) as SitemapVenueRow[];
  } catch {
    data = null;
  }

  const venues = (data ?? []).flatMap((venue) => {
    if (!venue.id) return [];

    return [
      {
        url: `${SITE_URL}${getVenuePublicPath({ id: venue.id, slug: venue.slug ?? undefined })}`,
        lastModified: venue.updated_at ? new Date(venue.updated_at) : now,
        changeFrequency: "hourly" as const,
        priority: 0.8,
      },
    ];
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/map`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/profile`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
  ];

  return [...staticRoutes, ...venues];
}
