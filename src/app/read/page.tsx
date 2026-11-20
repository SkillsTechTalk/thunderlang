import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ReadClient } from "./ReadClient";

export const metadata = pageMeta({
  title: "Read code you don't know",
  description: "Read a file or a whole repository in TypeScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby: routes, rules, and checks in plain English, searchable and filterable, rewritten in a language you know.",
  path: "/read",
});

export default function ReadPage() {
  return (
    <>
      <PageHero
        eyebrow="Code reader · No install · No AI"
        title="Read code you don't know."
        intro="Paste a file or open a whole folder of TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby. See its routes, the rules it makes, and the checks it runs, in plain English. Search and filter everything, and see each rule rewritten in a language you know."
      />
      <Section>
        <ReadClient />
      </Section>
    </>
  );
}
