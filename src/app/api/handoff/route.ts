import { NextResponse } from "next/server";
import { buildDriftHandoff } from "../../../../compiler/src/drift.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let intentText = "";
  try {
    const body = await request.json();
    intentText = typeof body?.intentText === "string" ? body.intentText : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!intentText.trim()) {
    return NextResponse.json({ error: "Nothing to hand off." }, { status: 422 });
  }
  try {
    const pack = buildDriftHandoff(intentText, { generatedAt: null });
    return NextResponse.json({ ok: true, pack });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Handoff failed: ${message}` }, { status: 500 });
  }
}
