import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { LiveClient } from "./LiveClient";

export const metadata = pageMeta({
  title: "Live translator",
  description: "Type code in Python, TypeScript, Java, C#, Go, or Rust and watch it become Thunder as you type. Or write Thunder and watch it become your language, and run.",
  path: "/live",
});

export default function LivePage() {
  return (
    <>
      <PageHero
        eyebrow="Live translator"
        title="Write in your language. See it in Thunder, as you type."
        intro="Type code in the language you know and watch Thunder explain it. Or write Thunder and watch it become Python, TypeScript, C#, Java, Go, or Rust, and see what it prints. Everything runs in your browser: nothing is sent anywhere."
      />
      <Section>
        <LiveClient />
      </Section>
    </>
  );
}
