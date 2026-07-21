import fs from "fs";
import path from "path";
// The deterministic ThunderLang compiler is a plain-ESM sibling package.
// It runs at build time with no AI and no network. See src/compiler.d.ts.
import { parseIntent } from "../../compiler/src/parse.mjs";
import { semanticDiagnostics, COMPILER_VERSION } from "../../compiler/src/emit.mjs";
import { runTests } from "../../compiler/src/testing.mjs";

/**
 * Dogfood: run the shipped compiler over this repo's own example missions at
 * build time and report the honest result. This is the same per-claim verdict
 * model `thunder prove` uses (compiler/src/cli.mjs resolveObligations):
 *
 *   verified            a named in-file test proves the claim and passes
 *   failed              the claim's named test exists and fails
 *   declared            a verification is named (a scan, an external test)
 *                       but is not runnable in-file, so it does not count as proven
 *   needsVerification   the claim names no verification at all
 *
 * Only stable fields are computed here (verdict counts, test counts,
 * diagnostics counts), never the volatile freshness tuple (timestamps, commit
 * hashes), so the rendered matrix is deterministic across builds.
 */

const EXAMPLES_DIR = path.join(process.cwd(), "examples");

export type ClaimCounts = {
  verified: number;
  declared: number;
  needsVerification: number;
  failed: number;
  total: number;
};

export type SelfProofRow = {
  mission: string;
  file: string;
  /** Lowercased file stem; also the /examples/<slug> and /api/proof?mission=<slug> key. */
  slug: string;
  claims: ClaimCounts;
  tests: { passed: number; total: number };
  errors: number;
  warnings: number;
  /** Non-null when the source failed to parse; all other fields are zeroed. */
  parseError: string | null;
};

export type SelfProofMatrix = {
  compilerVersion: string;
  exampleCount: number;
  rows: SelfProofRow[];
  totals: {
    claims: ClaimCounts;
    tests: { passed: number; total: number };
    errors: number;
    warnings: number;
    parseErrors: number;
  };
};

export type Obligation = { verify?: string[] };
export type ObligationAst = { guarantees?: Obligation[]; neverRules?: Obligation[] };

export type ClaimStatus = "verified" | "declared" | "needsVerification" | "failed";

/**
 * Resolve each guarantee/never claim against the specific in-file test that
 * verifies it. Mirrors resolveObligations in compiler/src/cli.mjs so the site
 * and `thunder prove` agree per claim.
 */
export function claimStatuses(ast: ObligationAst, testResults: { target: string; pass: boolean }[]): ClaimStatus[] {
  const testPass = new Map<string, boolean>();
  for (const res of testResults) {
    const cur = testPass.get(res.target);
    testPass.set(res.target, cur === undefined ? !!res.pass : cur && !!res.pass);
  }
  const norm = (s: unknown) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const matchTest = (verifyText: string): { name: string; pass: boolean } | null => {
    const v = norm(verifyText);
    if (!v) return null;
    for (const [name, pass] of testPass) {
      const n = norm(name);
      if (n && (n === v || n.includes(v) || v.includes(n))) return { name, pass };
    }
    return null;
  };
  const statusOf = (o: Obligation): ClaimStatus => {
    const verify = o.verify || [];
    if (!verify.length) return "needsVerification";
    let m: { name: string; pass: boolean } | null = null;
    for (const vt of verify) {
      const x = matchTest(vt);
      if (x) {
        m = x;
        if (!x.pass) break;
      }
    }
    if (m) return m.pass ? "verified" : "failed";
    return "declared";
  };
  return [...(ast.guarantees || []), ...(ast.neverRules || [])].map(statusOf);
}

function emptyClaims(): ClaimCounts {
  return { verified: 0, declared: 0, needsVerification: 0, failed: 0, total: 0 };
}

/** Every tracked example, run through the real compiler. Deterministic; safe in `next build`. */
export function buildSelfProofMatrix(): SelfProofMatrix {
  const files = fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".thunder"))
    .sort((a, b) => a.localeCompare(b));

  const rows: SelfProofRow[] = files.map((file) => {
    const stem = file.replace(/\.thunder$/, "");
    const base = {
      mission: stem,
      file,
      slug: stem.toLowerCase(),
      claims: emptyClaims(),
      tests: { passed: 0, total: 0 },
      errors: 0,
      warnings: 0,
      parseError: null as string | null,
    };
    try {
      const source = fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8");
      const ast = parseIntent(source);
      const diagnostics = semanticDiagnostics(ast);
      const tests = runTests(ast);
      const statuses = claimStatuses(ast as ObligationAst, tests.results);
      const claims = emptyClaims();
      for (const s of statuses) {
        claims[s] += 1;
        claims.total += 1;
      }
      return {
        ...base,
        mission: typeof ast.mission === "string" && ast.mission ? ast.mission : stem,
        claims,
        tests: { passed: tests.passed, total: tests.total },
        errors: diagnostics.filter((d) => d.level === "error").length,
        warnings: diagnostics.filter((d) => d.level === "warning").length,
      };
    } catch (e) {
      return { ...base, parseError: e instanceof Error ? e.message : "parse failed" };
    }
  });

  const totals = {
    claims: emptyClaims(),
    tests: { passed: 0, total: 0 },
    errors: 0,
    warnings: 0,
    parseErrors: 0,
  };
  for (const r of rows) {
    totals.claims.verified += r.claims.verified;
    totals.claims.declared += r.claims.declared;
    totals.claims.needsVerification += r.claims.needsVerification;
    totals.claims.failed += r.claims.failed;
    totals.claims.total += r.claims.total;
    totals.tests.passed += r.tests.passed;
    totals.tests.total += r.tests.total;
    totals.errors += r.errors;
    totals.warnings += r.warnings;
    if (r.parseError) totals.parseErrors += 1;
  }

  return {
    compilerVersion: COMPILER_VERSION,
    exampleCount: rows.length,
    rows,
    totals,
  };
}
