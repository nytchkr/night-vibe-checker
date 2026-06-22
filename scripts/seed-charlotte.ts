import { supabaseAdmin } from "../src/lib/supabase";

const ZONE = {
  id: "south-end-charlotte",
  name: "South End",
  center_lat: 35.2178,
  center_lng: -80.8597,
  radius_m: 1500,
};

type VenueSeed = {
  place_id: string;
  name: string;
  address: string;
  category: "bar" | "night_club";
  venue_type: "bar" | "night_club";
  lat: number;
  lng: number;
  zone_id: typeof ZONE.id;
  hidden: false;
};

const venues: VenueSeed[] = [
  {
    place_id: "ChIJO2hv8HmfVogREDnf2p86cws",
    name: "Tyber Creek Pub",
    address: "1501 South Mint Street, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2188643,
    lng: -80.860611,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJUQKn7VmfVogR-oVUnoPsI5Q",
    name: "Trio Charlotte",
    address: "1513 South Mint Street, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.2188037,
    lng: -80.861015,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJTZn3N8glVIgRz28l61Af_j8",
    name: "YUME Ramen Sushi & Bar",
    address: "1508 South Mint Street A, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.219269,
    lng: -80.8608875,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJU8QmLn6fVogRee93hyd3aCg",
    name: "Seoul Food Meat Company",
    address: "1400 South Church Street a, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.219257,
    lng: -80.857579,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJtyBXe3efVogRjH95ytf3b80",
    name: "Yugenn",
    address: "255 West Bland Street Suite 200, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.218614,
    lng: -80.8570656,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJp9PvEX-fVogRJbf7mk0dIRs",
    name: "Wooden Robot Brewery",
    address: "1440 South Tryon Street Unit 110, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2168207,
    lng: -80.8568091,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJ855duH-fVogRsTAtvqioEso",
    name: "Hoppin' Charlotte",
    address: "1402 Winnifred Street, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2183651,
    lng: -80.8563089,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJ6_f_fZefVogRVrJPzCI8lSs",
    name: "VINYL",
    address: "1440 S Tryon St #105, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2165227,
    lng: -80.856597,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJjzF2lwAeVIgR6wkwwZW5pd4",
    name: "Craft Tasting Room and Growler Shop",
    address: "1320 South Church Street, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2199492,
    lng: -80.8569945,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJI4BmESSfVogRA1stM38Y-rI",
    name: "OROSOKO Sound Bar",
    address: "130 West Bland Street, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.2183582,
    lng: -80.8558505,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJM8UQkUSfVogRu1VwerWNmtM",
    name: "STIR",
    address: "1422 S Tryon St Ste 130, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2171021,
    lng: -80.8556137,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJw9-m9IqfVogRMAaQ_O5BoJY",
    name: "Condado Tacos",
    address: "1536 Camden Rd #107, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2150219,
    lng: -80.8569739,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJi8-gn3-fVogR5iPxG3TIT-c",
    name: "North Italia",
    address: "1414 S Tryon St Ste 140, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2173585,
    lng: -80.8551905,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJy1-Tdn-fVogRDHCazp372eo",
    name: "Amos' Southend",
    address: "1423 South Tryon Street, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2167636,
    lng: -80.8552081,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJa_-DeH-fVogRFnyPDMkqlmU",
    name: "Tavern on the Tracks",
    address: "1411 South Tryon Street Suite B, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2169842,
    lng: -80.8548803,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJAe4uZX-fVogR1bwjqBotQSc",
    name: "All American Pub",
    address: "200 East Bland Street, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.216576,
    lng: -80.854651,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJfXBJOoqfVogRPeS2p_PjFVo",
    name: "Charlotte Beer Garden",
    address: "1300 S Tryon St, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2183338,
    lng: -80.8542426,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJ_Zz6qCqgVogRzIzG88m_AaM",
    name: "Sixty Vines Charlotte",
    address: "1415 Vantage Pk Dr Suite 100, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2202034,
    lng: -80.8534342,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJy0JlKvufVogREqNq-8c3HXQ",
    name: "Culinary Dropout",
    address: "1120 S Tryon St #100, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2194306,
    lng: -80.8530238,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJJXu-sTufVogRy6N81cUhkSk",
    name: "Kanna Collective Lounge & Coffee Bar",
    address: "207 West Worthington Avenue, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.212123,
    lng: -80.861374,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJW4XOdgChVogRkNZ-mAU8vcE",
    name: "Dream CLT",
    address: "320 West Carson Boulevard, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.222143,
    lng: -80.8541213,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJkYddMsufVogRd_qbf0uICG4",
    name: "Barcelona Wine Bar",
    address: "101 W Worthington Ave Ste 110, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2114756,
    lng: -80.860049,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJf_xqE56fVogRot-GL2inPnA",
    name: "Elsewhere Cocktail Bar",
    address: "101 West Worthington Avenue Suite 140, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.2114718,
    lng: -80.8604231,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJL22k3gqfVogRfz08yaIxdQ8",
    name: "The Vintage Whiskey & Cigar Bar of Charlotte",
    address: "215 East Worthington Avenue, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.210586,
    lng: -80.8579981,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJTdBP9nmfVogRC62UuanKepc",
    name: "Sullivan's Steakhouse",
    address: "1928 South Boulevard #200, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2101681,
    lng: -80.8599298,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJf-Y5wVifVogR4fe-QyaJXLc",
    name: "PARA Charlotte",
    address: "235 West Tremont Avenue Suite 100, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.2106377,
    lng: -80.8633178,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJw4FlFSWfVogRFE-oR_9KeqU",
    name: "Pins Mechanical Co",
    address: "307 W Tremont Ave, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2107029,
    lng: -80.8641011,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJy29EH3-fVogRxofi_1TM0ao",
    name: "Common Market SouthEnd",
    address: "235 West Tremont Avenue, Charlotte",
    category: "bar",
    venue_type: "bar",
    lat: 35.2103963,
    lng: -80.8636397,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJaaSMp3CfVogRpYMMsxTAWhQ",
    name: "O-Ku",
    address: "2000 South Boulevard, Charlotte",
    category: "night_club",
    venue_type: "night_club",
    lat: 35.20955,
    lng: -80.8604813,
    zone_id: ZONE.id,
    hidden: false,
  },
  {
    place_id: "ChIJ5ZXfT7GfVogRFWHF-hMmdus",
    name: "Legion at the Trolley Barn",
    address: "2104 South Blvd, Charlotte, NC 28203, USA",
    category: "bar",
    venue_type: "bar",
    lat: 35.2086596,
    lng: -80.8615808,
    zone_id: ZONE.id,
    hidden: false,
  },
];

async function main(): Promise<void> {
  const { error: zoneError } = await supabaseAdmin.from("zones").upsert(ZONE, {
    onConflict: "id",
  });

  if (zoneError) {
    throw new Error(`Failed to upsert Charlotte launch zone: ${zoneError.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .upsert(venues, { onConflict: "place_id" })
    .select("name, place_id");

  if (error) {
    throw new Error(`Failed to upsert Charlotte venue seeds: ${error.message}`);
  }

  const { count, error: countError } = await supabaseAdmin
    .from("venues")
    .select("id", { count: "exact", head: true })
    .eq("zone_id", ZONE.id)
    .eq("hidden", false);

  if (countError) {
    throw new Error(`Seeded venues but failed to verify count: ${countError.message}`);
  }

  console.log(`Upserted ${data?.length ?? venues.length} Charlotte South End venues.`);
  console.log(`${count ?? 0} visible venues now exist for ${ZONE.id}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
