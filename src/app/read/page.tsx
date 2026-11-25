import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { ReadClient } from "./ReadClient";
import { OpenThunderLink } from "@/components/OpenThunderLink";

export const metadata = pageMeta({
  title: "Thunder Code: read any code in Thunder",
  description: "AI wrote the code; read, understand, and review it visually. Thunder a file or a whole repository in TypeScript, Python, Go, Rust, C#, Java, Kotlin, PHP, or Ruby: routes, rules, and checks in plain English, searchable and filterable, rewritten in a language you know.",
  path: "/read",
});

export default function ReadPage() {
  return (
    <>
      <PageHero
        eyebrow="Thunder Code · No install · No AI"
        title="AI wrote the code. Now see what it does."
        intro="Paste a file or open a folder of Python, TypeScript, JavaScript, Java, C#, Go, Rust, Kotlin, PHP, or Ruby. Every rule Thunder can read becomes a picture you can ask questions; everything else is marked for a person to read. A quick, visual way to read, understand, and review code, including code AI wrote."
      >
        <p className="text-sm text-haze-300">
          <Link href="/gallery" className="font-medium text-gold-300 hover:text-gold-200">See it on famous code →</Link>
          <span className="mx-3 text-haze-500" aria-hidden="true">·</span>
          <Link href="/r" className="font-medium text-gold-300 hover:text-gold-200">Read a public GitHub file →</Link>
        </p>
      </PageHero>
      <Section>
        <ReadClient />
        <div className="mt-10"><OpenThunderLink title="Read your whole repository in OpenThunder" body="OpenThunder is the IDE for AI-written code: open a repo, read it in Thunder, and verify every change. Visual reading of whole repositories is rolling out." cta="Open OpenThunder" /></div>
      </Section>
    </>
  );
}
