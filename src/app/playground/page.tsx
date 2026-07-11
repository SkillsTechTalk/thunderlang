import { PageHero, Section, SectionHeading } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { PlaygroundClient } from "./PlaygroundClient";
import { RuntimeClient } from "./RuntimeClient";

export const metadata = pageMeta({
  title: "Playground",
  description:
    "Run and compile IntentLang in the browser. Execute a decision against inputs, simulate a lifecycle, then compile the mission, all with the deterministic compiler (no AI).",
  path: "/playground",
});

export default function PlaygroundPage() {
  return (
    <>
      <PageHero
        eyebrow="Playground"
        title="Write intent. Run it. Read the proof."
        intro="This is what beyond prompt engineering looks like: intent you can execute. Run a decision against real inputs and simulate a lifecycle against real events, deterministically and with no AI, then compile the whole mission into diagnostics, docs, a graph, a test plan, and a proof."
      />
      <Section>
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
          intro="Load a mission and run the deterministic compiler. You get diagnostics, generated docs, a contract graph, a test plan, and a .intent-proof.json, the same artifacts the CLI emits."
        />
        <PlaygroundClient />
      </Section>
    </>
  );
}
