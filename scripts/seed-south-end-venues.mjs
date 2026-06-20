import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with .env.local loaded."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const zone = {
  id: "south-end-charlotte",
  name: "South End",
  center_lat: 35.2178,
  center_lng: -80.8597,
  radius_m: 1500,
};

const photoIds = [
  "photo-1514362545857-3bc16c4c7d1b",
  "photo-1559526324-593bc073d938",
  "photo-1470337458703-46ad1756a187",
  "photo-1536935338788-846bb9981813",
  "photo-1566417713940-fe7c737a9ef2",
  "photo-1572116469696-31de0f17cc34",
];

const venueInputs = [
  ["Prohibition", "1220 S Tryon St", 35.2149, -80.8601],
  ["Unknown Brewing Co.", "1327 S Mint St", 35.2131, -80.8589],
  ["Sycamore Brewing", "2161 Hawkins St", 35.2074, -80.8612],
  ["Leroy Fox", "705 S Cedar St", 35.2198, -80.8536],
  ["Good Bottle Co.", "125 Remount Rd", 35.2163, -80.8677],
  ["Sugar Creek Brewing", "215 Southside Dr", 35.2098, -80.8634],
  ["The Station", "1508 S Tryon St", 35.2113, -80.8608],
  ["Caabo", "1440 S Tryon St", 35.2124, -80.8605],
  ["The Peculiar Rabbit", "1212 S Tryon St", 35.2153, -80.8599],
  ["OMB Brewery", "4150 Yancey Rd", 35.1984, -80.8697],
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const venues = venueInputs.map(([name, address, lat, lng], index) => ({
  place_id: `fallback:south-end-charlotte:${slugify(name)}`,
  name,
  category: "bar",
  venue_type: "bar",
  address,
  lat,
  lng,
  zone_id: zone.id,
  photo_url: `https://images.unsplash.com/${photoIds[index % photoIds.length]}?w=800`,
  hidden: false,
}));

const { error: zoneError } = await supabase.from("zones").upsert(zone, {
  onConflict: "id",
});

if (zoneError) {
  console.error("Failed to upsert South End zone:", zoneError);
  process.exit(1);
}

const { data, error } = await supabase
  .from("venues")
  .upsert(venues, { onConflict: "place_id" })
  .select("name, place_id");

if (error) {
  console.error("Failed to upsert South End fallback venues:", error);
  process.exit(1);
}

const { count, error: countError } = await supabase
  .from("venues")
  .select("id", { count: "exact", head: true })
  .eq("zone_id", zone.id);

if (countError) {
  console.error("Seeded venues but could not verify count:", countError);
  process.exit(1);
}

console.log(`Seeded ${data?.length ?? venues.length} fallback venues.`);
console.log(`${count ?? 0} venues now exist for ${zone.id}.`);
