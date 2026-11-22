import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { NPM_PACKAGE, PUBLISHED_VERSION } from "@/lib/facts";
import { COMPILER_VERSION } from "../../../compiler/src/index.mjs";

export const metadata = pageMeta({
  title: "Install Thunder",
  description: "Download and install the Thunder programming language (ThunderLang): the open-source Thunder compiler and the thunder command. Node.js 18 or newer, no account, no AI key.",
  path: "/install",
});

const NEXT = (COMPILER_VERSION as string) !== (PUBLISHED_VERSION as string) ? COMPILER_VERSION : null;

// What to try first. `since` is the first version that has the command; anything newer than the
// published version is labelled "Coming in …" instead of being promised.
const COMMANDS: Array<{ cmd: string; what: string; since: string }> = [
  { cmd: "thunder read checkout.py", what: "Read a file in Thunder: its rules, checks, and what still needs a person", since: "0.5.2" },
  { cmd: "thunder human RefundReview.thunder-human", what: "Run a rule's examples and see each answer", since: "0.5.2" },
  { cmd: "thunder test Rules.thunder --target python", what: "Run the examples against the generated Python, for real", since: "0.5.2" },
  { cmd: "thunder gen Rules.thunder --target typescript", what: "Generate the rule in TypeScript, Python, C#, or Java", since: "0.5.2" },
  { cmd: "thunder --version", what: "Check which version you have", since: "0.5.3" },
  { cmd: "thunder text RefundApproval.thunder-plain", what: "Run a Thunder Text rule", since: "0.5.3" },
  { cmd: "thunder repo psf/requests", what: "Thunder a whole GitHub repository, read-only", since: "0.5.3" },
];

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-haze-100"><code>{children}</code></pre>;
}

export default function InstallPage() {
  return (
    <>
      <PageHero eyebrow="Install" title="Install Thunder."
        intro="The Thunder programming language (also called ThunderLang): the open-source Thunder compiler and the thunder command. No account and no AI key." />
      <Section className="!pt-0">
        <ol className="max-w-3xl space-y-10">
          <li>
            <h2 className="text-xl font-semibold text-white"><span className="mr-2 text-gold-300">1</span>Have Node.js 18 or newer</h2>
            <p className="mt-2 text-haze-300">Check with <code className="font-mono text-haze-100">node --version</code>. If you need it, get it from <a className="text-gold-300 hover:text-gold-200" href="https://nodejs.org">nodejs.org</a>.</p>
          </li>
          <li>
            <h2 className="text-xl font-semibold text-white"><span className="mr-2 text-gold-300">2</span>Install the thunder command</h2>
            <Code>{`npm install -g ${NPM_PACKAGE}`}</Code>
            <p className="mt-2 text-sm text-haze-400">Installs version {PUBLISHED_VERSION}, the current release on npm. Source: <a className="text-gold-300 hover:text-gold-200" href="https://github.com/SkillsTechTalk/thunderlang">github.com/SkillsTechTalk/thunderlang</a> (Apache 2.0).</p>
          </li>
          <li>
            <h2 className="text-xl font-semibold text-white"><span className="mr-2 text-gold-300">3</span>Check that it works</h2>
            <Code>thunder help</Code>
            <p className="mt-2 text-haze-300">You should see the list of commands. {NEXT && <>From {NEXT}, <code className="font-mono text-haze-100">thunder --version</code> prints the version too.</>}</p>
          </li>
          <li>
            <h2 className="text-xl font-semibold text-white"><span className="mr-2 text-gold-300">4</span>Try it</h2>
            <ul className="mt-4 divide-y divide-white/8 rounded-2xl border border-white/10">
              {COMMANDS.map((c) => {
                const coming = newer(c.since, PUBLISHED_VERSION);
                return (
                  <li key={c.cmd} className={`flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4 ${coming ? "opacity-80" : ""}`}>
                    <code className="min-w-0 flex-1 font-mono text-sm text-haze-100">{c.cmd}</code>
                    <span className="text-sm text-haze-300 sm:w-72">{c.what}</span>
                    <span className={`w-fit shrink-0 rounded-full border px-2 py-0.5 text-center text-[11px] sm:w-32 ${coming ? "border-dashed border-white/25 text-haze-300" : "border-white/20 text-haze-100"}`}>{coming ? `Coming in ${c.since}` : "Available"}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        </ol>
      </Section>
      <Section className="!pt-0">
        <h2 className="text-xl font-semibold text-white">Other ways to use Thunder</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "In your browser", body: "No install: read code, try a rule, or open the Playground.", href: "/try", cta: "Try it" },
            { title: "OpenThunder", body: "The IDE for Thunder, with the compiler built in.", href: "https://openthunder.dev", cta: "Open OpenThunder ↗" },
            { title: "VS Code", body: "Syntax colors, problems as you type, and hover help.", href: "/docs/editor-support", cta: "Editor setup" },
            { title: "From source", body: "Clone the repository and run node compiler/src/cli.mjs, including unreleased commands.", href: "https://github.com/SkillsTechTalk/thunderlang", cta: "GitHub ↗" },
          ].map((o) => (
            <li key={o.title} className="flex flex-col rounded-2xl border border-white/10 p-5">
              <p className="font-semibold text-white">{o.title}</p>
              <p className="mt-1 flex-1 text-sm text-haze-300">{o.body}</p>
              {o.href.startsWith("http") ? <a href={o.href} className="mt-3 text-sm font-medium text-gold-300 hover:text-gold-200">{o.cta}</a>
                : <Link href={o.href} className="mt-3 text-sm font-medium text-gold-300 hover:text-gold-200">{o.cta} →</Link>}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-haze-400">Next: <Link href="/docs/getting-started" className="text-gold-300 hover:text-gold-200">Getting started</Link> or the <Link href="/learn" className="text-gold-300 hover:text-gold-200">10-minute tutorial</Link>.</p>
      </Section>
    </>
  );
}
