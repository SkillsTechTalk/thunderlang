import { PageHero, Section, Card, DraftNote } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Community",
  description:
    "Get involved with IntentLang, an Intent-Oriented Programming language by SkillsTech. Follow along, share ideas, and help shape the language.",
  path: "/community",
});

// TODO: replace hrefs with real destinations once channels exist.
const channels = [
  {
    title: "Join the waitlist",
    body: "The most reliable way to hear about docs, examples, and early access as they land.",
    cta: "Join the waitlist",
    href: "/waitlist",
    ready: true,
  },
  {
    title: "GitHub",
    body: "The examples repo, RFCs, and reference tooling will live here as they open up.",
    cta: "Coming soon",
    href: "#",
    ready: false,
  },
  {
    title: "Community forum",
    body: "A place to discuss the language, propose ideas, and ask questions. Planned.",
    cta: "Coming soon",
    href: "#",
    ready: false,
  },
  {
    title: "SkillsTech ecosystem",
    body: "IntentLang sits alongside OpenThunder, Repo Mastery, SkillsTech Talk, and Certified.",
    cta: "Read the vision",
    href: "/vision",
    ready: true,
  },
];

const principles = [
  "Be honest about what is real versus planned.",
  "Prefer clarity over hype in everything we publish.",
  "Design for humans and AI working together.",
  "Credit ideas and keep discussions constructive.",
];

export default function CommunityPage() {
  return (
    <>
      <PageHero
        eyebrow="Community"
        title="Help shape a language while it is still forming."
        intro="IntentLang is early, which means the people who show up now have outsized influence on where it goes. Here is how to follow along and get involved."
      >
        <DraftNote>
          Most community channels are still being set up. The links below marked
          “coming soon” are placeholders, not live destinations yet.
        </DraftNote>
      </PageHero>

      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          {channels.map((c) => (
            <Card key={c.title}>
              <h2 className="text-lg font-semibold text-white">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {c.body}
              </p>
              {c.ready ? (
                <a
                  href={c.href}
                  className="mt-4 inline-block text-sm font-medium text-gold-300 hover:text-gold-200"
                >
                  {c.cta} →
                </a>
              ) : (
                <span className="mt-4 inline-block text-sm text-haze-500">
                  {c.cta}
                </span>
              )}
            </Card>
          ))}
        </div>

        <div className="mt-16 mx-auto max-w-prose">
          <h2 className="text-2xl font-semibold text-white">
            How we work together
          </h2>
          <ul className="mt-5 space-y-3">
            {principles.map((p) => (
              <li key={p} className="flex items-start gap-3 text-haze-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300/70" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}
