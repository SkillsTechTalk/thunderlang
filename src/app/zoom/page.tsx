import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ZoomClient } from "./ZoomClient";

export const metadata = pageMeta({
  title: "Semantic Zoom: read code at five levels, from Big Picture to Original",
  description: "Read any code in the Thunder programming language at five levels: Big Picture, Flow, Details, Text, and Original. One compiler model, no AI.",
  path: "/zoom",
});

export default function ZoomPage() {
  return (
    <>
      <PageHero
        eyebrow="Read in Thunder · Semantic Zoom"
        title="Start with the Big Picture. Go as deep as you need."
        intro="Pick an example, or edit the code. Every program reads at the same five levels: Big Picture (what it is and can do), Flow (how it goes), Details (exactly what happens, and how sure Thunder is), Text (the same meaning in words), and Original (the code that proves it). All five come from one reading by the Thunder compiler, with no AI."
      />
      <Section className="!pt-0"><ZoomClient /></Section>
    </>
  );
}
