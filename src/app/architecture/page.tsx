import { PageHero, Section, SectionHeading, Card, Pill } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "How Thunder works",
  description:
    "The Thunder architecture, the way Java has the JVM. ThunderLang is the language; the Thunder Compiler turns it into the Intent Graph; the Thunder Engine executes and proves it deterministically; OpenThunder verifies it stays true.",
  path: "/architecture",
});

const analogy: [string, string, string][] = [
  ["Java (the language)", "ThunderLang", "the language you write, in .thunder files"],
  ["javac (the compiler)", "Thunder Compiler", "source to the Intent Graph and to target code"],
  ["bytecode", "Intent Graph", "the canonical compiled model everything binds to"],
  ["the JVM", "Thunder Engine", "runs and proves intent deterministically, no AI"],
  ["—", "OpenThunder", "the platform that proves it stays true over time"],
];

const pipeline = [
  { k: "ThunderLang", d: "goals, guarantees, prohibitions, decisions, tests" },
  { k: "Thunder Compiler", d: "parse, type, and compile" },
  { k: "Intent Graph", d: "the canonical model (intent-graph-v1)" },
  { k: "Thunder Engine", d: "run · test · prove (deterministic)" },
  { k: "Targets + Proof", d: "TypeScript, Python, … and an intent-proof-v1 artifact" },
];

const parts = [
  {
    name: "ThunderLang",
    tag: "the language",
    body: "What you write. A mission states its goal, typed inputs and outputs, the guarantees that must always hold, the behaviors that are prohibited, and how each is verified. Files use the .thunder extension (.tl is an accepted shorthand).",
  },
  {
    name: "Thunder Compiler",
    tag: "javac's analog",
    body: "Turns ThunderLang source into the canonical Intent Graph, and from there into target code, docs, schemas, and a test plan. Deterministic: the same source always compiles to the same graph.",
  },
  {
    name: "Intent Graph",
    tag: "the bytecode",
    body: "The stable, versioned model (intent-graph-v1) that every tool binds to, editors, the engine, generators, and OpenThunder. It is what makes intent portable across languages and tools.",
  },
  {
    name: "Thunder Engine",
    tag: "the JVM's analog",
    body: "The deterministic runtime. It executes intent, runs decisions, simulates lifecycles, evaluates contracts, runs tests (example, contract, property, scenario, mutation), and emits proofs. No AI, no account, no network.",
  },
  {
    name: "OpenThunder",
    tag: "the platform above",
    body: "Consumes the proof artifact and the Intent Graph, then adds what only an independent observer can: the Change Ledger, proof freshness at scale, verification against the real repo and runtime, and policy gates. ThunderLang defines and proves locally; OpenThunder proves it stays true.",
  },
];

