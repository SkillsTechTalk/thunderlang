import Link from "next/link";
import { PageHero, Section, SectionHeading, DraftNote, Pill } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { AtlasMap } from "@/components/AtlasMap";
import { ReviewAtlas } from "@/components/ReviewAtlas";
import { getExample } from "@/lib/docs";
import { pageMeta } from "@/lib/seo";
import atlas from "@/data/atlas.json";

export const metadata = pageMeta({
  title: "Intent Atlas",
  description:
    "Review AI-era software contracts with executable cases, claim evidence, agent briefs, and OpenThunder snapshot checks. Open your own contracts locally in Intent Atlas.",
  path: "/atlas",
});

type Mission = { mission: string; fn: string; line: number; confidence: string; intent: string };
type Project = {
  name: string; language: string; license: string; what: string;
  source: string; path: string; publicFunctions?: number; missionCount: number; missions: Mission[];
};

const LANG_LABEL: Record<string, string> = {
  python: "Python", javascript: "JavaScript", typescript: "TypeScript", go: "Go",
  rust: "Rust", java: "Java", csharp: "C#", cpp: "C++", php: "PHP", ruby: "Ruby", perl: "Perl",
};

export default function AtlasPage() {
  const { projects, totals } = atlas as unknown as { projects: Project[]; totals: { projects: number; missions: number; languages: string[] } };
  const reviewFiles = ["researchagentrun", "agentspendbudget", "agenttoolauthorization"].map((slug) => {
    const example = getExample(slug)!;
    return { path: example.filename, source: example.code };
  });

  return (
    <div>
      <PageHero
        eyebrow="Intent Atlas"
        title="AI writes the code. Keep the intent in view."
        intro="See what your agents must uphold, which contract cases pass, and what still needs evidence. Start with tool permissions and spending limits, then open your own contracts."
      >
        <div className="flex flex-wrap gap-3"><a href="#review-atlas" className="btn-primary">Open the review workspace ↓</a><Link href="/docs/atlas-review" className="btn-secondary">Use with your coding agent</Link></div>
        <p className="mt-5 text-sm text-haze-400">Deterministic compiler. No model or API key required. Local contract evaluation.</p>
      </PageHero>

      <Section className="border-b border-white/8">
        <SectionHeading
          eyebrow="Intent → cases → evidence → review"
          title="Make the next AI change reviewable."
          intro="Every result below comes from running the displayed contracts. Inspect a claim, introduce a boundary bug, or import an OpenThunder report to see whether its source and compiler still match."
        />
        <div className="mt-8">
          <ReviewAtlas initialFiles={reviewFiles} />
        </div>
        <p className="mt-4 text-sm text-haze-400">
          ThunderLang checks declared contract cases. <Link href="/docs/using-with-openthunder" className="text-gold-300 hover:text-gold-200">OpenThunder</Link> connects intent to repository workflows. Implementation tests and review establish what the application actually does. See all example results in the <Link href="/proof" className="text-gold-300 hover:text-gold-200">proof matrix</Link>.
        </p>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Lifted intent"
          title="Or point it at code you did not write."
          intro={`${totals.missions} inferred missions across ${totals.projects} open-source projects and ${totals.languages.length} languages. Explore the map to understand a module before adopting a contract.`}
        />
        <div className="mt-5"><DraftNote>These are inferred drafts with attribution, not the authors&rsquo; committed intent. Color marks inference confidence. Every draft needs review and verification. <Link href="/docs/adopting-thunderlang">Learn how to adopt one.</Link></DraftNote></div>
        <div className="mt-8">
          <AtlasMap projects={projects} totals={totals} />
        </div>
      </Section>

      {projects.map((p) => (
        <Section key={`${p.name}-${p.path}`}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">{p.name}</h2>
            <Pill>{LANG_LABEL[p.language] ?? p.language}</Pill>
            <Pill>{p.license}</Pill>
            <span className="text-sm text-haze-400">
              {p.publicFunctions && p.publicFunctions > p.missionCount
                ? `${p.missionCount} of ${p.publicFunctions} public functions`
                : `${p.missionCount} missions`}
            </span>
          </div>
          <p className="mb-4 text-sm text-haze-300">
            {p.what}. Lifted from{" "}
            <a href={p.source} className="underline decoration-white/20 hover:decoration-white/60" target="_blank" rel="noopener noreferrer">
              {p.path}
            </a>
            .
          </p>
          <div className="space-y-2">
            {p.missions.map((m) => (
              <details key={`${m.fn}-${m.line}`} className="panel overflow-hidden">
                <summary className="cursor-pointer list-none px-4 py-2.5 text-sm text-haze-100">
                  <span className="font-medium text-white">{m.mission}</span>{" "}
                  <span className="text-haze-500">
                    &middot; {m.fn}() &middot; {m.confidence} confidence
                  </span>
                </summary>
                <div className="border-t border-white/8 p-3">
                  <IntentCode code={m.intent} filename={`${m.mission}.thunder`} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
