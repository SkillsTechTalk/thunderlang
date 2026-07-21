import { PageHero, Section } from "@/components/ui";
import { WaitlistForm } from "@/components/WaitlistForm";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Run a Team Pilot",
  description:
    "Run a ThunderLang pilot on your team. Get hands-on help wiring the deterministic verify-diff gate into your CI and AI agents, on your real repo, with direct access to the team.",
  path: "/waitlist",
});

const perks = [
  "Hands-on help wiring the verify-diff gate into your CI and your AI agents",
  "Adoption support on your real repo, not a toy example",
  "Direct access to the team building ThunderLang while you roll it out",
];

export default function WaitlistPage() {
  return (
    <>
      <PageHero
        eyebrow="Team pilot"
        title="Run a ThunderLang pilot on your team."
        intro="ThunderLang is open source and public on npm, so individuals can just install it. If you want to roll it out across a team, tell us a little about your setup and we will help you stand up the deterministic verify-diff gate on your own codebase."
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
            We&apos;ll only use what you share here to follow up about a pilot.
            Requests are stored privately and are never shared. You can ask us
            to remove your details at any time.
          </p>
        </div>
      </Section>
    </>
  );
}
