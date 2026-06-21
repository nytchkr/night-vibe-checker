import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "nytchkr — Know the vibe before you go";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0A0A0E",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div style={{ color: "white", fontSize: 96, fontWeight: 900, letterSpacing: "-4px" }}>
          nyt<span style={{ color: "#8B6CFF" }}>chkr</span>
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 32,
            fontWeight: 600,
            marginTop: 24,
          }}
        >
          Know the vibe before you go.
        </div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 20, marginTop: 12 }}>
          South End Charlotte · Real-time crowd vibes
        </div>
      </div>
    ),
    { ...size }
  );
}
