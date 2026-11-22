import Link from "next/link";
import { PageHero, Section, SectionHeading } from "@/components/ui";
import { ReviewAtlas } from "@/components/ReviewAtlas";
import { getExample } from "@/lib/docs";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Evidence review",
  description:
    "Before and after an AI change, run your rules' cases and see what passes, what fails, and what still has no evidence. Runs locally in your browser.",
  path: "/review",
});

export default function ReviewPage() {
  const reviewFiles = ["researchagentrun", "agentspendbudget", "agenttoolauthorization"].map((slug) => {
    const example = getExample(slug)!;
    return { path: example.filename, source: example.code };
  });

  return (
    <div>
      <PageHero
        eyebrow="Evidence review"
        title="Know what an AI change kept, broke, or left unchecked."
        intro="Open your rules, run their cases, and see each claim with the evidence behind it. Start with an agent's tool permissions and spending limit, then open your own files."
      >
        <div className="flex flex-wrap gap-3">
          <a href="#review-atlas" className="btn-primary">Open the review ↓</a>
          <Link href="/docs/atlas-review" className="btn-secondary">Use it with your coding agent</Link>
        </div>
        <p className="mt-5 text-sm text-haze-400">Deterministic: no AI, no key. Your files stay in your browser.</p>
      </PageHero>

      <Section>
        <SectionHeading
          eyebrow="Rule → cases → evidence"
          title="Every result here comes from running the rules shown."
          intro="Pick a claim to see the cases behind it. Press “Break budget boundary” to watch one character turn a passing case into a failure, or import an OpenThunder report to check whether its source and compiler still match."
        />
        <div className="mt-8">
          <ReviewAtlas initialFiles={reviewFiles} />
        </div>
        <p className="mt-4 text-sm text-haze-400">
          A passing case covers the inputs it declares, not every input, and not your application code. Your own tests
          and review still decide what the code actually does. Command line: <code className="text-gold-200">thunder atlas ./contracts --review</code>.
        </p>
      </Section>
    </div>
  );
}
