import { PageHero, Section, Card } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Security",
  description:
    "ThunderLang's security posture and responsible disclosure policy. The deterministic core runs offline with no AI; report vulnerabilities to support@skillstechtalk.com.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <>
      <PageHero
        eyebrow="Trust"
        title="Security and responsible disclosure"
        intro="ThunderLang exists to make software more verifiable, so we hold our own to the same standard: inspectable, deterministic, and honest about limits."
      />
      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <h3 className="text-base font-semibold text-white">Posture</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-haze-300">
              <li>The CLI and compiler run offline, with no AI and no network access required.</li>
              <li>Decision evaluation uses a safe, no-<span className="font-mono">eval</span> expression engine.</li>
              <li>The compiler itself flags security risks in your intent (secrets on the event bus, unauthenticated sensitive output, unverified global invariants).</li>
              <li>Pre-1.0: not yet independently audited. We do not claim &quot;enterprise-grade&quot; or &quot;fully secure.&quot;</li>
            </ul>
          </Card>
          <Card>
            <h3 className="text-base font-semibold text-white">Report a vulnerability</h3>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              If you find a security issue, please report it privately , do not open a public issue.
              Email{" "}
              <a href="mailto:support@skillstechtalk.com" className="text-gold-300 hover:text-gold-200">
                support@skillstechtalk.com
              </a>{" "}
              with steps to reproduce. We will acknowledge, work a fix, and credit you unless you
              prefer otherwise.
            </p>
          </Card>
        </div>
        <Card className="mt-5">
          <h3 className="text-base font-semibold text-white">Scope</h3>
          <p className="mt-2 text-sm leading-relaxed text-haze-300">
            In scope: the <span className="font-mono">@skillstech/thunderlang</span> package, this
            website, and the Playground compile endpoint. The deterministic core has no data store,
            so the attack surface is small by design. The hosted ecosystem products (Studio, Engine)
            are separate and will publish their own policies as they ship.
          </p>
        </Card>
      </Section>
    </>
  );
}
