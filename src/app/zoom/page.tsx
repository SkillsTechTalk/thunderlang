import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ZoomClient } from "./ZoomClient";

export const metadata = pageMeta({
  title: "Semantic Zoom: read software from the big picture to one decision",
  description: "Read code in Thunder at three depths (big picture, flow, details) and three views (Thunder, Thunder Text, original). One compiler model, no AI.",
  path: "/zoom",
});

export default function ZoomPage() {
  return (
    <>
      <PageHero
        eyebrow="Read in Thunder · Semantic Zoom · preview"
        title="Start with the big picture. Zoom in until you see exactly how it works."
        intro="Pick an example, or edit the code. Thunder shows what it knows, what it can do, and the path each action takes, with every Yes and No. The picture, Thunder Text, and the original are three views of one reading by the Thunder compiler, with no AI."
      />
      <Section className="!pt-0"><ZoomClient /></Section>
    </>
  );
}
