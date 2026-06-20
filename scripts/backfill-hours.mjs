import { createClient } from "@supabase/supabase-js";

const placesKey = process.env.GOOGLE_PLACES_API_KEY;
if (!placesKey) {
  throw new Error("GOOGLE_PLACES_API_KEY is required");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function columnExists(column) {
  const { error } = await sb.from("venues").select(column).limit(1);
  return !error;
}

const hasPhoneColumn = await columnExists("phone");
const hasWebsiteColumn = await columnExists("website");
console.log(
  `Schema: opening_hours=yes phone=${hasPhoneColumn ? "yes" : "no"} website=${hasWebsiteColumn ? "yes" : "no"}`,
);

const { data: venues, error } = await sb
  .from("venues")
  .select("id,name,place_id")
  .not("place_id", "is", null);

if (error) {
  throw error;
}

for (const v of venues ?? []) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", v.place_id);
  url.searchParams.set("fields", "opening_hours,formatted_phone_number,website");
  url.searchParams.set("key", placesKey);

  const r = await fetch(url).then((x) => x.json());
  const p = r.result ?? {};
  const update = {};
  if (p.opening_hours?.weekday_text) update.opening_hours = p.opening_hours.weekday_text;
  if (hasPhoneColumn && p.formatted_phone_number) update.phone = p.formatted_phone_number;
  if (hasWebsiteColumn && p.website) update.website = p.website;
  if (Object.keys(update).length) {
    const { error: updateError } = await sb.from("venues").update(update).eq("id", v.id);
    if (updateError) {
      console.error("Failed", v.name, updateError.message);
    } else {
      console.log("Updated", v.name, Object.keys(update).join(","));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

console.log("Done");
