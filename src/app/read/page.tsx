import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ReadClient } from "./ReadClient";
import { OpenThunderLink } from "@/components/OpenThunderLink";

export const metadata = pageMeta({
  title: "Read any code in Thunder",
  description: "Thunder a file or a whole repository in TypeScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby: routes, rules, and checks in plain English, searchable and filterable, rewritten in a language you know.",
  path: "/read",
});

export default function ReadPage() {
  return (
    <>
      <PageHero
        eyebrow="Thundered code · No install · No AI"
        title="Read any code in Thunder."
        intro="Paste a file or open a whole folder of TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby and see it Thundered: its routes, the rules it makes, and the checks it runs, in plain English. Search and filter everything, and see each rule rewritten in a language you know."
      />
      <Section>
        <ReadClient />
        <div className="mt-10"><OpenThunderLink title="Read your whole repository in OpenThunder" body="OpenThunder is the IDE for Thunder: open a repo, read it in Thunder, and verify every change. Visual reading of whole repositories is rolling out." cta="Open OpenThunder" /></div>
      </Section>
    </>
  );
}
