import type { MetadataRoute } from "next";

import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL = "https://nytchkr.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  let data: { place_id: string | null }[] | null = null;

  try {
    const result = await supabaseAdmin
      .from("venues")
      .select("place_id")
      .eq("hidden", false)
      .not("place_id", "is", null);
    data = result.data as { place_id: string | null }[] | null;
  } catch {
    data = null;
  }

  const venues = (data ?? []).flatMap((venue) => {
    if (!venue.place_id) return [];

    return [
      {
        url: `${BASE_URL}/venue/${encodeURIComponent(venue.place_id)}`,
        lastModified: now,
        changeFrequency: "hourly" as const,
        priority: 0.8,
      },
    ];
  });

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/map`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/profile`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
  ];

  return [...staticRoutes, ...venues];
}
