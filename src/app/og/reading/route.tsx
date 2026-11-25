import { ImageResponse } from "next/og";

// The preview image for a shared reading or a gallery entry. It draws only the names passed in the URL (repository,
// file, function, level): no code is fetched or rendered here, for privacy and cost.
export const runtime = "edge";

const LEVELS: Record<string, string> = { "big-picture": "Big Picture", flow: "Flow", details: "Details", text: "Text", original: "Original" };
const clip = (s: string | null, n: number) => { const t = (s ?? "").replace(/[\u0000-\u001f]/g, "").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const repo = clip(q.get("repo"), 60);
  const path = clip(q.get("path"), 80);
  const fn = clip(q.get("fn"), 48);
  const level = LEVELS[q.get("level") ?? ""] ?? "Big Picture";
  const title = fn || path.split("/").pop() || "A reading";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px", background: "radial-gradient(1000px circle at 50% -10%, rgba(124,92,240,0.35), #05070E 60%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="56" height="56" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="og" x1="30" y1="6" x2="70" y2="94" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#EDE9FE" /><stop offset="45%" stopColor="#B49BFF" /><stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <path d="M56 6 L26 54 L46 54 L40 94 L74 40 L52 40 L56 6 Z" fill="url(#og)" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, display: "flex", gap: 10 }}><span>Read in</span><span style={{ color: "#B49BFF" }}>Thunder</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, maxWidth: 1050, display: "flex" }}>{title}</div>
          {path && <div style={{ marginTop: 24, fontSize: 30, color: "#C7CEDB", display: "flex" }}>{path}</div>}
          {repo && <div style={{ marginTop: 10, fontSize: 30, color: "#9AA6BD", display: "flex" }}>{repo}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28 }}>
          <div style={{ display: "flex", border: "2px solid rgba(252,211,77,0.6)", color: "#FCD34D", borderRadius: 999, padding: "6px 22px" }}>{level}</div>
          <div style={{ display: "flex", color: "#9AA6BD" }}>What the code does, in pictures and plain words · thunderlang.dev</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
