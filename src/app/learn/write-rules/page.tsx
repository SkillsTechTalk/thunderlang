import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { LearnClient } from "../LearnClient";

export const metadata = pageMeta({
  title: "Write rules in Thunder",
  description: "Five short lessons: write a business rule in plain words, prove it with examples, and watch it become TypeScript, Python, Go, Rust, C#, and Java.",
  path: "/learn/write-rules",
});

export default function LearnPage() {
  return (
    <>
      <PageHero
        eyebrow="Learn Thunder, part 2 · Write rules · About 10 minutes"
        title="Write a rule once. Get it in six languages."
        intro="Five short lessons. Write a business rule in plain words, prove it with examples, and watch it turn into TypeScript, Python, Go, Rust, C#, and Java as you type. Everything runs in your browser."
      />
      <Section>
        <LearnClient />
      </Section>
    </>
  );
}
