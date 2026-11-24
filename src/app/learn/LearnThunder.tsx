"use client";
// Learn Thunder (the Thunder V1 tutorial). Everything shown was produced at build time by the Thunder compiler; this
// component only lays it out: the idea, a picture to hold in mind, the code, Thunder, Thunder Text, and questions you
// answer before revealing ours.
import { useState } from "react";
import { HighlightedCode } from "@/lib/highlight";
import Link from "next/link";
import { StepsView, type Step } from "@/app/try/StepsView";
import { PlainRuleCard } from "@/app/try/PlainRuleCard";
import { Symbol, ThingCard, DataCard, FlowBlocks } from "@/components/thunder/ThunderParts";
import { THUNDER_VISUAL } from "../../../compiler/src/visual.mjs";
import type { ThunderModel } from "../../../compiler/src/model.d.mts";

type SymbolId = keyof typeof THUNDER_VISUAL.symbols;

/** Lesson: the six shapes a beginner learns first, then the rest, drawn from the grammar's own symbols. */
function Shapes() {
  const all = Object.entries(THUNDER_VISUAL.symbols) as [SymbolId, (typeof THUNDER_VISUAL.symbols)[SymbolId]][];
  const first = THUNDER_VISUAL.beginner as SymbolId[];
  return (
    <div className="space-y-6">
      <ul aria-label="The six shapes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {first.map((id) => { const s = THUNDER_VISUAL.symbols[id]; return (
          <li key={id} className="flex items-start gap-4 rounded-2xl border border-white/12 bg-ink-850/40 p-5">
            <Symbol id={id} size={48} label={s.name} />
            <div><p className="text-lg font-semibold text-white">{s.name}</p><p className="mt-1 text-sm leading-relaxed text-haze-300">{s.says}</p></div>
          </li>); })}
      </ul>
      <div>
        <p className="text-sm text-haze-400">More shapes you&apos;ll meet later:</p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {all.filter(([id]) => !first.includes(id)).map(([id, s]) => <li key={id} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-haze-200"><Symbol id={id} size={22} />{s.name}</li>)}
        </ul>
      </div>
    </div>
  );
}

