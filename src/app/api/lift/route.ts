import { NextResponse } from "next/server";
// IntentLift runs in the compiler core (the backbone). The app only renders it.
import { liftSource } from "../../../../compiler/src/lift.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 40000;

export async function POST(request: Request) {
  let source = "";
  let language = "typescript";
  try {
    const body = await request.json();
    source = typeof body?.source === "string" ? body.source : "";
    if (typeof body?.language === "string") language = body.language;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!source.trim()) {
    return NextResponse.json({ error: "Paste some source code first." }, { status: 422 });
  }
  if (source.length > MAX_SOURCE) {
    return NextResponse.json({ error: "Source too large." }, { status: 413 });
  }

  try {
    const result = liftSource(source, { language, file: "input.ts" });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    return NextResponse.json({
      ok: true,
      aiUsed: false,
      intentText: result.intentText,
      summary: result.summary,
      diagnostics: result.diagnostics,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Lift failed: ${message}` }, { status: 500 });
  }
}
