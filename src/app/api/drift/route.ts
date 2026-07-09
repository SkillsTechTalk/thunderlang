import { NextResponse } from "next/server";
import { checkDrift } from "../../../../compiler/src/drift.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let intentText = "";
  let source = "";
  let language = "typescript";
  try {
    const body = await request.json();
    intentText = typeof body?.intentText === "string" ? body.intentText : "";
    source = typeof body?.source === "string" ? body.source : "";
    if (typeof body?.language === "string") language = body.language;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!intentText.trim() || !source.trim()) {
    return NextResponse.json({ error: "Need an approved intent and source code." }, { status: 422 });
  }
  try {
    const res = checkDrift(intentText, source, { language });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Drift check failed: ${message}` }, { status: 500 });
  }
}
