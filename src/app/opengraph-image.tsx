import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ThunderLang — Program what you mean.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "radial-gradient(1000px circle at 50% -10%, rgba(124,92,240,0.35), #05070E 60%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="og" x1="30" y1="6" x2="70" y2="94" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#EDE9FE" />
                <stop offset="45%" stopColor="#B49BFF" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <path
              d="M56 6 L26 54 L46 54 L40 94 L74 40 L52 40 L56 6 Z"
              fill="url(#og)"
            />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, display: "flex" }}>
            <span>Thunder</span>
            <span style={{ color: "#B49BFF" }}>Lang</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          Program what you mean.
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#9AA6BD",
            maxWidth: 860,
          }}
        >
          An intent-oriented programming language for the age of AI. Define it.
          Build it. Prove it.
        </div>
      </div>
    ),
    { ...size },
  );
}
