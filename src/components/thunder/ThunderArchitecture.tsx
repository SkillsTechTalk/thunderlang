import { StatusBadge } from "@/components/StatusBadge";
import { TARGETS, type Target } from "@/lib/positioning";

// The architecture picture as real HTML (not an image): people and AI write Thunder, the Thunder compiler checks it,
// and it compiles to the ecosystem you choose. Every target shows what works for it today, from the compiler's data.

function Arrow() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center text-gold-300/80">
      <span className="text-2xl md:hidden">↓</span>
      <span className="hidden text-2xl md:inline">→</span>
    </div>
  );
}

function Layer({ title, parts, note }: { title: string; parts: string[]; note: string }) {
  return (
    <div className="flex h-full flex-col justify-center rounded-2xl border border-white/12 bg-ink-850/60 p-5 text-center">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-gold-200">{parts.join(" · ")}</p>
      <p className="mt-3 text-xs leading-relaxed text-haze-400">{note}</p>
    </div>
  );
}

function Works({ label, yes, otherwise = "Not yet" }: { label: string; yes: boolean; otherwise?: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-haze-300">{label}</span>
      {yes ? <StatusBadge status="available" /> : <span className="text-[11px] text-haze-400">{otherwise}</span>}
    </li>
  );
}

function TargetCard({ t }: { t: Target }) {
  return (
    <li className="rounded-xl border border-white/10 bg-ink-900/70 p-4">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-white">{t.name}</span>
        <span className="text-xs text-haze-400">{t.role}</span>
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        <Works label="Read in Thunder" yes={t.reads} />
        <Works label="Compile rules" yes={t.rules} />
        <Works label="Change code" yes={t.edits} otherwise="Via an AI agent" />
        <li className="flex items-center justify-between gap-2">
          <span className="text-haze-300">Whole programs</span>
          <StatusBadge status={t.program} />
        </li>
      </ul>
    </li>
  );
}

export function ThunderArchitecture() {
  return (
    <figure aria-labelledby="architecture-caption" className="mt-10">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Layer title="Human + AI" parts={["Think", "Describe", "Design", "Build"]} note="People decide what the software should do. AI helps write it." />
        <Arrow />
        <Layer title="Thunder" parts={["Text", "Visual", "Intent", "Behavior"]} note="One meaning, read as words or as pictures." />
        <Arrow />
        <Layer title="Thunder compiler" parts={["Semantic IR", "Types", "Verification"]} note="Open source and deterministic: no AI, no key." />
      </div>
      <p aria-hidden="true" className="my-3 text-center text-2xl text-gold-300/80">↓</p>
      <div className="rounded-2xl border border-gold-300/30 bg-gradient-to-b from-gold-400/[0.05] to-transparent p-4">
        <p className="px-1 pb-3 text-center text-sm font-semibold text-white">Compiled to the ecosystem you choose</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TARGETS.map((t) => <TargetCard key={t.key} t={t} />)}
        </ul>
      </div>
      <figcaption id="architecture-caption" className="mt-4 text-sm text-haze-400">
        How Thunder fits together. Each target shows what works today: reading its code in Thunder, compiling Thunder
        rules to it, changing its code from Thunder (the compiler writes the patch where it says Available; elsewhere an AI
        agent writes it, labeled AI-written and checked the same way), and compiling whole Thunder programs to it.
      </figcaption>
    </figure>
  );
}
