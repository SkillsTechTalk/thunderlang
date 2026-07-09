import { NextResponse } from "next/server";
// Same compiler core the CLI uses. No parsing/completions logic in the app.
import { getCompletions, getHover } from "../../../../compiler/src/intellisense.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 20000;

export async function POST(request: Request) {
  let source = "";
  let position = { line: 1, column: 1 };
  try {
    const body = await request.json();
    source = typeof body?.source === "string" ? body.source : "";
    if (body?.position) {
      position = {
        line: Number(body.position.line) || 1,
        column: Number(body.position.column) || 1,
      };
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (source.length > MAX_SOURCE) {
    return NextResponse.json({ error: "Source too large." }, { status: 413 });
  }

  try {
    const completions = getCompletions(source, position).items;
    const hover = getHover(source, position).hover;
    return NextResponse.json({ ok: true, source: "compiler", hover, completions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Assist failed: ${message}` }, { status: 500 });
  }
}
