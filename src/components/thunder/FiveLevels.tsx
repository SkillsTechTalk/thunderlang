// "One program, five ways to read it": the five reading levels, shown on a real example. The level names, the
// question each answers, and what each shows come from the compiler (LEVELS), so this matches OpenThunder.
import Link from "next/link";
import { Section, SectionHeading } from "@/components/ui";
import { LEVELS } from "../../../compiler/src/visual.mjs";
import { ZOOM_SAMPLES } from "@/app/zoom/samples";
import { ReadingLevels } from "./ReadingLevels";

export function FiveLevels({ id = "levels", eyebrow = "How you read Thunder", className = "border-t border-white/8" }: { id?: string; eyebrow?: string; className?: string }) {
  const sample = ZOOM_SAMPLES[0];
  return (
    <Section id={id} className={className}>
      <SectionHeading
        eyebrow={eyebrow}
        title="One program. Five ways to read it."
        intro="Every program in Thunder reads at the same five levels, from what it means down to the code that proves it. Start with the big picture and go only as deep as you need. The same five levels work in any language Thunder reads, on this site and in OpenThunder."
      />
      <ol aria-label="The five reading levels" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {LEVELS.map((l, i) => (
          <li key={l.id} className={`rounded-2xl border p-4 ${l.form === "evidence" ? "border-dashed border-white/25" : "border-white/12 bg-ink-850/40"}`}>
            <p className="text-xs text-haze-400">{i + 1} · {l.form === "picture" ? "Picture" : l.form === "words" ? "Words" : "Evidence"}</p>
            <p className="mt-1 text-lg font-semibold text-white">{l.name}</p>
            <p className="mt-1 text-sm text-haze-200">{l.question}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10 rounded-3xl border border-white/10 p-4 sm:p-6">
        <p className="mb-4 text-sm text-haze-400">Try it on a school library, read from real Python by the Thunder compiler, with no AI:</p>
        <ReadingLevels source={sample.code} file={sample.file} initialFocus="borrow" />
      </div>
      <p className="mt-6 text-sm text-haze-300">
        <Link href="/zoom" className="font-medium text-gold-300 hover:text-gold-200">Try the five levels on other examples, or on your own code →</Link>
      </p>
    </Section>
  );
}
