import Link from "next/link";
import { PageHero, Section, SectionHeading } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { readFileSync } from "fs";
import path from "path";
import { PlaygroundClient } from "./PlaygroundClient";
import { RuntimeClient } from "./RuntimeClient";
import { CorePlayground, type PlaygroundExample } from "./CorePlayground";

// The examples are read from their files when the site is built, so the playground always shows the real programs
// (the Core examples and the ThunderBench programs), never a copy that could drift.
const EXAMPLES: [string, string, string][] = [
  ["hello", "Hello, world", "examples/core/hello.thunder"],
  ["refund", "A refund rule", "thunderbench/programs/refund.thunder"],
  ["shipping", "Shipping cost", "thunderbench/programs/shipping.thunder"],
  ["discount", "A discount, records, and tests", "examples/core/discount.thunder"],
  ["invoice", "An invoice with exact money", "thunderbench/programs/invoice.thunder"],
  ["grades", "Grades from a list of scores", "thunderbench/programs/grades.thunder"],
  ["journal", "A trading journal with tests", "examples/core/trading-journal.thunder"],
];
function playgroundExamples(): PlaygroundExample[] {
  return EXAMPLES.map(([id, label, file]) => ({ id, label, source: readFileSync(path.join(process.cwd(), file), "utf8") }));
}

export const metadata = pageMeta({
  title: "Playground",
  description:
    "Write a Thunder program in your browser and see what it prints, try its functions with your own values, run its tests, and step through how it ran. Nothing to install, nothing sent anywhere.",
  path: "/playground",
});

export default function PlaygroundPage() {
  return (
    <>
      <PageHero
        eyebrow="Playground"
        title="Write a program. See what it does."
        intro="Write Thunder on the left. On the right, see what it prints, try its functions with your own values, run its tests, and step through how it ran, line by line. Everything runs in your browser: nothing to install, nothing sent anywhere."
      />
      <Section>
        <CorePlayground examples={playgroundExamples()} />
      </Section>
      <Section>
        <p className="mb-8 rounded-xl border border-gold-300/20 p-5 text-haze-200">Below: <strong className="text-white">missions</strong>, the other kind of Thunder file. A mission says what software must do (its rules, decisions, and examples), and the compiler checks it. <Link href="/docs/syntax-overview" className="font-semibold text-gold-300 underline">How programs and missions differ</Link>, or <Link href="/try" className="font-semibold text-gold-300 underline">try the refund rule</Link>.</p>
        <SectionHeading
          eyebrow="Run it"
          title="Executable intent"
          intro="A decision is a program: give it inputs and it decides, first matching rule wins, with a full trace. A lifecycle is a state machine: give it events and it walks them, rejecting anything illegal. No code is generated. The intent itself runs."
        />
        <RuntimeClient />
      </Section>
      <Section>
        <SectionHeading
          eyebrow="Compile it"
          title="From intent to proof"
          intro="Load a mission and run the deterministic compiler. You get diagnostics, generated docs, a contract graph, a test plan, and a .thunder-proof.json, the same artifacts the CLI emits."
        />
        <PlaygroundClient />
      </Section>
    </>
  );
}
