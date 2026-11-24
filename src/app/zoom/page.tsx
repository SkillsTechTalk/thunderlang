import Link from "next/link";
import { PageHero, Section, SectionHeading } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ThunderReviewSample } from "@/components/thunder/ThunderReviewSample";
import { ZoomClient } from "./ZoomClient";
import { REVIEW_AFTER, REVIEW_BEFORE } from "./review-sample";

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
      <Section id="review">
        <SectionHeading
          eyebrow="Review in Thunder"
          title="Review a change by what it does, not by its diff."
          intro="Three files change: an admin job gets a secret check, a late fee's limit moves, and a function's local name changes. The compiler reads both versions and says what changed in meaning, with the before and after behind each sentence."
        />
        <div className="mt-8">
          <ThunderReviewSample before={REVIEW_BEFORE} after={REVIEW_AFTER} />
        </div>
        <p className="mt-4 text-sm text-haze-400">
          &ldquo;Only the form changed&rdquo; is said only when it is shown: the code is identical apart from spacing, comments,
          or names the function declares itself, or a rule gives the same answer on every edge case. When Thunder&rsquo;s words
          read the same but the code differs, it says &ldquo;changed, check&rdquo;. Command line:{" "}
          <code className="text-gold-200">thunder review main HEAD</code>. In a pull request:{" "}
          <Link href="/docs/review-in-thunder" className="underline decoration-white/30 underline-offset-4 hover:text-white">the Thunder Review action</Link>.
        </p>
      </Section>
    </>
  );
}
