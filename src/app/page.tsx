import Link from "next/link";
import { ContractLab } from "@/components/ContractLab";
import {
  Section,
  SectionHeading,
  Card,
  Pill,
  CTAButtons,
} from "@/components/ui";
import { CAPABILITIES } from "@/lib/capabilities";
import { StatusBadge } from "@/components/StatusBadge";
import { PROJECT_FACTS } from "@/lib/facts";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Executable rules for AI-assisted development",
  description:
    "Write readable software rules, run their edge cases without AI, and bring the same contract into OpenThunder. Try a real boundary failure in your browser.",
  path: "/",
});

const workflow = [
  {
    step: "01",
    title: "Name the rule",
    body: "Choose a decision or transition your team needs to preserve. Keep its conditions and expected results together in a reviewed .thunder file.",
  },
  {
    step: "02",
    title: "Test the boundaries",
    body: "Run the declared cases. A failure shows the input, expected decision, and actual result. Add the edge case that would otherwise be easy to miss.",
  },
  {
    step: "03",
    title: "Carry it into the change",
    body: "Use the same file in OpenThunder, the CLI, or an agent tool. Review policy results alongside tests of the real implementation.",
  },
];
const examples = [
  {
    href: "/examples/alertrouting",
    title: "Route an alert",
    detail: "Decision rules and lifecycle scenarios in one file.",
    tag: "Decisions + transitions",
  },
  {
    href: "/examples/duplicateinvoiceprevention",
    title: "Review duplicate invoices",
    detail: "Inspect declared guarantees, named tests, and remaining checks.",
    tag: "Rules + evidence",
  },
  {
    href: "/examples/placeorder",
    title: "Follow an order",
    detail: "Explore an order policy with explicit test cases.",
    tag: "A business workflow",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:44px_44px] opacity-20" />
        <div className="container-x relative grid gap-10 py-12 sm:py-20 lg:grid-cols-[1fr_1.08fr] lg:items-center lg:gap-14">
          <div>
            <Pill>Developer tooling for OpenThunder and your workflow</Pill>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              AI changes your code.
              <br />
              <span className="text-gradient-gold">
                Keep the rules explicit.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-haze-300">
              Write the decisions your software must make, test the edge cases,
              and carry that contract into OpenThunder. Start with one rule in
              an existing project.
            </p>
            <div className="mt-8">
              <CTAButtons
                primary={{ href: "#contract-lab", label: "Try a real rule →" }}
                secondary={{
                  href: "/docs/using-with-openthunder",
                  label: "Use with OpenThunder",
                }}
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-haze-400">
              Open source. No signup or API key. The demo runs locally in your
              browser.
            </p>
            <div className="mt-8 border-l-2 border-gold-400/40 pl-4">
              <p className="text-sm font-medium text-haze-200">
                A rule you can read. A failure you can explain.
              </p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-haze-400">
                Keep the reason for a decision visible when the code around it
                changes.
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <ContractLab />
          </div>
        </div>
      </section>

      <Section
        id="openthunder"
        className="border-y border-white/10 bg-ink-900/40"
      >
        <SectionHeading
          eyebrow="From the demo to your repository"
          title="One rule, through every change."
          intro="ThunderLang defines and executes the policy. OpenThunder brings it into your development workflow, alongside checks of the code that implements it."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {workflow.map((item) => (
            <Card key={item.step}>
              <p className="font-mono text-sm text-gold-300">{item.step}</p>
              <h3 className="mt-4 text-xl font-semibold text-white">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-haze-300">
                {item.body}
              </p>
            </Card>
          ))}
        </div>
        <div className="mt-6 grid gap-6 rounded-2xl border border-white/10 bg-ink-950 p-5 sm:p-7 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-white">
              Same source. Clear scope.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-haze-300">
              Keep{" "}
              <code className="text-gold-200">
                contracts/RefundReview.thunder
              </code>{" "}
              in your project. Policy cases check the declared decision. Your
              application tests check the implementation. The review needs both.
            </p>
            <Link
              href="/docs/using-with-openthunder"
              className="mt-4 inline-block text-sm font-semibold text-gold-300 hover:text-gold-200"
            >
              Follow the setup guide →
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-black/25 p-4 text-xs leading-7 text-haze-200">
            <code>{`# Run the policy cases\nthunder test contracts/RefundReview.thunder\n\n# Inspect project intent from OpenThunder\nopenthunder intent prove --repo . --json`}</code>
          </pre>
        </div>
      </Section>

      <Section id="examples">
        <SectionHeading
          eyebrow="Choose a problem you recognize"
          title="Start where a small mistake matters."
          intro="Use a worked example to learn the syntax, inspect the cases, and decide what belongs in your own contract."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {examples.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-white/10 bg-ink-900/40 p-6 transition-colors hover:border-gold-300/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300"
            >
              <p className="text-xs font-medium text-gold-300">{item.tag}</p>
              <h3 className="mt-3 text-xl font-semibold text-white">
                {item.title}{" "}
                <span
                  aria-hidden="true"
                  className="text-haze-400 group-hover:text-gold-300"
                >
                  ↗
                </span>
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-haze-300">
                {item.detail}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-6 text-sm font-medium text-gold-300">
          <Link href="/examples">Browse every example →</Link>
          <Link href="/playground">Open the full playground →</Link>
          <Link href="/docs/mcp">Connect an AI agent →</Link>
        </div>
      </Section>

      <Section id="today" className="border-y border-white/10 bg-ink-900/40">
        <SectionHeading
          eyebrow="Evidence you can inspect"
          title="Know what was checked. See what is still open."
          intro="A passing case covers its declared inputs. A generated artifact records evidence. Neither establishes that an entire application is correct."
        />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5">
            <p className="font-semibold text-emerald-300">✓ Cases passed</p>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              The declared policy produced the expected results for these
              inputs.
            </p>
          </div>
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-5">
            <p className="font-semibold text-red-300">✕ A case failed</p>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              Inspect the exact case, expected result, and actual decision
              before changing the rule.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <p className="font-semibold text-amber-300">○ Still unverified</p>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              An unresolved reference, absent test, or external check remains
              visible.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROJECT_FACTS.map((fact) => (
            <Link
              key={fact.value}
              href={fact.href ?? "/docs"}
              className="rounded-xl border border-white/10 p-4 hover:border-white/25"
            >
              <p className="font-semibold text-white">{fact.value}</p>
              <p className="mt-1 text-xs leading-relaxed text-haze-400">
                {fact.label} →
              </p>
            </Link>
          ))}
        </div>
        <details className="mt-6 rounded-2xl border border-white/10 p-5">
          <summary className="cursor-pointer font-medium text-haze-200">
            Explore compiler capabilities and release status
          </summary>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div
                key={c.key}
                className="rounded-xl border border-white/10 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-white">{c.name}</h3>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-haze-300">
                  {c.blurb}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/roadmap"
            className="mt-5 inline-block text-sm text-gold-300"
          >
            Read the roadmap →
          </Link>
        </details>
      </Section>

      <Section id="questions">
        <SectionHeading
          eyebrow="Before you adopt it"
          title="Fit it into the tools you already use."
        />
        <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Where does it fit alongside normal tests?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-haze-300">
              Use ThunderLang for rules that benefit from readable decisions,
              state transitions, and a shared contract across tools. Keep unit
              and integration tests for implementation behavior. Start with one
              rule and evaluate the maintenance cost.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Do I need an AI model?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-haze-300">
              The compiler, declared decision tests, and supported local checks
              run without a model. An agent can help draft a change through MCP;
              review the rule and its expected results before adopting them.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Can it verify any AI-written code?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-haze-300">
              Its checks have defined scope. Policy cases execute intent;
              conformance checks compare supported generated targets. Change
              scans use patterns and can miss issues or flag safe code. Continue
              running your project tests and reviewing the implementation.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              How stable is the language?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-haze-300">
              ThunderLang is pre-1.0. Pin your compiler version, review release
              notes, and rerun your cases when upgrading. The setup guide
              identifies differences between published releases and local
              development features.
            </p>
          </div>
        </div>
      </Section>

      <Section className="border-t border-white/10 bg-ink-900/40">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-medium text-gold-300">
              Start small. Keep the evidence.
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Make your next rule reviewable.
            </h2>
          </div>
          <CTAButtons
            primary={{
              href: "#contract-lab",
              label: "Try the boundary example",
            }}
            secondary={{
              href: "/docs/using-with-openthunder",
              label: "Bring it to OpenThunder",
            }}
          />
        </div>
        <p className="mt-6 text-sm text-haze-400">
          Exploring it with your team?{" "}
          <Link href="/waitlist" className="text-gold-300">
            Discuss a pilot →
          </Link>
        </p>
      </Section>
    </>
  );
}
