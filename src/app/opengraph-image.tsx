import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ThunderLang™: The Human Programming Language. One language. Every ecosystem.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The share card: the same lockup as the site (bolt + ThunderLang) with the tagline and its second line.
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#05070E", padding: 24 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            border: "2px solid #1C2233",
            borderRadius: 24,
            padding: "0 80px",
            gap: 64,
            color: "white",
            fontFamily: "sans-serif",
          }}
        >
          <svg width="150" height="250" viewBox="26 6 50 90">
            <defs>
              <linearGradient id="og" x1="30" y1="6" x2="70" y2="94" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#EDE9FE" />
                <stop offset="45%" stopColor="#B49BFF" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <path d="M56 6 L26 54 L46 54 L40 94 L74 40 L52 40 L56 6 Z" fill="url(#og)" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 104,
                fontWeight: 700,
                letterSpacing: -3,
                backgroundImage: "linear-gradient(90deg, #E9DDFF, #B49BFF 55%, #22D3EE)",
                backgroundClip: "text",
                color: "transparent",
                display: "flex",
              }}
            >
              ThunderLang
            </div>
            <div style={{ marginTop: 8, fontSize: 46, fontWeight: 600, color: "#DCE1EC", display: "flex" }}>
              The Human Programming Language.
            </div>
            <div style={{ marginTop: 18, fontSize: 32, color: "#9AA3B5", display: "flex" }}>One language. Every ecosystem.</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
