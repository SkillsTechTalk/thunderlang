// Review in Thunder, shown on a small sample: every sentence here is computed by the compiler (thunderReview) from the
// code before and after the change, at build time. Nothing is written by hand; nothing runs in the browser.
import { thunderReview } from "../../../compiler/src/review.mjs";
import type { ReviewItem } from "../../../compiler/src/review.d.mts";

type File = { path: string; source: string };

const SEVERITY: Record<ReviewItem["severity"], { label: string; mark: string; className: string }> = {
  risk: { label: "Needs a careful look", mark: "!", className: "border-[#FCA5A5]/40 text-[#FCA5A5]" },
  meaning: { label: "Change in meaning", mark: "≠", className: "border-[#FCD34D]/40 text-[#FCD34D]" },
  form: { label: "Only the form changed", mark: "=", className: "border-white/20 text-haze-300" },
};

function Evidence({ item }: { item: ReviewItem }) {
  const ev = item.evidence;
  if (!ev || (!ev.before?.length && !ev.after?.length && !ev.counterexample)) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-haze-400 hover:text-haze-200">Before and after</summary>
      {ev.counterexample && (
        <p className="mt-2 text-haze-300">
          Run on both versions: when {ev.counterexample.facts}, before it gave <strong className="text-white">{ev.counterexample.before}</strong>, now <strong className="text-white">{ev.counterexample.after}</strong>.
        </p>
      )}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {(["before", "after"] as const).map((side) => (
          <div key={side}>
            <p className="text-xs font-semibold uppercase tracking-wider text-haze-400">{side === "before" ? "Before" : "After"}</p>
            <pre className="mt-1 overflow-x-auto rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-xs text-haze-200">{ev[side]?.length ? ev[side]!.join("\n") : "(nothing)"}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}

export function ThunderReviewSample({ before, after }: { before: File[]; after: File[] }) {
  const review = thunderReview(before, after);
  return (
    <div className="space-y-5">
      <p className="text-lg text-haze-200">
        <span className="font-semibold text-white">{review.says}</span>{" "}
        <span className="text-haze-400">({review.summary.files} files changed)</span>
      </p>
      <ul className="space-y-3">
        {review.items.map((item, i) => {
          const s = SEVERITY[item.severity];
          return (
            <li key={i} className="rounded-2xl border border-white/10 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${s.className}`}>
                  <span aria-hidden="true">{s.mark} </span>{s.label}
                </span>
                <span className="font-semibold text-white">{item.subject}</span>
                <span className="font-mono text-haze-400">{item.where.file}:{item.where.line}</span>
              </div>
              <p className="mt-2 text-[15px] text-white">{item.says}</p>
              <Evidence item={item} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