export default function ArchitecturePage() {
  return (
    <main>
      <PageHero
        eyebrow="Architecture"
        title="How Thunder works."
        intro="Thunder is built the way Java is: a language, a compiler, a portable model, and an engine that runs it. ThunderLang is the language; the Thunder Compiler turns it into the Intent Graph; the Thunder Engine executes and proves it, deterministically and offline. OpenThunder is the platform that keeps the proof honest over time."
      />

      {/* The analogy */}
      <Section>
        <SectionHeading
          eyebrow="The shape of it"
          title="ThunderLang is to the Thunder Engine what Java is to the JVM."
          intro="If you know the Java stack, you already know this one."
        />
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/15 text-left">
                <th className="py-2 pr-6 font-semibold text-haze-400">In the Java world</th>
                <th className="py-2 pr-6 font-semibold text-white">In Thunder</th>
                <th className="py-2 font-semibold text-haze-400">What it is</th>
              </tr>
            </thead>
            <tbody>
              {analogy.map(([java, thunder, what]) => (
                <tr key={thunder} className="border-b border-white/8">
                  <td className="py-3 pr-6 align-top text-haze-400">{java}</td>
                  <td className="py-3 pr-6 align-top font-medium text-white">{thunder}</td>
                  <td className="py-3 align-top text-haze-300">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-sm leading-relaxed text-haze-400">
          The short name is <span className="text-haze-200">Thunder</span>; the language is{" "}
          <span className="text-haze-200">ThunderLang</span>; the CLI is{" "}
          <span className="font-mono text-haze-200">thunder</span>.
        </p>
      </Section>

      {/* The pipeline */}
      <Section className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="From intent to proof"
          title="One pipeline, every stage inspectable."
        />
        <div className="mt-10 flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {pipeline.map((s, i) => (
            <div key={s.k} className="flex flex-1 items-center gap-3 lg:flex-col lg:items-stretch">
              <div className="panel flex-1 p-4">
                <div className="font-mono text-xs text-gold-300">0{i + 1}</div>
                <div className="mt-1 text-sm font-semibold text-white">{s.k}</div>
                <div className="mt-1 text-xs leading-relaxed text-haze-400">{s.d}</div>
              </div>
              {i < pipeline.length - 1 && (
                <div aria-hidden className="shrink-0 text-center text-haze-500 lg:py-1">
                  <span className="lg:hidden">↓</span>
                  <span className="hidden lg:inline">→</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-haze-400">
          The compiler and engine are deterministic. AI can help you author intent, but it never
          decides whether something is proven, that is the engine&apos;s job, and every stage is
          inspectable by the engineer who owns it.
        </p>
      </Section>

      {/* The parts */}
      <Section>
        <SectionHeading eyebrow="The parts" title="Five names, one system." />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {parts.map((p) => (
            <Card key={p.name}>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <Pill>{p.tag}</Pill>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-haze-300">{p.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* The CLI */}
      <Section className="border-t border-white/8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="The thunder CLI"
              title="Powerful on its own. No account, no network, no AI."
              intro="The Thunder Engine ships as one binary, thunder. Define, build, test, and prove entirely on your machine. OpenThunder is a layer you add, not a dependency you need."
            />
            <div className="mt-6 flex flex-wrap gap-2">
              {["check", "run", "test", "prove", "verify", "build", "graph", "atlas", "lift", "diff"].map((c) => (
                <Pill key={c}>{c}</Pill>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-950/70 p-5 font-mono text-[12.5px] leading-relaxed text-haze-200">
            <div className="text-haze-500"># scaffold, then work by mission name , no paths</div>
            <div className="mt-1">$ thunder new CreateInvoice</div>
            <div>$ thunder mission CreateInvoice test</div>
            <div>
              $ thunder mission CreateInvoice prove
            </div>
            <div className="mt-3 text-haze-500"># or point a verb straight at a file</div>
            <div className="mt-1">
              $ thunder run eligibility.thunder --inputs{" "}
              <span className="text-haze-400">{"'{\"age\":20}'"}</span>
            </div>
            <div>
              <span className="text-emerald-300">CanEnroll: Eligible</span>{" "}
              <span className="text-haze-500">[rule: adult]</span>
            </div>
            <div className="mt-3 text-haze-500"># prove it, honestly</div>
            <div className="mt-1">$ thunder test invoice.thunder --contracts --strict</div>
            <div>
              <span className="text-gold-300">UNVERIFIED</span> never INV-N-004: invoice an unapproved order
            </div>
          </div>
        </div>
      </Section>

      {/* Files */}
      <Section className="border-t border-white/8">
        <SectionHeading
          eyebrow="Files"
          title="Write it in .thunder."
          intro="The canonical extension is .thunder. The compiler also accepts the .tl shorthand, and reads legacy .intent sources."
        />
        <div className="mt-8 max-w-2xl">
          <IntentCode
            filename="CreateInvoice.thunder"
            code={`mission CreateInvoice

goal
  Generate an invoice from approved orders

guarantee duplicate invoices are not created
  id INV-G-001
  verify by evidence
    database contains AuditRecord

never invoice an unapproved order
  id INV-N-004

target
  TypeScript
  Python`}
          />
        </div>
      </Section>
    </main>
  );
}
