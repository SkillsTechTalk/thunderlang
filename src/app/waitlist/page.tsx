import { PageHero, Section } from "@/components/ui";
import { WaitlistForm } from "@/components/WaitlistForm";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Join the Waitlist",
  description:
    "Join the waitlist for IntentLang, the first Intent-Oriented Programming language for the AI era, built by SkillsTech.",
  path: "/waitlist",
});

const perks = [
  "Early access to docs, examples, and the playground",
  "Updates as the language evolves toward 1.0",
  "A chance to influence the syntax before v1",
];

export default function WaitlistPage() {
  return (
    <>
      <PageHero
        eyebrow="Early access"
        title="Be early to IntentLang."
        intro="IntentLang is the first Intent-Oriented Programming language for the AI era. Join the waitlist to follow along and get access as the tooling opens up."
      />
      <Section>
        <div className="mx-auto max-w-xl">
          <WaitlistForm />
          <ul className="mt-8 space-y-3">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-3 text-haze-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300/70" />
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs leading-relaxed text-haze-500">
            We&apos;ll only use your email to share IntentLang milestones. Signups are
            stored privately and are never shared. You can ask us to remove your
            address at any time.
          </p>
        </div>
      </Section>
    </>
  );
}
