import { NextResponse } from "next/server";
import { approveIntent } from "../../../../compiler/src/drift.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let intentText = "";
  let approvedBy: string | null = null;
  let approvedAt: string | null = null;
  try {
    const body = await request.json();
    intentText = typeof body?.intentText === "string" ? body.intentText : "";
    if (typeof body?.approvedBy === "string") approvedBy = body.approvedBy;
    if (typeof body?.approvedAt === "string") approvedAt = body.approvedAt;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!intentText.trim()) {
    return NextResponse.json({ error: "Nothing to approve." }, { status: 422 });
  }
  try {
    const res = approveIntent(intentText, { approvedBy, approvedAt });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Approve failed: ${message}` }, { status: 500 });
  }
}
