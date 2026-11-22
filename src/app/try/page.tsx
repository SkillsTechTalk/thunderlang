import fs from "node:fs";
import path from "node:path";
import { PageHero, Section, SectionHeading } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { RefundDemo } from "./RefundDemo";
import { PlainRuleCard } from "./PlainRuleCard";
import { RuleComparison } from "./RuleComparison";

export const metadata = pageMeta({ title: "Read your software's rules in Thunder", description: "See why a refund is approved, change one condition, and find out which cases are affected. Then see the same rule as Thundered Python.", path: "/try" });

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), "examples/human", file), "utf8").replace(/^# Experimental[^\n]*\n/, "");

export default function TryPage() {
  const compact = read("RefundReview.thunder-human").trimEnd();
  const plain = read("RefundApproval.thunder-plain");
  return <><PageHero eyebrow="Start here · No install" title="Read your software’s rules in Thunder."
    intro="See why a refund is approved, change one condition, and find out which cases are affected. Start with a question: a customer asks for exactly $100, on time. Approve or review?" />
    <Section className="!pt-0"><div className="mx-auto max-w-3xl"><PlainRuleCard initialSource={plain} breadcrumb={["Commerce", "Refunds"]} /></div></Section>
    <Section className="!pt-0">
      <SectionHeading eyebrow="Thundered Python" title="Your Python, read in Thunder." intro="On the left, a refund rule in Python. On the right, the same Python Thundered: Thunder read it and drew it. Thundering also works for TypeScript, Java, C#, Go and more." />
      <div className="mt-8"><RuleComparison compact={compact} plain={plain.trimEnd()} /></div>
    </Section>
    <Section className="!pt-0">
      <SectionHeading eyebrow="For engineers" title="Edit the compact notation." intro="The earlier experimental notation still works and runs the same examples." />
      <div className="mt-8"><RefundDemo initialSource={compact} /></div>
    </Section></>;
}