/** Lesson: how to use Thunder on your own code. */
function HowTo() {
  const ways = [
    { title: "Semantic Zoom", where: "In your browser", what: "Paste code and read it at three depths: big picture, flow, details.", href: "/zoom", cta: "Open Semantic Zoom" },
    { title: "Thunder Code", where: "In your browser", what: "Paste a file in any of ten languages and read every function in Thunder.", href: "/read", cta: "Open Thunder Code" },
    { title: "OpenThunder", where: "A whole app", what: "Open a repository and read it in Thunder, from the app down to one rule, then change it safely.", href: "https://openthunder.dev", cta: "Open OpenThunder ↗" },
  ];
  const commands = [
    ["npm install -g @skillstech/thunderlang", "Install the Thunder compiler (once)."],
    ["thunder read checkout.py", "Read one file in Thunder."],
    ["thunder thunderize ./my-app --out ./my-app-thunder", "Write a whole app in Thunder Text, one file per file, plus APP.thunder-text."],
    ["thunder same ./old ./new", "Check that converted or refactored code still means the same."],
  ];
  return (
    <div className="space-y-6">
      <ul className="grid gap-4 lg:grid-cols-3">
        {ways.map((w) => (
          <li key={w.title} className="flex flex-col rounded-2xl border border-white/12 bg-ink-850/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">{w.where}</p>
            <p className="mt-1 text-lg font-semibold text-white">{w.title}</p>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-haze-300">{w.what}</p>
            {w.href.startsWith("http") ? <a href={w.href} className="mt-4 text-sm font-medium text-gold-200 hover:text-gold-100">{w.cta}</a> : <Link href={w.href} className="mt-4 text-sm font-medium text-gold-200 hover:text-gold-100">{w.cta} →</Link>}
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-white/12 p-5">
        <p className="text-sm font-semibold text-white">In your terminal</p>
        <ul className="mt-3 space-y-3">{commands.map(([c, d]) => <li key={c}><code className="block overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-[13px] text-haze-100">{c}</code><p className="mt-1 text-sm text-haze-300">{d}</p></li>)}</ul>
        <p className="mt-4 text-sm text-haze-400">In VS Code, install the ThunderLang extension (openthunder.thunderlang) for colors, errors, and hover help in Thunder files.</p>
      </div>
      <div className="rounded-2xl border border-dashed border-white/20 p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">Study your own app on your phone <Chip dashed>Coming soon</Chip></p>
        <p className="mt-2 text-sm leading-relaxed text-haze-300">
          OpenThunder will turn your own app into lessons and questions you can study on your phone in Skills Tech Talk.
          Questions written by AI will be labeled as AI and checked against your code.
        </p>
      </div>
      <OpenThunderInvite />
    </div>
  );
}

type Visual = { element: string; line: "solid" | "dashed"; title: string; badge?: { text: string } };
type View = { label: string; code: string; visual: Visual; steps: Step[]; doc: string | null; text: string; cardSource: string | null };
export type BuiltLesson = {
  slug: string; title: string; idea: string; picture: string;
  show: "steps" | "card" | "compare" | "text" | "honest" | "shapes" | "thing" | "flow" | "howto" | "openthunder";
  questions: { q: string; a: string }[];
  /** Quick-check questions; every answer was worked out by the Thunder compiler (@skillstech/thunderlang/learn). */
  quiz: { prompt: string; choices: string[]; answer: string; explain: string }[];
  /** The whole-app lesson: one small app, read at every zoom level. */
  app?: { name: string; file: string; code: string; actions: { route: string; label: string; doc: string | null; steps: Step[] }[]; rule: { label: string; doc: string | null; text: string } };
  views: View[];
  /** Model-drawn lessons (a Thing, or one member's flow). */
  model?: ThunderModel; focusId?: string; text?: string; code?: string; codeLabel?: string;
};

const STEP_LEGEND: [string, string, string][] = [
  ["◇", "If: a choice", "text-[#7FB2FF] border-[#7FB2FF]/40"],
  ["↻", "For each: repeat", "text-[#C4B5FD] border-[#C4B5FD]/40"],
  ["=", "Works out a value", "text-[#FCD34D] border-[#FCD34D]/40"],
  ["→", "Calls something", "text-[#67E8F9] border-[#67E8F9]/40"],
  ["⇥", "Gives back", "text-[#67E8F9] border-[#67E8F9]/40"],
  ["✕", "Fails", "text-[#FDBA74] border-[#FDBA74]/40"],
  ["·", "Not read yet: shows the code", "text-haze-400 border-dashed border-white/25"],
];

const btn = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-haze-100 hover:border-white/30 hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300";

function Chip({ children, dashed = false }: { children: React.ReactNode; dashed?: boolean }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] text-haze-300 ${dashed ? "border-dashed border-white/30" : "border-white/20"}`}>{children}</span>;
}

function Code({ code, label }: { code: string; label: string }) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-haze-300">The code ({label})</figcaption>
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-haze-200"><code><HighlightedCode source={code} lang={label} /></code></pre>
    </figure>
  );
}

function Picture({ view, lessonSlug }: { view: View; lessonSlug: string }) {
  if (view.cardSource) {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-haze-300">Thunder <Chip>From code</Chip>{view.doc && <Chip>Author&apos;s note</Chip>}</div>
        <PlainRuleCard key={lessonSlug} ask="What happens to this order?" initialSource={view.cardSource} breadcrumb={["Pizza app", "Delivery"]} />
        <p className="mt-2 text-xs text-haze-400">The rule was read from the code. The examples were added by a person to check it; code has no examples.</p>
      </div>
    );
  }
  const dashed = view.visual.line === "dashed";
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-haze-300">
        Thunder {dashed ? <Chip dashed>Not read yet</Chip> : <Chip>From code</Chip>}{view.doc && <Chip>Author&apos;s note</Chip>}
      </div>
      <div className={`rounded-2xl border p-5 ${dashed ? "border-dashed border-white/25" : "border-white/10 bg-ink-850/40"}`}>
        {view.visual.badge && <p className="text-xs font-semibold uppercase tracking-wider text-[#FCD34D]">{view.visual.badge.text}</p>}
        <p className="mt-1 text-base font-semibold text-white">{view.visual.title}</p>
        {view.doc && <p className="mt-2 text-sm text-haze-300"><span className="text-haze-400">Author&apos;s note:</span> “{view.doc}”</p>}
        <div className="mt-4"><StepsView steps={view.steps} /></div>
      </div>
    </div>
  );
}

function ThunderText({ text }: { text: string }) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium text-haze-300">Thunder Text: the same meaning, in words</figcaption>
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{text}</code></pre>
    </figure>
  );
}

function Questions({ questions, slug }: { questions: BuiltLesson["questions"]; slug: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <section aria-labelledby={`${slug}-check`} className="rounded-2xl border border-white/10 p-5">
      <h3 id={`${slug}-check`} className="text-sm font-semibold uppercase tracking-wider text-gold-300">Think about it</h3>
      <p className="mt-1 text-sm text-haze-400">Answer in your head first, then compare with ours.</p>
      <ol className="mt-4 space-y-4">
        {questions.map((q, i) => {
          const key = `${slug}-${i}`;
          return (
            <li key={key}>
              <p className="text-haze-100">{i + 1}. {q.q}</p>
              <button type="button" className={`${btn} mt-2`} aria-expanded={!!open[key]} aria-controls={`${key}-a`} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
                {open[key] ? "Hide the answer" : "Show the answer"}
              </button>
              {open[key] && <p id={`${key}-a`} className="mt-2 rounded-lg bg-white/[0.04] p-3 text-sm leading-relaxed text-haze-200">{q.a}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}


const OPENTHUNDER_DOWNLOAD = "https://openthunder.dev/#download";

/** The invitation to read a whole app in OpenThunder (its own site's words: free, runs on your machine). */
function OpenThunderInvite() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold-300/30 bg-gold-400/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-lg font-semibold text-white">Read your app in OpenThunder</p>
        <p className="mt-1 text-sm text-haze-300">OpenThunder is the IDE for Thunder. Free. Runs on your machine.</p>
      </div>
      <a href={OPENTHUNDER_DOWNLOAD} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold-300 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300">
        Download OpenThunder ↗
      </a>
    </div>
  );
}

const ZOOM = ["App", "File", "Action", "Rule"] as const;
const CHIPS: [string, string, boolean][] = [
  ["From code", "Read exactly from the code by the Thunder compiler. This is the evidence.", false],
  ["Author's note", "The programmer's own comment. Useful, but it can be out of date; the code is what runs.", false],
  ["AI summary", "An AI's explanation, to help you understand. Always labeled and dashed, never the evidence.", true],
  ["Not read yet", "Thunder can't explain this part yet, so it shows the code itself.", true],
];

/** Lesson: one small app, read the way OpenThunder shows a whole repository, from the App down to one Rule. */
function WholeApp({ app }: { app: NonNullable<BuiltLesson["app"]> }) {
  const [level, setLevel] = useState(0);
  const [original, setOriginal] = useState(false);
  const action = app.actions[0];
  return (
    <div className="space-y-6">
      <div role="group" aria-label="Where you are in the app" className="flex flex-wrap items-center gap-2">
        {ZOOM.map((z, i) => (
          <span key={z} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="text-haze-500">→</span>}
            <button type="button" aria-pressed={i === level} onClick={() => setLevel(i)} className={`${btn} min-h-11 ${i === level ? "border-gold-300 bg-gold-400/[0.14] font-semibold text-white" : ""}`}>{z}</button>
          </span>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-5" aria-live="polite">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-haze-300">{ZOOM[level]} <Chip>From code</Chip></div>
        {level === 0 && (
          <div>
            <p className="flex items-center gap-2 text-xl font-bold text-white"><Symbol id="app" size={28} />{app.name}</p>
            <p className="mt-2 text-sm text-haze-300">1 file · {app.actions.length} doors people can use · 1 rule</p>
            <ul className="mt-4 space-y-2 text-sm text-haze-200">
              {app.actions.map((a) => <li key={a.route} className="flex items-center gap-2"><Symbol id="action" size={20} /><span className="font-mono text-[#67E8F9]">{a.route}</span> {a.label}</li>)}
              <li className="flex items-center gap-2"><Symbol id="rule" size={20} />{app.rule.label}</li>
            </ul>
          </div>
        )}
        {level === 1 && (
          <div>
            <p className="flex items-center gap-2 text-xl font-bold text-white"><Symbol id="file" size={28} />{app.file}</p>
            <p className="mt-2 text-sm text-haze-300">What this file holds, in the order it is written:</p>
            <ul className="mt-3 space-y-2 text-sm text-haze-200">
              <li className="flex items-center gap-2"><Symbol id="rule" size={20} />Rule: {app.rule.label}{app.rule.doc && <span className="text-haze-400"> · “{app.rule.doc}”</span>}</li>
              {app.actions.map((a) => <li key={a.route} className="flex items-center gap-2"><Symbol id="action" size={20} />Action: {a.label}{a.doc && <span className="text-haze-400"> · “{a.doc}”</span>}</li>)}
            </ul>
          </div>
        )}
        {level === 2 && (
          <div>
            <p className="font-mono text-sm text-[#67E8F9]">{action.route}</p>
            <p className="text-xl font-bold text-white">{action.label}</p>
            {action.doc && <p className="mt-2 text-sm text-haze-300"><span className="text-haze-400">Author&apos;s note:</span> “{action.doc}”</p>}
            <div className="mt-4"><StepsView steps={action.steps} /></div>
          </div>
        )}
        {level === 3 && (
          <div>
            <p className="flex items-center gap-2 text-xl font-bold text-white"><Symbol id="rule" size={28} />{app.rule.label}</p>
            {app.rule.doc && <p className="mt-2 text-sm text-haze-300"><span className="text-haze-400">Author&apos;s note:</span> “{app.rule.doc}”</p>}
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{app.rule.text}</code></pre>
          </div>
        )}
      </div>
      <div>
        <button type="button" className={`${btn} min-h-11`} aria-expanded={original} aria-controls="whole-app-code" onClick={() => setOriginal((o) => !o)}>
          {original ? "Hide the original code" : "Show the original code"}
        </button>
        {original && <div id="whole-app-code" className="mt-3"><Code code={app.code} label={`Python, ${app.file}`} /></div>}
      </div>
      <div className="rounded-2xl border border-white/10 p-5">
        <p className="text-sm font-semibold text-white">The labels on every card say where it came from</p>
        <ul className="mt-3 space-y-2">
          {CHIPS.map(([name, says, dashed]) => <li key={name} className="flex flex-wrap items-baseline gap-2 text-sm text-haze-300"><Chip dashed={dashed}>{name}</Chip>{says}</li>)}
        </ul>
      </div>
      <OpenThunderInvite />
    </div>
  );
}

/** Quick check: pick an answer, then check it. The answers come from the compiler, not from us. */
function Quiz({ quiz, slug }: { quiz: BuiltLesson["quiz"]; slug: string }) {
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  if (!quiz.length) return null;
  return (
    <section aria-labelledby={`${slug}-quiz`} className="rounded-2xl border border-white/10 p-5">
      <h3 id={`${slug}-quiz`} className="text-sm font-semibold uppercase tracking-wider text-gold-300">Quick check</h3>
      <p className="mt-1 text-sm text-haze-400">Pick an answer, then check it. The Thunder compiler worked out every answer from this lesson&apos;s code.</p>
      <ol className="mt-4 space-y-6">
        {quiz.map((q, i) => {
          const pick = chosen[i];
          const done = !!checked[i];
          const right = done && pick === q.answer;
          return (
            <li key={`${slug}-${i}`}>
              <fieldset disabled={done}>
                <legend className="text-haze-100">{i + 1}. {q.prompt}</legend>
                <div className="mt-3 space-y-2">
                  {q.choices.map((c) => {
                    const mine = pick === c;
                    const tag = done && mine ? (right ? "✓ Correct · Your answer" : "✕ Incorrect · Your answer") : done && c === q.answer ? "✓ Correct answer" : null;
                    return (
                      <label key={c} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${mine ? "border-gold-300/60 bg-gold-400/[0.05] text-white" : "border-white/12 text-haze-200"} ${done ? "cursor-default" : "hover:border-white/30"}`}>
                        <input type="radio" name={`${slug}-q${i}`} value={c} checked={mine} onChange={() => setChosen((x) => ({ ...x, [i]: c }))} className="accent-[#FCD34D]" />
                        <span className="flex-1">{c}</span>
                        {tag && <span className={`text-xs font-semibold ${tag.startsWith("✓") ? "text-[#86EFAC]" : "text-[#FCA5A5]"}`}>{tag}</span>}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {!done ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className={`${btn} min-h-11`} disabled={!pick} onClick={() => setChecked((x) => ({ ...x, [i]: true }))}>Check my answer</button>
                  {!pick && <span className="text-xs text-haze-400">Choose an answer first.</span>}
                </div>
              ) : (
                <div role="status" className={`mt-3 rounded-lg border p-3 text-sm leading-relaxed ${right ? "border-[#86EFAC]/30 bg-[#86EFAC]/[0.05]" : "border-[#FCA5A5]/30 bg-[#FCA5A5]/[0.05]"}`}>
                  <p className="font-semibold text-white">{right ? "✓ Correct." : `✕ Incorrect. The answer is: ${q.answer}`}</p>
                  <p className="mt-1 text-haze-200">{q.explain}</p>
                  <button type="button" className={`${btn} mt-3 min-h-11`} onClick={() => { setChecked((x) => ({ ...x, [i]: false })); setChosen((x) => ({ ...x, [i]: "" })); }}>Try again</button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function LearnThunder({ lessons }: { lessons: BuiltLesson[] }) {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState(0);
  const lesson = lessons[index];
  const view = lesson.views.length ? lesson.views[Math.min(tab, lesson.views.length - 1)] : null;
  const go = (next: number) => { setIndex(next); setTab(0); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
      <nav aria-label="Lessons" className="lg:sticky lg:top-24 lg:self-start">
        <ol className="space-y-1">
          {lessons.map((l, i) => (
            <li key={l.slug}>
              <button type="button" onClick={() => go(i)} aria-current={i === index ? "step" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300 ${i === index ? "bg-gold-400/[0.08] font-semibold text-white" : "text-haze-300 hover:text-white"}`}>
                <span className="mr-2 text-haze-400">{i + 1}</span>{l.title}
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-4 px-3 text-xs text-haze-400">Next: <Link href="/learn/write-rules" className="text-gold-300 hover:text-gold-200">write and change rules</Link>.</p>
      </nav>

      <article aria-labelledby="lesson-title" className="min-w-0 space-y-8">
        <header>
          <p className="text-sm text-haze-400">Lesson {index + 1} of {lessons.length}</p>
          <h2 id="lesson-title" className="mt-1 text-3xl font-semibold tracking-tight text-white">{lesson.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-haze-200">{lesson.idea}</p>
          <p className="mt-4 rounded-xl border border-gold-300/25 bg-gold-400/[0.05] p-4 text-haze-200"><span className="font-semibold text-gold-200">Picture it: </span>{lesson.picture}</p>
        </header>

        {lesson.show === "steps" && lesson.slug === "steps" && (
          <ul aria-label="Step marks" className="flex flex-wrap gap-2">
            {STEP_LEGEND.map(([mark, label, cls]) => (
              <li key={label} className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-sm text-haze-200">
                <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-md border text-[11px] font-semibold ${cls}`}>{mark}</span>{label}
              </li>
            ))}
          </ul>
        )}

        {lesson.views.length > 1 && (
          <div role="group" aria-label="Show the code in" className="flex flex-wrap gap-2">
            {lesson.views.map((v, i) => (
              <button key={v.label} type="button" aria-pressed={i === tab} onClick={() => setTab(i)}
                className={`${btn} ${i === tab ? "border-gold-300/60 text-white" : ""}`}>{v.label}</button>
            ))}
          </div>
        )}

        {lesson.show === "shapes" && <Shapes />}
        {lesson.show === "howto" && <HowTo />}
        {lesson.show === "openthunder" && lesson.app && <WholeApp key={lesson.slug} app={lesson.app} />}
        {(lesson.show === "thing" || lesson.show === "flow") && lesson.model && lesson.focusId && (() => {
          const model = lesson.model!;
          const member = model.members.find((m) => m.id === lesson.focusId);
          const thing = model.things.find((t) => t.id === lesson.focusId);
          return (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <Code code={lesson.code ?? ""} label={lesson.codeLabel ?? ""} />
                <div className="space-y-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-haze-300">Thunder <Chip>From code</Chip></div>
                  {thing && <ThingCard t={thing} model={model} />}
                  {thing && <div className="grid gap-3 sm:grid-cols-2">{model.things.filter((t) => t.kind !== "thing").map((t) => <DataCard key={t.id} t={t} />)}</div>}
                  {member && (
                    <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-5">
                      <p className="text-xs text-haze-400">{model.things.find((t) => t.id === member.owner)?.label ?? ""} can</p>
                      <p className="text-xl font-bold text-white">{member.label}</p>
                      {member.doc && <p className="mt-2 text-sm text-haze-300"><span className="text-haze-400">Author&apos;s note:</span> “{member.doc}”</p>}
                      {member.youGive.length > 0 && <p className="mt-2 text-sm"><span className="mr-2 text-xs font-semibold uppercase tracking-wider text-haze-400">You give it</span><span className="text-[#FCD34D]">{member.youGive.join(", ")}</span></p>}
                      <div className="mt-4"><FlowBlocks blocks={member.flow.blocks} flow={member.flow} onOpen={() => {}} onLine={() => {}} model={model} /></div>
                    </div>
                  )}
                </div>
              </div>
              <ThunderText text={lesson.text ?? ""} />
            </>
          );
        })()}

        {view && <div className="grid gap-6 xl:grid-cols-2">
          <Code code={view.code} label={view.label} />
          {lesson.show === "text"
            ? <ThunderText text={view.text} />
            : <Picture view={view} lessonSlug={`${lesson.slug}-${tab}`} />}
        </div>}

        {lesson.show === "compare" && (
          <p className="rounded-xl border border-white/10 p-4 text-sm text-haze-200">
            Switch languages above: the code changes, and the Thunder stays exactly the same. This page checks that when it
            is built; if the four ever disagreed, the page would not be published.
          </p>
        )}
        {lesson.show === "text" && view && <Picture view={view} lessonSlug={`${lesson.slug}-picture`} />}
        {(lesson.show === "steps" || lesson.show === "honest") && view && <ThunderText text={view.text} />}

        <Quiz key={lesson.slug} quiz={lesson.quiz} slug={lesson.slug} />
        <Questions questions={lesson.questions} slug={lesson.slug} />

        <div className="flex justify-between gap-3 border-t border-white/8 pt-6">
          <button type="button" className={btn} onClick={() => go(index - 1)} disabled={index === 0}>← Previous lesson</button>
          {index < lessons.length - 1
            ? <button type="button" className={btn} onClick={() => go(index + 1)}>Next: {lessons[index + 1].title} →</button>
            : <Link href="/learn/write-rules" className={btn}>Part 2: write and change rules →</Link>}
        </div>
      </article>
    </div>
  );
}
