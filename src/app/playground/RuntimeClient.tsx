"use client";

import { useState, useMemo } from "react";

type DecisionRun = {
  decision: string;
  result: string | null;
  matched: string | null;
  undecided: boolean;
  trace: Array<{ rule: string | null; when: string | null; matched: boolean; error?: string; note?: string }>;
  ok: boolean;
};
type LifecycleSim = {
  lifecycle: string;
  path: string[];
  steps: Array<{ event: string; from: string; to: string; ok: boolean; reason?: string }>;
  finalState: string | null;
  valid: boolean;
  endedTerminal: boolean;
};
type RunResponse = {
  ok?: boolean;
  error?: string;
  mission?: string | null;
  decisions?: Array<{ name: string; inputs: string[] }>;
  lifecycles?: Array<{ name: string; states: string[] }>;
  decisionRuns?: DecisionRun[];
  lifecycleSims?: LifecycleSim[];
};

const EXAMPLE = `mission Eligibility

decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  rule provisional
    when age >= 18
    return Provisional
  default
    return NotEligible

lifecycle Enrollment
  state Draft
  state Submitted
  state Approved
  state Rejected
  transition submit
    from Draft
    to Submitted
  transition approve
    from Submitted
    to Approved
  transition reject
    from Submitted
    to Rejected
  terminal Approved, Rejected
`;

const input =
  "rounded-md border border-white/12 bg-ink-900 px-2.5 py-1.5 text-[13px] text-haze-100 outline-none focus:border-gold-300/40";

export function RuntimeClient() {
  const [source, setSource] = useState(EXAMPLE);
  const [inputValues, setInputValues] = useState<Record<string, string>>({ age: "20", score: "90" });
  const [events, setEvents] = useState("submit, approve");
  const [res, setRes] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Declared input names across decisions, so we can render a field per input.
  const inputNames = useMemo(() => {
    const names = new Set<string>();
    (res?.decisions ?? []).forEach((d) => d.inputs.forEach((n) => names.add(n)));
    return [...names];
  }, [res]);

  async function run() {
    setBusy(true);
    setError(null);
    // Coerce numeric-looking inputs so `age >= 18` compares as numbers.
    const inputs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inputValues)) {
      inputs[k] = v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : v;
    }
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          inputs,
          events: events.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data: RunResponse = await r.json();
      if (!r.ok || data.error) {
        setError(data.error ?? "Run failed.");
        setRes(null);
      } else {
        setRes(data);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          No AI, no generated code
        </span>
        <span className="text-[11px] text-haze-500">Deterministic. Same intent + inputs, same result, every time.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: the intent + controls */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-haze-300">Intent</label>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              className="h-72 w-full resize-none rounded-xl border border-white/10 bg-ink-900/80 p-4 font-mono text-[12.5px] leading-relaxed text-haze-100 outline-none focus:border-gold-300/40"
            />
          </div>

          {inputNames.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-haze-300">Decision inputs</label>
              <div className="flex flex-wrap gap-2">
                {inputNames.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 text-[13px] text-haze-400">
                    <span className="font-mono text-haze-500">{name}</span>
                    <input
                      value={inputValues[name] ?? ""}
                      onChange={(e) => setInputValues((v) => ({ ...v, [name]: e.target.value }))}
                      className={input + " w-24"}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {(res?.lifecycles?.length ?? 0) > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-haze-300">
                Lifecycle events <span className="text-haze-600">(comma-separated)</span>
              </label>
              <input
                value={events}
                onChange={(e) => setEvents(e.target.value)}
                className={input + " w-full font-mono"}
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={run}
              disabled={busy}
              className="rounded-lg border border-gold-300/40 bg-gold-300/10 px-4 py-2 text-sm font-medium text-gold-200 transition-colors hover:bg-gold-300/20 disabled:opacity-50"
            >
              {busy ? "Running..." : "Run intent"}
            </button>
            <button
              onClick={() => { setSource(EXAMPLE); setRes(null); setError(null); }}
              className="text-xs text-haze-400 transition-colors hover:text-haze-200"
            >
              Reset example
            </button>
          </div>
          {!res && !error && (
            <p className="text-xs text-haze-500">
              Press Run. Decisions evaluate against the inputs; lifecycles simulate against the events. First time you press it, the intent is the program.
            </p>
          )}
        </div>

        {/* Right: results */}
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4 text-sm text-red-200">{error}</div>
          )}

          {res?.decisionRuns?.map((d) => (
            <div key={d.decision} className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[13px] text-haze-300">{d.decision}</span>
                <span
                  className={
                    "rounded-md px-2 py-0.5 text-[12px] font-semibold " +
                    (d.undecided
                      ? "border border-amber-400/30 bg-amber-400/[0.08] text-amber-200"
                      : "border border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-200")
                  }
                >
                  {d.result ?? "undecided"}
                </span>
              </div>
              <div className="space-y-1 font-mono text-[12px] leading-relaxed">
                {d.trace.map((t, i) => (
                  <div key={i} className={t.matched ? "text-emerald-300" : "text-haze-500"}>
                    <span className="inline-block w-4 text-center">{t.matched ? "x" : "·"}</span>
                    {t.rule ?? "(rule)"}
                    {t.when ? <span className="text-haze-600"> : when {t.when}</span> : null}
                    {t.error ? <span className="text-red-300"> {"!! "}{t.error}</span> : null}
                  </div>
                ))}
                {d.matched === "default" && <div className="text-amber-300"><span className="inline-block w-4 text-center">x</span>default</div>}
              </div>
            </div>
          ))}

          {res?.lifecycleSims?.map((s) => (
            <div key={s.lifecycle} className="rounded-xl border border-white/10 bg-ink-900/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[13px] text-haze-300">{s.lifecycle}</span>
                <span
                  className={
                    "rounded-md px-2 py-0.5 text-[12px] font-semibold " +
                    (s.valid
                      ? "border border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-200"
                      : "border border-red-400/30 bg-red-400/[0.08] text-red-200")
                  }
                >
                  {s.valid ? "valid" : "invalid"}
                </span>
              </div>
              <div className="mb-2 font-mono text-[12.5px] text-haze-200">{s.path.join("  ->  ")}</div>
              <div className="space-y-1 font-mono text-[12px] leading-relaxed">
                {s.steps.map((st, i) => (
                  <div key={i} className={st.ok ? "text-haze-300" : "text-red-300"}>
                    <span className="inline-block w-6">{st.ok ? "ok" : "X"}</span>
                    {st.from} {"--"}{st.event}{"-->"} {st.to}
                    {st.reason ? <span className="text-haze-600"> ({st.reason})</span> : null}
                  </div>
                ))}
                {s.steps.length === 0 && <div className="text-haze-500">No events. Add some above and run.</div>}
              </div>
              {s.endedTerminal && <div className="mt-2 text-[11px] text-haze-500">Ended at a terminal state.</div>}
            </div>
          ))}

          {res && !res.decisionRuns?.length && !res.lifecycleSims?.length && (
            <div className="rounded-xl border border-dashed border-white/12 p-6 text-center text-xs text-haze-500">
              No decision or lifecycle found in this intent. Add a <span className="font-mono text-haze-400">decision</span> or{" "}
              <span className="font-mono text-haze-400">lifecycle</span> block and run again.
            </div>
          )}

          {!res && !error && (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-white/12 text-center text-xs text-haze-500">
              Results appear here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
