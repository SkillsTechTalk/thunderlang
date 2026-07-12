"use client";

import { useState, useMemo, useEffect, useRef } from "react";

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
  steps: Array<{ event: string; from: string; to: string; ok: boolean; reason?: string; transition?: string }>;
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

const DEFAULT_INPUTS: Record<string, string> = { age: "20", score: "90" };
const DEFAULT_EVENTS = "submit, approve";

const input =
  "rounded-md border border-white/12 bg-ink-900 px-2.5 py-1.5 text-[13px] text-haze-100 outline-none focus:border-gold-300/40";

function DecisionCard({ d }: { d: DecisionRun }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900/60">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-haze-500">Decision</span>
          <span className="truncate font-mono text-[13px] text-haze-200">{d.decision}</span>
        </div>
        <span
          className={
            "shrink-0 rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold " +
            (d.undecided
              ? "border border-amber-400/30 bg-amber-400/[0.08] text-amber-200"
              : "border border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-200")
          }
        >
          {d.result ?? "undecided"}
        </span>
      </div>

      <div className="px-4 py-3">
        {d.undecided ? (
          <p className="mb-2.5 text-[12px] text-amber-200/90">No rule matched and no default is declared.</p>
        ) : (
          <p className="mb-2.5 text-[12px] text-haze-400">
            First matching rule wins.{" "}
            <span className="font-mono text-haze-300">{d.matched}</span> matched, so it returns{" "}
            <span className="font-mono text-emerald-300">{d.result}</span>.
          </p>
        )}

        <div className="space-y-1 font-mono text-[12px] leading-relaxed">
          {d.trace.map((t, i) => {
            const winner = t.matched && t.rule != null && t.rule === d.matched;
            return (
              <div
                key={i}
                className={
                  "flex items-baseline gap-2 rounded-md px-2 py-1 " +
                  (winner
                    ? "bg-emerald-400/[0.07] text-emerald-200"
                    : t.matched
                      ? "text-haze-400"
                      : "text-haze-500")
                }
              >
                <span className={"w-5 shrink-0 text-center " + (winner ? "text-emerald-300" : "text-haze-600")}>
                  {winner ? "->" : "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={winner ? "text-emerald-200" : "text-haze-300"}>{t.rule ?? "(rule)"}</span>
                  {t.when ? <span className="text-haze-600">{"  when "}{t.when}</span> : null}
                  {t.note ? <span className="text-haze-600"> ({t.note})</span> : null}
                  {t.error ? <span className="text-red-300"> !! {t.error}</span> : null}
                </span>
                <span className={"shrink-0 text-[11px] " + (winner ? "text-emerald-300" : t.matched ? "text-haze-500" : "text-haze-600")}>
                  {t.error ? "error" : t.matched ? (winner ? "first hit" : "true") : "false"}
                </span>
              </div>
            );
          })}
          {d.matched === "default" && (
            <div className="flex items-baseline gap-2 rounded-md bg-emerald-400/[0.07] px-2 py-1 text-emerald-200">
              <span className="w-5 shrink-0 text-center text-emerald-300">{"->"}</span>
              <span className="min-w-0 flex-1">
                default<span className="text-haze-600">{"  no rule matched"}</span>
              </span>
              <span className="shrink-0 text-[11px] text-emerald-300">catch-all</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LifecycleCard({ s }: { s: LifecycleSim }) {
  const okSteps = s.steps.filter((st) => st.ok);
  const rejected = s.steps.filter((st) => !st.ok);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-900/60">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-haze-500">Lifecycle</span>
          <span className="truncate font-mono text-[13px] text-haze-200">{s.lifecycle}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {s.endedTerminal && (
            <span className="rounded-md border border-white/12 px-2 py-0.5 text-[11px] text-haze-400">terminal</span>
          )}
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
      </div>

      <div className="px-4 py-3">
        {/* Walked path as a left-to-right chain of states and transitions. */}
        <div className="flex flex-wrap items-center gap-y-2 font-mono text-[12px]">
          <span
            className={
              "rounded-md border px-2 py-1 " +
              (s.path.length === 1
                ? "border-gold-300/40 bg-gold-300/[0.08] text-gold-200"
                : "border-white/12 bg-ink-900 text-haze-300")
            }
          >
            {s.path[0]}
          </span>
          {okSteps.map((st, i) => {
            const isLast = i === okSteps.length - 1;
            return (
              <span key={i} className="flex items-center">
                <span className="mx-1.5 flex flex-col items-center leading-none">
                  <span className="mb-1 text-[10px] text-haze-500">{st.transition ?? st.event}</span>
                  <span className="text-haze-600">{"->"}</span>
                </span>
                <span
                  className={
                    "rounded-md border px-2 py-1 " +
                    (isLast
                      ? "border-gold-300/40 bg-gold-300/[0.08] text-gold-200"
                      : "border-white/12 bg-ink-900 text-haze-300")
                  }
                >
                  {st.to}
                </span>
              </span>
            );
          })}
        </div>

        {s.steps.length === 0 && (
          <p className="mt-2 text-[12px] text-haze-500">No events yet. Add some above and run.</p>
        )}

        {rejected.length > 0 && (
          <div className="mt-3 space-y-1 font-mono text-[12px] leading-relaxed">
            {rejected.map((st, i) => (
              <div key={i} className="flex items-baseline gap-2 rounded-md bg-red-400/[0.05] px-2 py-1 text-red-300">
                <span className="w-5 shrink-0 text-center">x</span>
                <span className="min-w-0 flex-1">
                  {st.event}
                  {st.reason ? <span className="text-red-300/70"> rejected: {st.reason}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[11px] text-haze-500">
          Ended in <span className="font-mono text-haze-400">{s.finalState}</span>
          {s.endedTerminal ? ", a terminal state. No further events are legal." : "."}
        </p>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k} className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-3 w-28 rounded bg-white/[0.06]" />
            <div className="h-5 w-16 rounded bg-white/[0.06]" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
            <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
            <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RuntimeClient() {
  const [source, setSource] = useState(EXAMPLE);
  const [inputValues, setInputValues] = useState<Record<string, string>>(DEFAULT_INPUTS);
  const [events, setEvents] = useState(DEFAULT_EVENTS);
  const [res, setRes] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Declared input names across decisions, so we can render a field per input.
  const inputNames = useMemo(() => {
    const names = new Set<string>();
    (res?.decisions ?? []).forEach((d) => d.inputs.forEach((n) => names.add(n)));
    return [...names];
  }, [res]);

  async function run(override?: { source?: string; inputs?: Record<string, string>; events?: string }) {
    setBusy(true);
    setError(null);
    const src = override?.source ?? source;
    const rawInputs = override?.inputs ?? inputValues;
    const evts = override?.events ?? events;
    // Coerce numeric-looking inputs so `age >= 18` compares as numbers.
    const inputs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawInputs)) {
      inputs[k] = v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : v;
    }
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: src,
          inputs,
          events: evts.split(",").map((s) => s.trim()).filter(Boolean),
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

  // Run the prefilled example once on mount so the panel opens with live results.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void run({ source: EXAMPLE, inputs: DEFAULT_INPUTS, events: DEFAULT_EVENTS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetExample() {
    setSource(EXAMPLE);
    setInputValues(DEFAULT_INPUTS);
    setEvents(DEFAULT_EVENTS);
    setError(null);
    void run({ source: EXAMPLE, inputs: DEFAULT_INPUTS, events: DEFAULT_EVENTS });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void run();
                }
              }}
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
              onClick={() => void run()}
              disabled={busy}
              className="rounded-lg border border-gold-300/40 bg-gold-300/10 px-4 py-2 text-sm font-medium text-gold-200 transition-colors hover:bg-gold-300/20 disabled:opacity-50"
            >
              {busy ? "Running..." : "Run intent"}
            </button>
            <button
              onClick={resetExample}
              className="text-xs text-haze-400 transition-colors hover:text-haze-200"
            >
              Reset example
            </button>
          </div>
          <p className="text-xs text-haze-500">
            Change an input, try age 16, or add a bad event like{" "}
            <span className="font-mono text-haze-400">submit</span> after approval, then run again. The trace on the
            right is the full audit of how the intent decided.
          </p>
        </div>

        {/* Right: results */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-haze-300">Results</span>
            {res?.mission && (
              <span className="font-mono text-[11px] text-haze-500">mission {res.mission}</span>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-4 text-sm text-red-200">{error}</div>
          )}

          {busy && !res && !error && <ResultsSkeleton />}

          {res && (
            <div className={"flex flex-col gap-4 transition-opacity " + (busy ? "opacity-60" : "opacity-100")}>
              {res.decisionRuns?.map((d) => (
                <DecisionCard key={d.decision} d={d} />
              ))}

              {res.lifecycleSims?.map((s) => (
                <LifecycleCard key={s.lifecycle} s={s} />
              ))}

              {!res.decisionRuns?.length && !res.lifecycleSims?.length && (
                <div className="rounded-xl border border-dashed border-white/12 p-6 text-center text-xs text-haze-500">
                  No decision or lifecycle found in this intent. Add a <span className="font-mono text-haze-400">decision</span> or{" "}
                  <span className="font-mono text-haze-400">lifecycle</span> block and run again.
                </div>
              )}

              <p className="text-[11px] text-haze-600">
                Evaluated by the deterministic runtime. No model in the loop, so this trace is reproducible proof, not a
                plausible guess.
              </p>
            </div>
          )}

          {!res && !error && !busy && (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-white/12 text-center text-xs text-haze-500">
              Results appear here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
