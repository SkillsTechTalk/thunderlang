"use client";
// The five reading levels (Big Picture, Flow, Details, Text, Original) for any code. ThunderLang defines what each
// level shows (LEVELS and readLevel in the compiler); this component only lays it out, so the site shows exactly what
// OpenThunder shows at the same level. Used by the home page, /language, and Semantic Zoom.
import { useMemo, useState } from "react";
import { thunderModel, readLevel } from "../../../compiler/src/model.mjs";
import type { ThunderModel, LevelId, LevelView } from "../../../compiler/src/model.d.mts";
import { LEVELS, THUNDER_VISUAL, thunderTokens } from "../../../compiler/src/visual.mjs";
import { explainPlain } from "../../../compiler/src/plain-contract.mjs";
import { runtimeOverlay, fromTrace, explainError } from "../../../compiler/src/running.mjs";
import type { RuntimeOverlay, MemberRun, ErrorExplanation } from "../../../compiler/src/running.d.mts";
import { Symbol, ThingCard, DataCard, FlowBlocks, HEX, focus, runWords, type SymbolId } from "./ThunderParts";
import { sourceLines } from "../../lib/source-tokens.mjs";

/** The same answer words the flow uses: BigFee -> Big fee, true -> Yes. */
const answerWords = (r: string) => (/^true$/i.test(r) ? "Yes" : /^false$/i.test(r) ? "No" : ((w) => w.charAt(0).toUpperCase() + w.slice(1))(String(r).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase()));

type PlainInput = { id: string; kind: "number" | "yesno"; label: string; yes?: string; no?: string };

/** Try a rule exactly as the compiler read it. */
export function TryRule({ rule }: { rule: { inputs: PlainInput[] } }) {
  const [values, setValues] = useState<Record<string, number | boolean>>(() => Object.fromEntries(rule.inputs.map((i) => [i.id, i.kind === "yesno" ? true : 0])));
  const run = useMemo(() => { try { return explainPlain(rule as never, values) as { outcome: string; ruleIndex: number }; } catch { return null; } }, [rule, values]);
  return (
    <div className="rounded-2xl border border-[#7FB2FF]/40 bg-[#7FB2FF]/[0.05] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#A9C9FF]">Try the rule</h3>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        {rule.inputs.map((i) => i.kind === "number" ? (
          <label key={i.id} className="flex flex-col gap-1 text-sm text-haze-300">{i.label}
            <input type="number" value={Number(values[i.id])} onChange={(e) => setValues((v) => ({ ...v, [i.id]: Number(e.target.value) }))} className={`w-28 rounded-lg border border-white/15 bg-ink-950 px-3 py-2 font-mono text-white ${focus}`} />
          </label>
        ) : (
          <div key={i.id} role="group" aria-label={i.label} className="flex gap-1">
            {[true, false].map((b) => <button key={String(b)} type="button" aria-pressed={values[i.id] === b} onClick={() => setValues((v) => ({ ...v, [i.id]: b }))} className={`rounded-lg border px-3 py-2 text-sm ${focus} ${values[i.id] === b ? "border-[#FCD34D]/60 text-[#FCD34D]" : "border-white/15 text-haze-300"}`}>{b ? i.yes : i.no}</button>)}
          </div>
        ))}
      </div>
      {run && <p className="mt-4 text-[17px] text-white">The rule answers <span className="rounded-full border border-[#67E8F9]/60 px-3 py-1 text-[#67E8F9]">{answerWords(run.outcome)}</span> <span className="text-sm text-haze-400">({run.ruleIndex < 0 ? "no rule matched, so the otherwise answer" : `rule ${run.ruleIndex + 1} matched`})</span></p>}
      <p className="mt-2 text-xs text-haze-400">This runs the rule exactly as the Thunder compiler read it from the code.</p>
    </div>
  );
}

/** Thunder Text, each word colored by the role the compiler gives it. */
function ColoredText({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-5 font-mono text-[13.5px] leading-relaxed text-haze-100"><code>
      {text.split("\n").map((line, i) => (
        <div key={i}>{thunderTokens(line).map((t, j) => <span key={j} style={t.role && t.role !== "unread" ? { color: HEX[t.role] } : t.role === "unread" ? { color: "#8A93A6" } : undefined}>{t.text}</span>)}{line === "" ? " " : null}</div>
      ))}
    </code></pre>
  );
}

