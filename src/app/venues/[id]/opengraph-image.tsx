import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type VenueApiResponse = {
  status?: string;
  data?: {
    venue?: {
      name?: string;
    };
  };
};

const siteUrl = "https://night-vibe-checker.vercel.app";

async function getVenueName(id: string): Promise<string> {
  const fallbackName = "South End Nightlife";
  const venueId = decodeURIComponent(id ?? "").trim();
  if (!venueId) return fallbackName;

  try {
    const response = await fetch(`${siteUrl}/api/venues/${encodeURIComponent(venueId)}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return fallbackName;

    const json = (await response.json()) as VenueApiResponse;
    return json.data?.venue?.name?.trim() || fallbackName;
  } catch {
    return fallbackName;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venueName = await getVenueName(id);

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0A0A0F",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 80,
          width: "100%",
        }}
      >
        <div style={{ color: "#00F5D4", fontSize: 36, fontWeight: 900, marginBottom: 24 }}>
          NightVibe
        </div>
        <div style={{ color: "white", fontSize: 72, fontWeight: 900, textAlign: "center" }}>
          {venueName}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 28, marginTop: 24 }}>
          Know before you go.
        </div>
      </div>
    ),
    size
  );
}
