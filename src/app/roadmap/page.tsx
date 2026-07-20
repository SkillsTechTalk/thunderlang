import { PageHero, Section, DraftNote } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Roadmap",
  description:
    "Where ThunderLang is headed: the compiler, CLI, playground, and code generation that ship today, and the verification, targets, AI assist, and ecosystem still ahead.",
  path: "/roadmap",
});

type Phase = {
  phase: string;
  status: "Now" | "Next" | "Later" | "Exploring";
  items: string[];
};

// Kept consistent with the capability manifest (src/lib/capabilities.ts): anything
// "available" there is shipped here (status "Now"); only genuinely-future work sits
// under Next / Later / Exploring. Update both together so the site tells one story.
const phases: Phase[] = [
  {
    phase: "Foundations",
    status: "Now",
    items: [
      "Language vision and principles",
      "Missions, contracts, and guarantees syntax",
      "Deterministic parser + intent-graph-v1 / intent-ir-v1",
      "Public site, examples, and an interactive playground with real parsing",
    ],
  },
  {
    phase: "Compiler, CLI, and proof",
    status: "Now",
    items: [
      "The thunder CLI: check, run, test, prove, conform, lift, build, and scan",
      "Executable decisions and lifecycles, with a full first-hit trace",
      "In-file tests, comprehension levels C0..C7, prove + verify (freshness), and proof artifacts",
      "Intent Scanner + Fable, the editor language server, a VS Code extension, and an MCP server for AI agents",
    ],
  },
  {
    phase: "Code generation, conformance, and reverse-engineering",
    status: "Now",
    items: [
      "Code generation for TypeScript, C#, Java, and Python (typed contracts + decision logic)",
      "Cross-language conformance: compile and run the generated decision for real across targets (thunder test --all-targets)",
      "thunder lift: infer humble drafts from 14 source languages (experimental)",
      "Intent Atlas CLI + graph, and an interactive Visual Atlas at /atlas (experimental)",
    ],
  },
  {
    phase: "Verification, targets, and integration",
    status: "Next",
    items: [
      "Executable conformance for the remaining lift languages (Go, Rust, Kotlin, Scala, Elixir)",
      "Deeper formal verification and runtime enforcement of guarantees",
      "OpenThunder integration for understanding builds",
      "In-browser playground compiler (WebAssembly) and marketplace-published editor tooling",
    ],
  },
  {
    phase: "AI assist",
    status: "Later",
    items: [
      "Intent Engine: optional, traced, human-approved prompt-to-intent and generation",
      "The deterministic core keeps working with no model at all",
    ],
  },
  {
    phase: "Ecosystem",
    status: "Exploring",
    items: [
      "Package manager and examples repository",
      "RFC process for language changes",
      "Community forum",
      "Skills Tech Studio integration and a certification path",
    ],
  },
];

const statusStyles: Record<Phase["status"], string> = {
  Now: "border-gold-300/40 bg-gold-300/10 text-gold-200",
  Next: "border-white/20 bg-white/[0.04] text-haze-100",
  Later: "border-white/12 bg-white/[0.02] text-haze-300",
  Exploring: "border-white/10 bg-transparent text-haze-400",
};

const pipeline = [
  "Intent source",
  "Parse",
  "Intent AST",
  "Semantic analysis",
  "Contract graph",
  "Architecture graph",
  "Implementation plan",
  "Target generation",
  "Verification",
  "Proof artifact",
];

export default function RoadmapPage() {
  return (
    <>
      <PageHero
        eyebrow="Roadmap"
        title="From an idea to a language you can rely on."
        intro="A deliberately honest, sequenced plan. The first phases already ship in the compiler today; dates are intentionally omitted, and each later phase begins when the previous one is genuinely solid."
      >
        <DraftNote>
          This roadmap is directional, not a commitment. Order and scope will
          change as the language and the community evolve.
        </DraftNote>
      </PageHero>

      <Section>
        <div className="panel p-6 sm:p-8">
          <p className="eyebrow">The compiler pipeline</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            How intent becomes verified artifacts.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-haze-300">
            The ThunderLang compiler does not just turn syntax into code. It
            turns intent into validated engineering artifacts: plans, code,
            tests, docs, diagrams, and a proof.
          </p>
          <div className="mt-6 overflow-x-auto">
            <ol className="flex items-center gap-2 whitespace-nowrap pb-2">
              {pipeline.map((stage, i) => (
                <li key={stage} className="flex items-center gap-2">
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-haze-200">
                    {stage}
                  </span>
                  {i < pipeline.length - 1 && (
                    <span className="text-gold-300/60">→</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section>
        <div className="space-y-6">
          {phases.map((p) => (
            <div key={p.phase} className="panel p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-white">{p.phase}</h2>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[p.status]}`}
                >
                  {p.status}
                </span>
              </div>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {p.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-haze-300"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300/70" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
