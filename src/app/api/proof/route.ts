import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
// The deterministic ThunderLang compiler is a plain-ESM sibling package.
// It runs server-side with no AI. See src/compiler.d.ts for the type shape.
import { parseIntent } from "../../../../compiler/src/parse.mjs";
import { semanticDiagnostics, buildProof } from "../../../../compiler/src/emit.mjs";
import { runTests } from "../../../../compiler/src/testing.mjs";
import { sha256 } from "../../../../compiler/src/hash.mjs";
import { claimStatuses, type ClaimStatus, type ObligationAst } from "@/lib/self-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXAMPLES_DIR = path.join(process.cwd(), "examples");

// Same status mapping `thunder prove` folds into the artifact, so the download
// carries real per-claim verdicts, not just planned/needs_verification.
const CLAIM_MAP: Record<ClaimStatus, string> = {
  verified: "verified",
  failed: "failed",
  declared: "planned",
  needsVerification: "needs_verification",
};

/**
 * GET /api/proof?mission=<slug> (or ?file=<Name.thunder>)
 * Returns the live intent-proof-v1 artifact for one of this repo's own
 * example missions: the same output `thunder prove` produces.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mission = url.searchParams.get("mission") || url.searchParams.get("file") || "";
  if (!mission.trim()) {
    return NextResponse.json(
      { error: "Pass ?mission=<slug>, e.g. /api/proof?mission=alertrouting" },
      { status: 400 },
    );
  }

  // Match by lowercased file stem; tolerate a trailing .thunder. Never touch
  // the filesystem with user input beyond comparing against the real listing.
  const wanted = mission.trim().toLowerCase().replace(/\.thunder$/, "");
  const filename = fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".thunder"))
    .find((f) => f.replace(/\.thunder$/, "").toLowerCase() === wanted);
  if (!filename) {
    return NextResponse.json({ error: `No example mission matches "${mission}".` }, { status: 404 });
  }

  try {
    const source = fs.readFileSync(path.join(EXAMPLES_DIR, filename), "utf8");
    const ast = parseIntent(source) as ReturnType<typeof parseIntent> & { targets?: string[] };
    const diagnostics = semanticDiagnostics(ast);
    const tests = runTests(ast);
    const proof = buildProof(ast, {
      sourceFile: filename,
      sourceHash: sha256(source),
      targetsRequested: ast.targets || [],
      targetsGenerated: [],
      diagnostics,
      generatedAt: new Date().toISOString(),
    });
    // Fold per-claim verdicts into the proof (guarantees first, then never
    // rules, matching the AST order the statuses were computed in).
    const statuses = claimStatuses(ast as ObligationAst, tests.results);
    const all = [...proof.guarantees, ...proof.neverRules];
    all.forEach((claim, i) => {
      const s = statuses[i];
      if (s) claim.status = CLAIM_MAP[s];
    });
    const proofId = `proof-${proof.sourceHash.replace("sha256:", "").slice(0, 6)}`;
    return NextResponse.json(
      { proofId, ...proof, tests },
      {
        headers: {
          "Content-Disposition": `attachment; filename="${wanted}.thunder-proof.json"`,
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Proof failed: ${message}` }, { status: 500 });
  }
}
