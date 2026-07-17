import { PageHero, Section, Card } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "License and governance",
  description:
    "How ThunderLang is licensed and governed: the compiler, CLI, specification, and examples are Apache-2.0, and the project is founder-led while pre-1.0. The ThunderLang name and marks are protected separately.",
  path: "/license",
});

const rows: [string, string][] = [
  ["Compiler + CLI (@skillstech/thunderlang)", "Apache License 2.0. Use, modify, and ship it, including commercially, with an explicit patent grant."],
  ["Language specification", "Public, Apache-2.0. The grammar and the diagnostics catalog are documented and versioned."],
  ["Examples", "Public. Every .thunder example in the docs is Apache-2.0 alongside the compiler."],
  ["Intent Graph schema (intent-graph-v1)", "Public and versioned, so any tool can bind to it."],
  ["Governance", "Founder-led while pre-1.0. Breaking changes are versioned; nothing that already parses is broken silently."],
];

export default function LicensePage() {
  return (
    <>
      <PageHero
        eyebrow="Trust"
        title="License and governance"
        intro="We would rather you inspect this than take our word for it. ThunderLang's compiler is open-source and its schemas are public; the language is pre-1.0 and evolves without breaking what already works."
      />
      <Section>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map(([what, terms]) => (
                <tr key={what} className="border-b border-white/8">
                  <td className="py-3 pr-6 align-top font-medium text-white">{what}</td>
                  <td className="py-3 align-top text-haze-300">{terms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card className="mt-8">
          <h3 className="text-base font-semibold text-white">Building in the open</h3>
          <p className="mt-2 text-sm leading-relaxed text-haze-300">
            The deterministic compiler requires no AI and no account to run. You can verify every
            claim on this site with the CLI: <span className="font-mono text-haze-200">npm i @skillstech/thunderlang</span>.
            The Apache-2.0 license text ships in the package. Trademark and brand assets (the ThunderLang
            name and marks) are protected separately and remain Skills Tech Talk, LLC&apos;s. See{" "}
            <a href="https://github.com/SkillsTechTalk/thunderlang/blob/main/TRADEMARKS.md" className="text-gold-300 hover:text-gold-200">TRADEMARKS.md</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}
