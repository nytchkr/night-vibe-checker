import type { MetadataRoute } from "next";

import { supabaseAdmin } from "@/lib/supabase";

const BASE_URL = "https://night-vibe-checker.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await supabaseAdmin.from("venues").select("id, slug").eq("hidden", false);
  const now = new Date();

  const venues = (data ?? []).map((venue) => ({
    url: `${BASE_URL}/venues/${venue.id}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE_URL}/share`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/explore`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 },
    ...venues,
  ];
}
