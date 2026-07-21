import { NextResponse } from "next/server";
import { verifyDiff } from "../../../../compiler/src/verify-diff.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let intentText = "";
  let before: string | null = null;
  let after = "";
  let language = "typescript";
  try {
    const body = await request.json();
    intentText = typeof body?.intentText === "string" ? body.intentText : "";
    before = typeof body?.before === "string" && body.before.trim() ? body.before : null;
    after = typeof body?.after === "string" ? body.after : "";
    if (typeof body?.language === "string") language = body.language;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!intentText.trim() || !after.trim()) {
    return NextResponse.json({ error: "Need an intent and the proposed (after) code." }, { status: 422 });
  }
  try {
    const res = verifyDiff(intentText, { before, after, language });
    // verifyDiff returns its own `ok` (no blocking findings); here `ok: true`
    // means the request succeeded. The gate signal lives in verdict/blocking.
    return NextResponse.json({ ...res, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Verify-diff failed: ${message}` }, { status: 500 });
  }
}
