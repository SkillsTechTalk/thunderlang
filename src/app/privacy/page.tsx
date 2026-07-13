import { PageHero, Section, Card } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Privacy",
  description:
    "How IntentLang handles your data: the CLI runs entirely on your machine, the Playground compiles statelessly with no AI, and waitlist emails are private and deletable.",
  path: "/privacy",
});

const points: { title: string; body: string }[] = [
  {
    title: "The CLI runs entirely on your machine",
    body: "The compiler, scanner, runtime, and proof generation are local and deterministic. Nothing is sent anywhere. There is no telemetry and no account is required.",
  },
  {
    title: "The Playground compiles statelessly",
    body: "When you press compile, your intent source is sent to our server, compiled in memory, and the result is returned. It is not stored, logged, or used to train anything. Refreshing the page discards it.",
  },
  {
    title: "No AI in the deterministic core",
    body: "Everything the site demonstrates runs without a model. If and when optional AI assistance is added, it will be clearly labeled, opt-in, and disclosed at the point of use, never silent.",
  },
  {
    title: "Waitlist email",
    body: "If you join the waitlist, we store your email address to send product updates. It is never sold or shared. Ask us and we will delete it.",
  },
  {
    title: "What we do not collect",
    body: "We do not collect your source code from the CLI, we do not fingerprint you, and we do not sell data. The best privacy guarantee is that the core needs no server at all.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero
        eyebrow="Trust"
        title="Privacy"
        intro="The most private tool is one that runs on your machine. IntentLang's core does exactly that. This page states plainly what happens to your data in the few places a server is involved."
      />
      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          {points.map((p) => (
            <Card key={p.title}>
              <h3 className="text-base font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">{p.body}</p>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-sm text-haze-400">
          Questions about your data? Email{" "}
          <a href="mailto:privacy@intentlanguage.dev" className="text-gold-300 hover:text-gold-200">
            privacy@intentlanguage.dev
          </a>
          . This is a pre-1.0 project; this page is a plain-language summary, not a substitute for
          a formal legal agreement, which we will publish as the hosted products mature.
        </p>
      </Section>
    </>
  );
}
