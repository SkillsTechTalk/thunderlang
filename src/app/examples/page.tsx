import Link from "next/link";
import { PageHero, Section, DraftNote, CTAButtons, Pill, Card } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { pageMeta } from "@/lib/seo";
import { getExampleList } from "@/lib/docs";
import {
  heroExample,
  layerHuman,
  layerTyped,
  layerExecutable,
  architectureExample,
  apiExample,
  eventExample,
  testExample,
} from "@/lib/content";

export const metadata = pageMeta({
  title: "Examples",
  description:
    "Draft IntentLang examples: missions, three syntax layers, and architecture, API, event, and test intent showing how IntentLang describes what software should do.",
  path: "/examples",
});

const missionExamples = [
  {
    id: "invoice",
    title: "A complete mission",
    summary:
      "The canonical CreateInvoice mission: a goal, its inputs and outputs, the guarantees that must always hold, forbidden behavior, targets, and how it is verified.",
    code: heroExample,
    filename: "CreateInvoice.intent",
  },
];

const layers = [
  {
    id: "layer-human",
    tag: "Layer 1",
    title: "Human Intent",
    summary:
      "Readable and structured. Anyone on the team, or an AI agent, can follow it on first read.",
    code: layerHuman,
  },
  {
    id: "layer-typed",
    tag: "Layer 2",
    title: "Typed Intent",
    summary:
      "A precise engineering mode with semantic types and explicit constraints.",
    code: layerTyped,
  },
  {
    id: "layer-executable",
    tag: "Layer 3",
    title: "Executable Intent",
    summary:
      "Compiler-ready mode that names a target, its implementation choices, and the checks to run.",
    code: layerExecutable,
  },
];

const systemExamples = [
  {
    id: "architecture",
    title: "Architecture as code",
    summary:
      "IntentLang understands services: what they own, consume, and publish, their data store, and who owns them.",
    code: architectureExample,
    filename: "Billing.intent",
  },
  {
    id: "api",
    title: "API intent",
    summary:
      "Method, path, required permissions, inputs, outputs, and the errors an endpoint can return.",
    code: apiExample,
    filename: "CreateInvoiceApi.intent",
  },
  {
    id: "event",
    title: "Event intent",
    summary:
      "Who publishes an event, who consumes it, its payload, and the guarantees it must uphold.",
    code: eventExample,
    filename: "InvoiceCreated.intent",
  },
  {
    id: "test",
    title: "Behavior-first tests",
    summary:
      "Given, When, Then. Tests describe behavior in the same language as the intent they verify.",
    code: testExample,
    filename: "DuplicateInvoicePrevention.intent",
  },
];

export default function ExamplesPage() {
  const files = getExampleList();
  return (
    <>
      <PageHero
        eyebrow="Examples"
        title="See how intent reads before any code is written."
        intro="Each example is a self-contained mission. Read it top to bottom, that is the point, and many now run: decisions evaluate, lifecycles simulate, and in-file tests pass through the deterministic compiler."
      >
        <DraftNote>
          The executable parts run for real via{" "}
          <strong>@skillstech/intentlang</strong> , no AI, no generated code. Try one in the{" "}
          <Link href="/playground">playground</Link>. The language is pre-1.0 and can still change.
        </DraftNote>
      </PageHero>

      {/* Browse the raw .intent files */}
      <Section>
        <div className="mb-4">
          <p className="eyebrow">Example files</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Browse the <span className="font-mono text-gold-200">.intent</span>{" "}
            files.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((f) => (
            <Link key={f.slug} href={`/examples/${f.slug}`}>
              <Card className="h-full">
                <h3 className="text-base font-semibold text-white">
                  {f.title}
                </h3>
                <p className="mt-2 font-mono text-xs text-haze-400">
                  {f.filename}
                </p>
                <span className="mt-3 inline-block text-sm text-gold-300">
                  Open →
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <div className="space-y-16">
          {missionExamples.map((ex) => (
            <div
              key={ex.id}
              id={ex.id}
              className="grid scroll-mt-24 gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-center"
            >
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  {ex.title}
                </h2>
                <p className="mt-3 text-haze-300">{ex.summary}</p>
              </div>
              <IntentCode code={ex.code} filename={ex.filename} />
            </div>
          ))}
        </div>
      </Section>

      {/* Three syntax layers */}
      <Section className="border-y border-white/8 bg-ink-900/40">
        <div className="max-w-2xl">
          <p className="eyebrow">Three layers</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            One mission, three levels of precision.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-haze-300">
            The same ResetPassword mission, written from beginner-friendly human
            intent down to compiler-ready executable intent.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {layers.map((l) => (
            <div key={l.id} id={l.id} className="scroll-mt-24">
              <div className="mb-3 flex items-center gap-2">
                <Pill>{l.tag}</Pill>
                <h3 className="text-base font-semibold text-white">
                  {l.title}
                </h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-haze-300">
                {l.summary}
              </p>
              <IntentCode code={l.code} filename="ResetPassword.intent" />
            </div>
          ))}
        </div>
      </Section>

      {/* Architecture, API, event, test */}
      <Section>
        <div className="max-w-2xl">
          <p className="eyebrow">Beyond a single function</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            IntentLang for whole systems.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-haze-300">
            IntentLang is architecture aware. Services, APIs, events, and tests are
            all first-class, so the meaning of a system lives in one place.
          </p>
        </div>
        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {systemExamples.map((ex) => (
            <div key={ex.id} id={ex.id} className="scroll-mt-24">
              <h3 className="text-lg font-semibold text-white">{ex.title}</h3>
              <p className="mb-4 mt-2 text-sm leading-relaxed text-haze-300">
                {ex.summary}
              </p>
              <IntentCode code={ex.code} filename={ex.filename} />
            </div>
          ))}
        </div>

        <div className="mt-16 panel px-6 py-10 text-center">
          <h2 className="text-2xl font-semibold text-white">
            Want to try writing intent?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-haze-300">
            The playground is a preview where you can sketch missions today.
            Execution and compilation are coming later.
          </p>
          <div className="mt-6 flex justify-center">
            <CTAButtons
              primary={{ href: "/playground", label: "Open the Playground" }}
              secondary={{ href: "/docs", label: "Read the Docs" }}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
