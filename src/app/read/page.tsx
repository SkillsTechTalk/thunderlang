import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ReadClient } from "./ReadClient";

export const metadata = pageMeta({
  title: "Read code you don't know",
  description: "Paste TypeScript, Python, Go, Rust, C#, or Java. See the rules it makes in plain English and ThunderLang, search and filter them, and see each rule in a language you know.",
  path: "/read",
});

export default function ReadPage() {
  return (
    <>
      <PageHero
        eyebrow="Code reader · No install · No AI"
        title="Read code you don't know."
        intro="Paste code in TypeScript, JavaScript, Python, Go, Rust, C#, or Java. See the rules it makes in plain English and ThunderLang, search and filter them, and see each rule rewritten in a language you know."
      />
      <Section>
        <ReadClient />
      </Section>
    </>
  );
}
