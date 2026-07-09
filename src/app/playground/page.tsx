import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { PlaygroundClient } from "./PlaygroundClient";

export const metadata = pageMeta({
  title: "Playground",
  description:
    "Compile IntentLang in the browser. Write a .intent file, run the deterministic compiler (no AI), and get diagnostics, docs, a graph, a test plan, and a proof artifact.",
  path: "/playground",
});

export default function PlaygroundPage() {
  return (
    <>
      <PageHero
        eyebrow="Playground"
        title="Write intent. Compile it. Read the proof."
        intro="Load a mission and run the deterministic compiler right here. No AI. You get diagnostics, generated docs, a contract graph, a test plan, and a .intent-proof.json, the same artifacts the CLI emits."
      />
      <Section>
        <PlaygroundClient />
      </Section>
    </>
  );
}
