import fs from "node:fs";
import path from "node:path";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { RefundDemo } from "./RefundDemo";

export const metadata = pageMeta({ title: "Try the refund contract", description: "Read a refund rule, run five examples, and catch a boundary mistake. Then test the real application with OpenThunder.", path: "/try" });

export default function TryPage() {
  const source = fs.readFileSync(path.join(process.cwd(), "examples/human/RefundReview.thunder-human"), "utf8")
    .replace(/^# Experimental[^\n]*\n/, "").trimEnd();
  return <><PageHero eyebrow="Start here · No install" title="Read the rule. Catch the mistake."
    intro="A refund of exactly $100 should be approved. Make one small change and see which example catches it. This experimental notation uses the existing ThunderLang compiler." />
    <Section><RefundDemo initialSource={source} /></Section></>;
}
