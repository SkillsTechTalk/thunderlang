import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { PlaygroundClient } from "./PlaygroundClient";

export const metadata = pageMeta({
  title: "Playground",
  description:
    "Sketch Intent in the browser. A preview editor for the Intent-Oriented Programming language, highlighting only, no execution yet.",
  path: "/playground",
});

export default function PlaygroundPage() {
  return (
    <>
      <PageHero
        eyebrow="Playground · Preview"
        title="Sketch intent in the browser."
        intro="Type or load a Mission and watch it format as draft Intent. This is a preview for exploring the syntax, compilation and execution are on the roadmap, not here yet."
      />
      <Section>
        <PlaygroundClient />
      </Section>
    </>
  );
}
