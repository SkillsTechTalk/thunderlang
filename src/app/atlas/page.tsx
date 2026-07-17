import Link from "next/link";
import { PageHero, Section, SectionHeading, DraftNote, Pill } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { AtlasMap } from "@/components/AtlasMap";
import { ProofAtlas } from "@/components/ProofAtlas";
import { pageMeta } from "@/lib/seo";
import atlas from "@/data/atlas.json";

export const metadata = pageMeta({
  title: "Intent Atlas",
  description:
    "Understand well-known open-source projects through their intent. ThunderLang lifts each project's public functions into inferred intent drafts, deterministically and with no AI, so a whole module reads as what it does.",
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

  return (
    <main>
      <PageHero
        eyebrow="Intent Atlas"
        title="Understand a project through its intent."
        intro={`ThunderLang lifts each project's public functions into inferred intent , deterministically, no AI , so a whole module reads as what it does. ${totals.missions} missions across ${totals.projects} well-known projects and ${totals.languages.length} languages.`}
      >
        <DraftNote>
          These are <strong>inferred, humble drafts</strong> , a lens on each project, not its
          authors&rsquo; committed intent. Every draft is unverified and needs review; only the
          lifted intent is shown, with attribution and license. This is exactly what{" "}
          <Link href="/docs/adopting-thunderlang">adopting ThunderLang</Link> looks like: lift first,
          then make it yours.
        </DraftNote>
      </PageHero>

      <Section className="border-b border-white/8">
        <SectionHeading
          eyebrow="Define it. Prove it."
          title="See the whole system, and which parts you can actually trust."
          intro="A product you define in ThunderLang, rendered from its Intent Graph. Every guarantee, prohibition, and check is painted with its proof status. Green is proven, amber is partial, and red is drifting, a claim with nothing verifying it, exactly where intent and reality silently disagree. Click a guarantee to trace a live edge to the check that proves it, or open a red node to see the gap."
        />
        <div className="mt-8">
          <ProofAtlas />
        </div>
        <p className="mt-4 text-sm text-haze-400">
          This proof layer is what a verification platform like{" "}
          <Link href="/manifesto#openthunder" className="text-gold-300 hover:text-gold-200">OpenThunder</Link>{" "}
          supplies: ThunderLang defines what the software should do, and the atlas shows whether it does.
        </p>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Lifted intent"
          title="Or point it at code you did not write."
          intro="The same map, over 13 well-known open-source projects. ThunderLang lifts each project's functions into inferred intent, deterministically and with no AI. Color here marks inference confidence, not proof, these are unverified drafts. Expand a project and click any mission to read what it does."
        />
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
    </main>
  );
}