const Chip = ({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) => (
  <span className={`rounded-full border px-2 py-0.5 text-xs text-haze-300 ${dashed ? "border-dashed border-white/30" : "border-white/25"}`}>{children}</span>
);

type When = { question: string; answer: string };

/** The answers that lead to a step: "Is the book's status on shelf? → No". */
function WhenList({ when }: { when: When[] }) {
  if (!when.length) return <p className="mt-1 text-xs text-haze-400">Always, on the main path.</p>;
  return (
    <ul aria-label="When" className="mt-1.5 flex flex-wrap gap-1.5">
      {when.map((w, i) => (
        <li key={i} className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1 text-xs text-haze-300">
          <span className="text-[#A9C9FF]">{w.question}</span><span aria-hidden="true" className="text-haze-500">→</span><span className="font-semibold text-white">{w.answer}</span>
        </li>
      ))}
    </ul>
  );
}

function LineButton({ line, showLine }: { line: number | null; showLine: (l: number) => void }) {
  if (!line) return null;
  return <button type="button" onClick={() => showLine(line)} className={`ml-auto shrink-0 rounded font-mono text-xs text-haze-400 hover:text-white ${focus}`} aria-label={`Show line ${line} in the original code`}>line {line}</button>;
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "stop" }) {
  return (
    <section className={`rounded-2xl border p-5 ${tone === "stop" ? "border-[#FDBA74]/30" : "border-white/10"}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-haze-400">{title}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A recorded run to show on the flows: what was run, and the record itself (thunder-executed-v1 trace). */
export type RecordedRun = { label: string; trace: { files: Record<string, unknown> }; crash?: string };

/** "What happened when it ran": the switch, and what the run says about this action or rule. */
function RunPanel({ run, on, setOn, memberRun, label, crash }: { run: RecordedRun; on: boolean; setOn: (v: boolean) => void; memberRun?: MemberRun; label: string; crash: ErrorExplanation | null }) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-ink-850/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-white">
          <input type="checkbox" role="switch" aria-checked={on} checked={on} onChange={(e) => setOn(e.target.checked)} className={`h-5 w-5 accent-[#FCD34D] ${focus}`} />
          What happened when it ran
        </label>
        <span aria-hidden="true" className="text-sm text-haze-400">{on ? "showing a sample run" : "off"}</span>
      </div>
      {on && (
        <div aria-live="polite" className="mt-2 space-y-2 text-sm">
          <p className="text-haze-300"><Chip dashed>Sample run</Chip> <span className="ml-1">{run.label}. Counts come only from this run; a step with no count was not observed, which is not the same as never.</span></p>
          {memberRun?.says ? <p className="text-[15px] text-white">{memberRun.says}</p> : <p className="text-haze-300">This sample run never reached {label}.</p>}
          {memberRun && memberRun.hotPath.length > 1 && <p className="text-haze-300"><span className="font-semibold text-haze-200">Most often: </span>{memberRun.hotPath.map((h) => (h.side ? `${h.text.replace(/\?$/, "")}? ${h.side}` : h.text)).join(" → ")}</p>}
          {crash?.matched && <p className="rounded-xl border border-[#FDBA74]/40 px-3 py-2 text-haze-100"><span className="font-semibold text-[#FDBA74]">One run crashed (not one of its Stops):</span> {crash.text}</p>}
        </div>
      )}
    </div>
  );
}

const rangeText = (r: { from: number | null; to: number | null }) => (r.from === null ? `${r.to} or less` : r.to === null ? `${r.from} or more` : r.from === r.to ? `exactly ${r.from}` : `${r.from} to ${r.to}`);

/** Details: a fact sheet of what you need to check before you trust or change an action or rule. */
function DetailsSheet({ view, member, thingLabel, file, open, showLine, memberRun }: { view: LevelView; member: { kind: string; lines: [number, number]; flow: { nodes: { id: string; kind: string; line?: number; text: string }[] } }; thingLabel?: string; file: string; open: (id: string) => void; showLine: (l: number) => void; memberRun?: MemberRun }) {
  // What the run showed at a Stop or ending on this line (the sample run, when it is switched on).
  const runAt = (kind: string, line: number | null, text?: string) => {
    if (!memberRun) return null;
    const n = member.flow.nodes.find((x) => x.kind === kind && (x.line ?? null) === line && (text == null || x.text === text || x.text === `Gives back ${text}`)) ?? member.flow.nodes.find((x) => x.kind === kind && (x.line ?? null) === line);
    const w = n ? runWords(memberRun.nodes[n.id], memberRun.calls) : null;
    return w ? <span className="ml-2 shrink-0 rounded-full border border-white/25 px-2.5 py-0.5 font-mono text-xs text-haze-200"><span className="sr-only">When it ran: </span>{w}</span> : null;
  };
  const isRule = !!view.answers || member.kind === "rule";
  const stopColor = HEX[THUNDER_VISUAL.does.stop?.color ?? "failure"];
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        {view.answers && (
          <Card title="Its answers, in order">
            <ol className="space-y-2">
              {view.answers.map((a, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-2 text-[15px]">
                  <span className="rounded-full border border-[#67E8F9]/50 px-2.5 py-0.5 font-medium text-[#67E8F9]">{a.answer}</span>
                  <span className="text-haze-200">{a.when === "otherwise" ? "otherwise (when no rule above fits)" : `when ${a.when}`}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-haze-400">The first answer that fits wins.</p>
          </Card>
        )}
        {view.limits && (
          <Card title={`Exact limits for ${view.limits.fact}`}>
            <ol aria-label={`Answers by ${view.limits.fact}`} className="flex overflow-hidden rounded-xl border border-white/15">
              {view.limits.ranges.map((r, i) => (
                <li key={i} className={`flex-1 px-3 py-3 text-center ${i ? "border-l border-white/15" : ""}`}>
                  <p className="font-mono text-sm text-white">{rangeText(r)}</p>
                  <p className="mt-1 text-sm font-medium text-[#67E8F9]">{r.answer}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-haze-400">Found by running the rule on every whole number around each limit, not by reading the words.</p>
          </Card>
        )}
        {view.tryable ? <TryRule rule={view.rule as { inputs: PlainInput[] }} /> : isRule && <p className="rounded-2xl border border-dashed border-white/25 p-4 text-sm text-haze-300">This rule can&apos;t be tried yet: it uses facts the {thingLabel ?? "code"} keeps for itself, which Thunder doesn&apos;t feed in yet.</p>}

        {!view.answers && (
          <Card title="Every way it can end" tone={view.stops?.length ? "stop" : undefined}>
            <ul className="space-y-3">
              {view.stops!.map((st, i) => (
                <li key={`s${i}`}>
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]" style={{ color: stopColor, borderColor: `${stopColor}66` }}>■</span>
                    <p className="text-[15px] text-white"><span className="font-semibold" style={{ color: stopColor }}>Stops: {st.error}</span>{st.message && <span className="text-haze-200">, and the person sees “{st.message}”</span>}</p>
                    {runAt("stop", st.line)}
                    <LineButton line={st.line} showLine={showLine} />
                  </div>
                  <WhenList when={st.when} />
                </li>
              ))}
              {view.givesBack!.map((g, i) => (
                <li key={`g${i}`}>
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#67E8F9]/40 text-[11px] text-[#67E8F9]">⇥</span>
                    <p className="text-[15px] text-white">{g.text}</p>
                    {runAt("end", g.line, g.text)}
                    <LineButton line={g.line} showLine={showLine} />
                  </div>
                  <WhenList when={g.when} />
                </li>
              ))}
              {!view.givesBack!.some((g) => !g.when.length) && (
                <li className="flex items-start gap-2 text-[15px] text-haze-200"><span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#86EFAC]/40 text-[11px] text-[#86EFAC]">✓</span>Finishes after its last step{view.stops!.length ? ", when none of the stops above happen" : ""}.{runAt("end", null)}</li>
              )}
            </ul>
          </Card>
        )}

        {view.changes!.length > 0 && (
          <Card title="What it changes">
            <ul className="space-y-3">
              {view.changes!.map((c, i) => (
                <li key={i}>
                  <div className="flex items-start gap-2"><span className="text-[15px] text-white">{c.text}</span><LineButton line={c.line} showLine={showLine} /></div>
                  {c.when.length > 0 && <WhenList when={c.when} />}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {view.inputs!.length > 0 && (
          <Card title="What goes in">
            <ul className="space-y-2">
              {view.inputs!.map((inp) => (
                <li key={inp.label} className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span className="text-[#FCD34D]">{inp.label}</span>
                  <span className="text-sm text-haze-400">{inp.lines.length ? <>used on {inp.lines.map((l, i) => <span key={l}>{i ? ", " : ""}<button type="button" onClick={() => showLine(l)} className={`rounded font-mono text-xs hover:text-white ${focus}`}>line {l}</button></span>)}</> : "not used in any step Thunder read"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div className="space-y-5">
        <Card title="What it relies on">
          {view.reliesOn!.length ? (
            <ul className="space-y-2">
              {view.reliesOn!.map((r) => (
                <li key={r.id}><button type="button" onClick={() => open(r.id)} className={`flex w-full items-start gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 py-2.5 text-left hover:border-white/30 ${focus}`}>
                  <Symbol id={r.symbol as SymbolId} size={22} />
                  <span><span className="block font-medium text-white">{r.label}</span><span className="block text-sm text-haze-300">{r.says}</span></span>
                </button></li>
              ))}
            </ul>
          ) : <p className="text-sm text-haze-300">Nothing else in this file.</p>}
          {view.usedBy!.length > 0 && <p className="mt-3 text-sm text-haze-300">Used by {view.usedBy!.map((u, i) => <span key={u.id}>{i ? ", " : ""}<button type="button" onClick={() => open(u.id)} className={`rounded text-[#A9C9FF] hover:underline ${focus}`}>{u.label}</button></span>)}.</p>}
        </Card>

        <Card title="How sure Thunder is">
          <p className="text-sm text-haze-200">{view.source} {file}, lines {member.lines[0]}–{member.lines[1]}.</p>
          <p className="mt-2 text-sm text-haze-200">{view.notExplained ? `${view.notExplained} step(s) are shown as code because Thunder can't explain them yet.` : "Every step was explained; nothing is shown as raw code."}</p>
          {view.openQuestions!.length > 0 && (
            <>
              <p className="mt-4 text-sm font-medium text-white">What the code can&apos;t tell you</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-haze-300">{view.openQuestions!.map((q) => <li key={q}>{q}</li>)}</ul>
            </>
          )}
        </Card>

        <details className="rounded-2xl border border-white/10 p-5">
          <summary className={`cursor-pointer text-xs font-semibold uppercase tracking-wider text-haze-400 ${focus}`}>Every step ({view.steps!.length})</summary>
          <ol aria-label="Every step" className="mt-3 space-y-1.5">
            {view.steps!.map((s) => {
              const color = HEX[THUNDER_VISUAL.does[s.does]?.color ?? "structure"];
              return (
                <li key={s.id} style={{ paddingLeft: `${s.depth * 1.1}rem` }} className="flex items-start gap-2 text-sm">
                  {s.via && <span className="mt-0.5 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-haze-400">{s.via}</span>}
                  <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-semibold ${s.notExplained ? "border-dashed border-white/30 text-haze-400" : ""}`} style={s.notExplained ? undefined : { color, borderColor: `${color}66` }}>{s.mark}</span>
                  <span className={s.notExplained ? "font-mono text-haze-300" : "text-haze-100"}>{s.text}</span>
                  <LineButton line={s.line} showLine={showLine} />
                </li>
              );
            })}
          </ol>
        </details>
      </div>
    </div>
  );
}

export function ReadingLevels({ source, file, name, initialFocus, initialLevel = "big-picture", editable = false, onSourceChange, run, runHidden }: {
  source: string; file: string; name?: string;
  /** A recorded run of exactly this code: offers "What happened when it ran" at Flow and Details. */
  run?: RecordedRun;
  /** Why a recorded run is not offered right now (e.g. the code was edited after it was recorded). */
  runHidden?: string;
  /** A member's name (e.g. return_book) to show at Flow, Details, Text, and Original until another is chosen. */
  initialFocus?: string; initialLevel?: LevelId; editable?: boolean; onSourceChange?: (s: string) => void;
}) {
  const model = useMemo<ThunderModel | null>(() => { try { return thunderModel([{ path: file, source }], { name: name ?? file }) as ThunderModel; } catch { return null; } }, [source, file, name]);
  // The Original level in editor colors, language from the file name (plain text if unsupported).
  const lines = useMemo(() => sourceLines(source, file), [source, file]);
  const firstMember = model?.members.find((m) => m.name === initialFocus)?.id ?? null;
  const [level, setLevel] = useState<LevelId>(initialLevel);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<[number, number] | null>(null);
  const [showRun, setShowRun] = useState(false);
  // The running system: the recorded run placed on this model's flows (only evidence; nothing inferred).
  const overlay = useMemo<RuntimeOverlay | null>(() => { try { return run && model ? runtimeOverlay(model, fromTrace(run.trace as never)) as RuntimeOverlay : null; } catch { return null; } }, [run, model]);
  const crash = useMemo<ErrorExplanation | null>(() => { try { return run?.crash && model ? explainError(model, run.crash) as ErrorExplanation : null; } catch { return null; } }, [run, model]);

  if (!model) return <p className="text-haze-300">Thunder could not read this code. Check that it is complete.</p>;
  const exists = (id: string | null) => !!id && (model.members.some((m) => m.id === id) || model.things.some((t) => t.id === id));
  const chosen = exists(focusId) ? focusId : null;
  // Big Picture starts with the whole file; the other levels show the chosen action or rule (or the example's own).
  const focusFor = (lv: LevelId) => (lv === "big-picture" ? chosen : chosen ?? (exists(firstMember) ? firstMember : null)) ?? undefined;
  const view = readLevel(model, level, focusFor(level)) as LevelView;
  const member = view.scope === "member" ? model.members.find((m) => m.id === view.id) ?? null : null;
  const thing = view.scope === "thing" ? model.things.find((t) => t.id === view.id) ?? null : member?.owner ? model.things.find((t) => t.id === member.owner) ?? null : null;

  const open = (id: string) => { setFocusId(id); setHighlight(null); setLevel(model.members.some((m) => m.id === id) ? "flow" : "big-picture"); };
  const showLine = (l: number) => { setHighlight([l, l]); setLevel("original"); };
  const current = LEVELS.find((l) => l.id === level)!;
  const focusLines = highlight ?? view.lines;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Reading level" className="flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-ink-850/60 p-1">
        {LEVELS.map((l, i) => (
          <span key={l.id} className="flex items-center">
            {i > 0 && <span aria-hidden="true" className="px-0.5 text-haze-500">›</span>}
            <button type="button" role="tab" id={`lv-${l.id}`} aria-selected={level === l.id} aria-controls="lv-panel" onClick={() => { setLevel(l.id); setHighlight(null); }}
              className={`min-h-11 rounded-xl px-4 text-sm ${focus} ${level === l.id ? "bg-gold-400/[0.14] font-semibold text-white ring-1 ring-gold-300/60" : "text-haze-300 hover:text-white"}`}>{l.name}</button>
          </span>
        ))}
      </div>
      <p className="text-sm text-haze-300"><span className="font-semibold text-white">{current.name}:</span> {current.question} <span className="text-haze-400">{current.shows}</span></p>

      <nav aria-label="Where you are" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-haze-400">You are reading:</span>
        <button type="button" onClick={() => { setFocusId(null); setLevel("big-picture"); }} className={`rounded text-haze-300 hover:text-white ${focus}`}>{file}</button>
        {thing && <><span aria-hidden="true" className="text-haze-500">›</span><button type="button" onClick={() => open(thing.id)} className={`rounded text-haze-300 hover:text-white ${focus}`}>{thing.label}</button></>}
        {member && <><span aria-hidden="true" className="text-haze-500">›</span><span className="font-medium text-white">{view.title}</span></>}
      </nav>

      <div id="lv-panel" role="tabpanel" aria-labelledby={`lv-${level}`}>
        {view.needsFocus && (
          <div className="rounded-2xl border border-white/10 p-5">
            <p className="text-haze-200">{view.says}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{view.choose!.map((c) => <li key={c.id}><button type="button" onClick={() => { setFocusId(c.id); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 text-left text-white hover:border-white/30 ${focus}`}><Symbol id={c.symbol as SymbolId} size={22} />{c.label}{c.route && <span className="font-mono text-xs text-[#FCD34D]">{c.route}</span>}</button></li>)}</ul>
          </div>
        )}

        {level === "big-picture" && !view.needsFocus && view.scope !== "member" && (
          <div className="space-y-5">
            {view.purpose && <p className="text-lg text-haze-200"><span className="mr-2"><Chip>Author&apos;s note</Chip></span>{view.purpose}</p>}
            <div className="grid gap-5 lg:grid-cols-2">
              {model.things.filter((t) => view.things!.some((x) => x.id === t.id)).map((t) => <ThingCard key={t.id} t={t} model={model} onOpen={open} />)}
              {(view.loose!.length > 0 || (view.scope === "app" && (view.actions!.some((a) => !model.members.find((m) => m.id === a.id)?.owner) || view.rules!.some((r) => !model.members.find((m) => m.id === r.id)?.owner)))) && (
                <section aria-labelledby="lv-loose" className="rounded-3xl border border-white/12 p-6">
                  <h3 id="lv-loose" className="text-lg font-semibold text-white">What this file can do</h3>
                  <ul className="mt-3 grid gap-2">{[...view.actions!, ...view.rules!, ...view.loose!].filter((x) => !model.members.find((m) => m.id === x.id)?.owner).map((x) => <li key={x.id}><button type="button" onClick={() => open(x.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-850/60 px-3 text-left hover:border-white/30 ${focus}`}><Symbol id={x.symbol as SymbolId} size={24} /><span className="text-[15px] font-medium text-white">{x.label}</span>{x.route && <span className="font-mono text-xs text-[#FCD34D]">{x.route}</span>}<span aria-hidden="true" className="ml-auto text-haze-400">→</span></button></li>)}</ul>
                </section>
              )}
            </div>
            {view.data!.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{model.things.filter((t) => view.data!.some((d) => d.id === t.id)).map((t) => <DataCard key={t.id} t={t} />)}</div>}
            {view.unknowns!.length > 0 && <ul className="rounded-2xl border border-dashed border-white/25 p-4 text-sm text-haze-300">{view.unknowns!.map((u, i) => <li key={i}>Not read yet, line {u.line}: {u.why}</li>)}</ul>}
            <p className="text-sm text-haze-400">Choose anything it can do to see its Flow.</p>
          </div>
        )}

        {(level === "big-picture" || level === "flow" || level === "details") && !view.needsFocus && view.scope === "member" && member && (
          <article aria-labelledby="lv-title" className="rounded-3xl border border-white/12 bg-ink-900/40 p-6">
            <header className="flex flex-wrap items-center gap-4">
              <Symbol id={view.symbol as SymbolId} size={40} label={THUNDER_VISUAL.symbols[view.symbol as SymbolId]?.name} />
              <div><p className="text-xs text-haze-400">{thing ? `${thing.label} ${member.kind === "rule" ? "has a rule" : "can"}` : member.kind === "action" ? "An action" : "In this file"}</p>
                <h3 id="lv-title" className="text-2xl font-bold text-white">{view.title}</h3></div>
              {member.route && <span className="rounded-lg border border-[#FCD34D]/40 px-2 py-1 font-mono text-sm text-[#FCD34D]">{member.route}</span>}
              <span className="ml-auto flex items-center gap-2"><Chip>From code</Chip><span className="font-mono text-xs text-haze-400">lines {member.lines[0]}–{member.lines[1]}</span></span>
            </header>
            {member.doc && <p className="mt-3 text-[17px] text-haze-100"><span className="mr-2"><Chip>Author&apos;s note</Chip></span>{member.doc}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              {member.youGive.length > 0 && <div className="rounded-xl bg-white/[0.04] px-4 py-2.5"><span className="mr-2 text-xs font-semibold uppercase tracking-wider text-haze-400">You give it</span><span className="text-[#FCD34D]">{member.youGive.join(", ")}</span></div>}
              {member.youGetBack && <div className="rounded-xl bg-white/[0.04] px-4 py-2.5"><span className="mr-2 text-xs font-semibold uppercase tracking-wider text-haze-400">You get back</span><span className="text-[#67E8F9]">{member.youGetBack}</span></div>}
            </div>

            {level === "big-picture" && (
              <div className="mt-5 space-y-2 text-sm text-haze-200">
                <p>{view.uses!.length ? <>It uses {view.uses!.map((u, i) => <span key={u.id}>{i ? ", " : ""}<button type="button" onClick={() => open(u.id)} className={`rounded text-[#A9C9FF] hover:underline ${focus}`}>{u.label}</button></span>)}.</> : "It doesn't use anything else in this file."}</p>
                <p>{view.usedBy!.length ? <>It is used by {view.usedBy!.map((u, i) => <span key={u.id}>{i ? ", " : ""}<button type="button" onClick={() => open(u.id)} className={`rounded text-[#A9C9FF] hover:underline ${focus}`}>{u.label}</button></span>)}.</> : "Nothing else in this file uses it."}</p>
                <button type="button" onClick={() => setLevel("flow")} className={`mt-2 min-h-11 rounded-xl border border-white/20 px-4 text-haze-100 hover:text-white ${focus}`}>See how it goes: Flow →</button>
              </div>
            )}

            {!overlay && runHidden && (level === "flow" || level === "details") && <p className="mt-5 text-sm text-haze-400">{runHidden}</p>}
            {overlay && (level === "flow" || level === "details") && <RunPanel run={run!} on={showRun} setOn={setShowRun} memberRun={overlay.members[member.id]} label={view.title} crash={crash?.member?.id === member.id ? crash : null} />}

            {level === "flow" && <div className="mt-6"><FlowBlocks blocks={member.flow.blocks} flow={member.flow} onOpen={open} onLine={showLine} model={model} runs={showRun ? overlay?.members[member.id]?.nodes : undefined} calls={overlay?.members[member.id]?.calls} /></div>}
            {level === "flow" && showRun && (() => { const done = member.flow.nodes.find((n) => n.kind === "end" && n.line == null); const w = done ? runWords(overlay?.members[member.id]?.nodes[done.id], overlay?.members[member.id]?.calls) : null; return w ? <p className="mt-3 text-sm text-haze-200"><span className="font-semibold text-[#67E8F9]">Done</span> (it finished after its last step): {w}</p> : null; })()}

            {level === "details" && <DetailsSheet view={view} member={member} thingLabel={thing?.label} file={file} open={open} showLine={showLine} memberRun={showRun ? overlay?.members[member.id] : undefined} />}
          </article>
        )}

        {level === "text" && <ColoredText text={view.text ?? ""} />}

        {level === "original" && (
          <figure>
            <figcaption className="mb-2 flex flex-wrap items-center gap-3 text-sm text-haze-300">{file}{focusLines && <span className="text-haze-400">· lines {focusLines[0]}–{focusLines[1]} highlighted</span>}</figcaption>
            <pre className="max-h-[640px] overflow-auto rounded-2xl border border-white/10 bg-black/40 py-3 font-mono text-[13px] leading-relaxed text-haze-200">
              {lines.map((l, i) => {
                const on = focusLines && i + 1 >= focusLines[0] && i + 1 <= focusLines[1];
                // Highlighted lines get a tint and a bar at the edge, so they stand out without relying on color.
                return <div key={i} className={`flex gap-4 border-l-2 pl-[14px] pr-4 ${on ? "border-gold-300 bg-gold-400/[0.12]" : "border-transparent"}`}><span className={`w-8 shrink-0 select-none text-right ${on ? "text-haze-200" : "text-haze-400"}`}>{i + 1}</span><code>{l.length ? l.map((t, k) => <span key={k} className={t.cls}>{t.text}</span>) : " "}</code></div>;
              })}
            </pre>
            {editable && onSourceChange && (
              <details className="mt-3"><summary className="cursor-pointer text-sm text-haze-300">Edit the code</summary>
                <textarea aria-label="Code" value={source} onChange={(e) => { onSourceChange(e.target.value); setFocusId(null); }} spellCheck={false} rows={16} className={`mt-2 w-full rounded-xl border border-white/15 bg-ink-950 p-3 font-mono text-[13px] text-haze-100 ${focus}`} />
              </details>
            )}
          </figure>
        )}
      </div>
    </div>
  );
}
