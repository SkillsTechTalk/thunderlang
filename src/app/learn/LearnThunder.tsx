"use client";
// Learn Thunder (the Thunder V1 tutorial). Everything shown was produced at build time by the Thunder compiler; this
// component only lays it out: the idea, a picture to hold in mind, the code, Thunder, Thunder Text, and questions you
// answer before revealing ours.
import { useState } from "react";
import Link from "next/link";
import { StepsView, type Step } from "@/app/try/StepsView";
import { PlainRuleCard } from "@/app/try/PlainRuleCard";

type Visual = { element: string; line: "solid" | "dashed"; title: string; badge?: { text: string } };
type View = { label: string; code: string; visual: Visual; steps: Step[]; doc: string | null; text: string; cardSource: string | null };
export type BuiltLesson = {
  slug: string; title: string; idea: string; picture: string;
  show: "steps" | "card" | "compare" | "text" | "honest";
  questions: { q: string; a: string }[];
  views: View[];
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
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{code}</code></pre>
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
      <h3 id={`${slug}-check`} className="text-sm font-semibold uppercase tracking-wider text-gold-300">Check your picture</h3>
      <p className="mt-1 text-sm text-haze-400">Answer in your head first, then compare.</p>
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

export function LearnThunder({ lessons }: { lessons: BuiltLesson[] }) {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState(0);
  const lesson = lessons[index];
  const view = lesson.views[Math.min(tab, lesson.views.length - 1)];
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

        <div className="grid gap-6 xl:grid-cols-2">
          <Code code={view.code} label={view.label} />
          {lesson.show === "text"
            ? <ThunderText text={view.text} />
            : <Picture view={view} lessonSlug={`${lesson.slug}-${tab}`} />}
        </div>

        {lesson.show === "compare" && (
          <p className="rounded-xl border border-white/10 p-4 text-sm text-haze-200">
            Switch languages above: the code changes, and the Thunder stays exactly the same. This page checks that when it
            is built; if the four ever disagreed, the page would not be published.
          </p>
        )}
        {lesson.show === "text" && <Picture view={view} lessonSlug={`${lesson.slug}-picture`} />}
        {(lesson.show === "steps" || lesson.show === "honest") && <ThunderText text={view.text} />}

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
