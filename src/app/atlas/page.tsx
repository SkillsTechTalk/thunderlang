import Link from "next/link";
import { PageHero, Section, DraftNote, Pill } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { pageMeta } from "@/lib/seo";
import atlas from "@/data/atlas.json";

export const metadata = pageMeta({
  title: "Intent Atlas",
  description:
    "Understand well-known open-source projects through their intent. IntentLang lifts each project's public functions into inferred intent drafts, deterministically and with no AI, so a whole module reads as what it does.",
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
        intro={`IntentLang lifts each project's public functions into inferred intent , deterministically, no AI , so a whole module reads as what it does. ${totals.missions} missions across ${totals.projects} well-known projects and ${totals.languages.length} languages.`}
      >
        <DraftNote>
          These are <strong>inferred, humble drafts</strong> , a lens on each project, not its
          authors&rsquo; committed intent. Every draft is unverified and needs review; only the
          lifted intent is shown, with attribution and license. This is exactly what{" "}
          <Link href="/docs/adopting-intentlang">adopting IntentLang</Link> looks like: lift first,
          then make it yours.
        </DraftNote>
      </PageHero>

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
                  <IntentCode code={m.intent} filename={`${m.mission}.intent`} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      ))}
    </main>
  );
}
