import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Intent: Intent-Oriented Programming for the AI era, by SkillsTech";
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
            "radial-gradient(1000px circle at 50% -10%, #1a1405, #05070E 60%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 100 100">
            <path
              d="M50 3 C54 30 70 46 97 50 C70 54 54 70 50 97 C46 70 30 54 3 50 C30 46 46 30 50 3 Z"
              fill="none"
              stroke="#F5C97A"
              strokeWidth="5"
            />
            <path
              d="M50 32 C51.5 44 56 48.5 68 50 C56 51.5 51.5 56 50 68 C48.5 56 44 51.5 32 50 C44 48.5 48.5 44 50 32 Z"
              fill="#FCEFD6"
            />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, display: "flex" }}>
            <span>Intent</span>
            <span style={{ color: "#F5C97A" }}>Lang</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          Intent-Oriented Programming for the AI era.
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#9AA6BD",
            maxWidth: 860,
          }}
        >
          Describe, verify, and own software. A language by SkillsTech.
        </div>
      </div>
    ),
    { ...size },
  );
}
