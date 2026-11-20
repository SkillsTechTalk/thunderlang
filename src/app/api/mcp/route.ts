import { NextResponse } from "next/server";
// The hosted ThunderLang MCP endpoint (Streamable HTTP, stateless JSON responses), so ChatGPT and
// other remote MCP clients can use the compiler. It serves only tools that are pure functions of
// their arguments: nothing here reads the server's files, git, or environment.
import { createMcpHandler, REMOTE_SAFE_TOOLS } from "../../../../compiler/src/mcp.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const handle = createMcpHandler({ tools: REMOTE_SAFE_TOOLS });

// Per-client rate limit: 60 requests a minute per IP, refilled continuously. It lives in this
// server instance's memory, so it is a first line of defense against one noisy client, not a
// global quota (a platform firewall rule is the place for that).
const RATE_PER_MINUTE = 60;
const buckets = new Map<string, { tokens: number; at: number }>();
function allow(ip: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  const b = buckets.get(ip) ?? { tokens: RATE_PER_MINUTE, at: now };
  b.tokens = Math.min(RATE_PER_MINUTE, b.tokens + ((now - b.at) / 60_000) * RATE_PER_MINUTE);
  b.at = now;
  if (buckets.size > 10_000) buckets.clear(); // bounded memory under a flood of distinct addresses
  if (b.tokens < 1) { buckets.set(ip, b); return { ok: false, retryAfter: Math.ceil(((1 - b.tokens) / RATE_PER_MINUTE) * 60) }; }
  b.tokens -= 1;
  buckets.set(ip, b);
  return { ok: true, retryAfter: 0 };
}
const clientIp = (request: Request) =>
  request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

export async function POST(request: Request) {
  const limit = allow(clientIp(request));
  if (!limit.ok) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: `Too many requests. Try again in ${limit.retryAfter} seconds.` } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request is larger than 256 KB. Send one file or module at a time." } }, { status: 413 });
  }
  let body: Rpc | Rpc[];
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "The request body is not valid JSON." } }, { status: 400 });
  }
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length > 20) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send at most 20 messages per request." } }, { status: 400 });
  }
  const replies = messages.map((m) => handle(m)).filter(Boolean);
  // Notifications alone get 202 Accepted with no body, per the Streamable HTTP transport.
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

// This endpoint does not open server-sent event streams; clients fall back to plain POST.
export function GET() {
  return new NextResponse("Use POST with JSON-RPC. This MCP endpoint does not stream.", { status: 405, headers: { Allow: "POST" } });
}
