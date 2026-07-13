import { NextResponse } from "next/server";
// The deterministic IntentLang compiler is a plain-ESM sibling package.
// It runs server-side with no AI. See src/compiler.d.ts for the type shape.
import { compileSource } from "../../../../compiler/src/compile.mjs";
import { parseIntent } from "../../../../compiler/src/parse.mjs";
import { toTypeScript } from "../../../../compiler/src/codegen.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 20000;

export async function POST(request: Request) {
  let source = "";
  try {
    const body = await request.json();
    source = typeof body?.source === "string" ? body.source : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!source.trim()) {
    return NextResponse.json({ error: "Write some intent first." }, { status: 422 });
  }
  if (source.length > MAX_SOURCE) {
    return NextResponse.json(
      { error: `Source too large (max ${MAX_SOURCE} characters).` },
      { status: 413 },
    );
  }

  try {
    // Deterministic, no AI. Fixed timestamp so repeat compiles are identical.
    const result = compileSource(source, {
      sourceFile: "playground.intent",
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
    // Deterministic code generation (no AI): the typed contract + decision logic, TODO stubs.
    let generatedCode = "";
    try {
      generatedCode = toTypeScript(parseIntent(source));
    } catch {
      generatedCode = "// Code generation unavailable for this source.";
    }
    return NextResponse.json({ ok: true, aiUsed: false, generatedCode, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `Compile failed: ${message}` },
      { status: 500 },
    );
  }
}
