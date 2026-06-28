import { ImageResponse } from "next/og";
import { getBusynessState } from "@/lib/busyness";
import { getConsumerVenueById } from "@/lib/consumerVenue";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function getBusynessText(busynessScore: number | null | undefined): string {
  if (busynessScore == null || !Number.isFinite(busynessScore)) return "Check the vibe before you go.";
  const score = Math.round(busynessScore);
  return `${getBusynessState(busynessScore).label} right now · ${score}% busy`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await getConsumerVenueById(id);
  const venueName = venue?.name ?? "nytchkr";
  const busynessScore = venue?.signal?.busyness0To100 ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0A0A0E",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: 80,
          width: "100%",
        }}
      >
        <div style={{ color: "#8B6CFF", fontSize: 36, fontWeight: 900, marginBottom: 24 }}>
          nytchkr
        </div>
        <div style={{ color: "white", fontSize: 72, fontWeight: 900, textAlign: "center" }}>
          {venueName}
        </div>
        <div style={{ color: "#F0568C", fontSize: 34, fontWeight: 800, marginTop: 24 }}>
          {getBusynessText(busynessScore)}
        </div>
      </div>
    ),
    size
  );
}
