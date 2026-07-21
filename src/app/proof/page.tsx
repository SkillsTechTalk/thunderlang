import Link from "next/link";
import { PageHero, Section, SectionHeading, DraftNote, Pill } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { buildSelfProofMatrix } from "@/lib/self-proof";

export const metadata = pageMeta({
  title: "Proof matrix",
  description:
    "ThunderLang verifies itself. Every number on this page is computed at build time by the shipped compiler running over this repo's own example missions: per-claim verdicts, test results, and diagnostics, with the honest gaps shown.",
  path: "/proof",
});

function Num({ value, tone }: { value: number; tone?: "good" | "warn" | "bad" }) {
  if (value === 0) return <span className="text-haze-500">0</span>;
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : tone === "warn"
          ? "text-gold-300"
          : "text-haze-100";
  return <span className={`font-medium ${cls}`}>{value}</span>;
}

export default function ProofPage() {
  // Computed at build time by the real compiler over examples/*.thunder.
  const matrix = buildSelfProofMatrix();
  const { totals } = matrix;
  const allTestsPass = totals.tests.passed === totals.tests.total;
  const clean = totals.claims.failed === 0 && totals.errors === 0 && totals.parseErrors === 0;

  return (
    <main>
      <PageHero
        eyebrow="Proven on itself"
        title="The proof matrix."
        intro={`ThunderLang gates its own repository. Every number below is computed at build time by the shipped compiler (v${matrix.compilerVersion}) running over the ${matrix.exampleCount} example missions in this repo: per-claim verdicts, in-file test results, and diagnostics. Nothing on this page is hand-written, and the gaps are shown as plainly as the passes.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/[0.08] px-3 py-1 text-xs font-medium text-emerald-200">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Gated by ThunderLang
          </span>
          <Pill>compiler v{matrix.compilerVersion}</Pill>
          <Pill>{matrix.exampleCount} example missions</Pill>
          <Pill>
            {totals.tests.passed}/{totals.tests.total} in-file tests{allTestsPass ? " passing" : ""}
          </Pill>
        </div>
      </PageHero>

      <Section>
        <SectionHeading
          eyebrow="The same verdicts as thunder prove"
          title="Every claim, honestly counted."
          intro="A guarantee or prohibition is only verified when a named in-file test proves it and passes. Declared means a verification is named (a scan, an external test) but is not runnable in-file, so it never counts as proven. Needs verification means the claim names nothing at all. Failed means its test exists and fails; a failed claim fails this site's build."
        />

        <div className="mt-6">
          <DraftNote>
            Read the zeros honestly: {totals.claims.verified} of {totals.claims.total} claims are
            currently <strong>verified by an in-file test</strong>, {totals.claims.declared} are
            declared against external checks, and {totals.claims.needsVerification} still need a
            verification. That is exactly what <code>thunder prove</code> reports, and exactly the
            gap the language exists to make visible. The CI gate fails on any{" "}
            <em>failed</em> claim or compile error; today there are {totals.claims.failed} failed
            claims and {totals.errors} errors.
          </DraftNote>
        </div>

        <div className="panel mt-8 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-haze-400">
                <th className="px-4 py-3 font-medium">Mission</th>
                <th className="px-4 py-3 font-medium">Verified</th>
                <th className="px-4 py-3 font-medium">Declared</th>
                <th className="px-4 py-3 font-medium">Needs verification</th>
                <th className="px-4 py-3 font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Tests</th>
                <th className="px-4 py-3 font-medium">Diagnostics</th>
                <th className="px-4 py-3 font-medium">Artifact</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.file} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/examples/${row.slug}`}
                      className="font-medium text-white underline decoration-white/15 underline-offset-2 hover:decoration-white/50"
                    >
                      {row.mission}
                    </Link>
                    {row.parseError && (
                      <span className="ml-2 text-xs text-red-300">parse error</span>
                    )}
                  </td>
                  {row.parseError ? (
                    <td colSpan={6} className="px-4 py-2.5 text-xs text-red-300">
                      {row.parseError}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <Num value={row.claims.verified} tone="good" />
                      </td>
                      <td className="px-4 py-2.5">
                        <Num value={row.claims.declared} tone="warn" />
                      </td>
                      <td className="px-4 py-2.5">
                        <Num value={row.claims.needsVerification} tone="warn" />
                      </td>
                      <td className="px-4 py-2.5">
                        <Num value={row.claims.failed} tone="bad" />
                      </td>
                      <td className="px-4 py-2.5">
                        {row.tests.total === 0 ? (
                          <span className="text-haze-500">none</span>
                        ) : (
                          <span
                            className={
                              row.tests.passed === row.tests.total
                                ? "font-medium text-emerald-300"
                                : "font-medium text-red-300"
                            }
                          >
                            {row.tests.passed}/{row.tests.total}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-haze-300">
                        {row.errors > 0 && (
                          <span className="font-medium text-red-300">{row.errors} errors </span>
                        )}
                        {row.warnings > 0 ? (
                          <span>{row.warnings} warnings</span>
                        ) : row.errors === 0 ? (
                          <span className="text-haze-500">clean</span>
                        ) : null}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2.5">
                    {!row.parseError && (
                      <a
                        href={`/api/proof?mission=${row.slug}`}
                        className="text-xs text-gold-300 hover:text-gold-200"
                      >
                        Download proof
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/15 text-haze-100">
                <td className="px-4 py-3 font-semibold text-white">
                  Total ({matrix.exampleCount} missions)
                </td>
                <td className="px-4 py-3">
                  <Num value={totals.claims.verified} tone="good" />
                </td>
                <td className="px-4 py-3">
                  <Num value={totals.claims.declared} tone="warn" />
                </td>
                <td className="px-4 py-3">
                  <Num value={totals.claims.needsVerification} tone="warn" />
                </td>
                <td className="px-4 py-3">
                  <Num value={totals.claims.failed} tone="bad" />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      allTestsPass ? "font-medium text-emerald-300" : "font-medium text-red-300"
                    }
                  >
                    {totals.tests.passed}/{totals.tests.total}
                  </span>
                </td>
                <td className="px-4 py-3 text-haze-300">
                  {totals.errors} errors, {totals.warnings} warnings
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-4 text-sm text-haze-400">
          Each download is the live <code>intent-proof-v1</code> artifact for that mission: the same
          output <code>thunder prove</code> emits, with per-claim verdicts and the freshness tuple.
          Reproduce any row locally with{" "}
          <code>node compiler/src/cli.mjs prove examples/&lt;Mission&gt;.thunder</code>.
        </p>
      </Section>

      <Section className="border-t border-white/8">
        <SectionHeading
          eyebrow="The gate"
          title="A failed claim fails the build."
          intro={`CI runs the same compiler over every example on every push: npm run intent:prove executes thunder prove per mission and exits non-zero if any claim's test fails, any in-file test fails, or any mission has a semantic error. Declared and needs-verification claims pass the gate, they are honest states, not failures, but they are reported here so the gap never hides. Current status: ${clean && allTestsPass ? "green" : "failing"}.`}
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/docs/proof-matrix" className="btn-ghost">
            How the proof matrix works
          </Link>
          <Link href="/docs/verifying-ai-changes" className="btn-ghost">
            Gate your own repo
          </Link>
        </div>
      </Section>
    </main>
  );
}
