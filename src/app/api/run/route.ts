import { NextResponse } from "next/server";
// The Intent Runtime runs in the deterministic compiler core (no AI). It EXECUTES intent:
// decisions evaluate against inputs, lifecycles simulate against events.
import { parseIntent } from "../../../../compiler/src/parse.mjs";
import {
  evaluateDecision,
  simulateLifecycle,
} from "../../../../compiler/src/runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SOURCE = 20000;

export async function POST(request: Request) {
  let source = "";
  let inputs: Record<string, unknown> = {};
  let events: string[] = [];
  let decision: string | null = null;
  let lifecycle: string | null = null;
  try {
    const body = await request.json();
    source = typeof body?.source === "string" ? body.source : "";
    if (body?.inputs && typeof body.inputs === "object") inputs = body.inputs;
    if (Array.isArray(body?.events)) {
      events = body.events.filter((e: unknown): e is string => typeof e === "string");
    }
    if (typeof body?.decision === "string") decision = body.decision;
    if (typeof body?.lifecycle === "string") lifecycle = body.lifecycle;
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
    // Deterministic, no AI, no network, no filesystem. Pure function of the intent + inputs.
    const ast = parseIntent(source) as {
      mission?: string | null;
      decisions?: Array<{ name: string; inputs: string[] }>;
      lifecycles?: Array<{ name: string; states: string[] }>;
    };
    const decisions = ast.decisions ?? [];
    const lifecycles = ast.lifecycles ?? [];

    const pickedDecisions = decision
      ? decisions.filter((d) => d.name === decision)
      : decisions;
    const pickedLifecycles = lifecycle
      ? lifecycles.filter((l) => l.name === lifecycle)
      : lifecycles;

    const decisionRuns = pickedDecisions.map((d) => evaluateDecision(d, inputs));
    const lifecycleSims = pickedLifecycles.map((l) => simulateLifecycle(l, events));

    return NextResponse.json({
      ok: true,
      aiUsed: false,
      mission: ast.mission ?? null,
      // The declared shapes, so the UI can render input fields / event pickers.
      decisions: decisions.map((d) => ({ name: d.name, inputs: d.inputs ?? [] })),
      lifecycles: lifecycles.map((l) => ({ name: l.name, states: l.states ?? [] })),
      decisionRuns,
      lifecycleSims,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Run failed: ${message}` }, { status: 500 });
  }
}
