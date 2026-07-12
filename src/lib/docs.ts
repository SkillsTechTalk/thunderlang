import fs from "fs";
import path from "path";
import { marked } from "marked";

/**
 * Reads the language docs (docs/*.md) and examples (examples/*.intent) from the
 * repo at build time and exposes them for static site routes. These are
 * first-party, trusted files, so rendered Markdown HTML is safe to inject.
 */

const DOCS_DIR = path.join(process.cwd(), "docs");
const EXAMPLES_DIR = path.join(process.cwd(), "examples");

// Curated reading order + friendly labels for the docs index.
const DOC_ORDER = [
  "manifesto",
  "getting-started",
  "syntax-overview",
  "spec",
  "tutorial",
  "ai-age-best-practices",
  "mission-atlas",
  "large-changes",
  "mission-chains",
  "build-session-digest",
  "semantic-diff",
  "proof-matrix",
  "risk-radar",
  "mvp-readiness",
  "ai-generated-missions",
  "ai-implementations",
  "intent-graph",
  "intent-runtime",
  "intent-tests",
  "outcome-contracts",
  "style-intent",
  "governance",
  "data-privacy",
  "export-adapters",
  "import-adapters",
  "graph-to-source",
  "schema-migrations",
  "editor-support",
  "release-story-tutorial",
  "compiler-contract",
  "ecosystem-brief",
  "operating-checklist",
];

const DOC_LABELS: Record<string, string> = {
  manifesto: "Manifesto",
  "getting-started": "Getting started",
  "syntax-overview": "Syntax overview",
  spec: "Language specification",
  tutorial: "Tutorial",
  "ai-age-best-practices": "AI-age best practices",
  "mission-atlas": "Mission Atlas",
  "large-changes": "Working with large changes",
  "mission-chains": "Mission chains",
  "build-session-digest": "Build Session Digest",
  "semantic-diff": "Semantic Diff",
  "proof-matrix": "Proof Matrix",
  "risk-radar": "Risk Radar",
  "mvp-readiness": "MVP Readiness",
  "ai-generated-missions": "AI-generated missions",
  "ai-implementations": "AI implementations",
  "intent-graph": "Intent for every role",
  "intent-runtime": "The Intent Runtime: executable intent",
  "intent-tests": "Tests as a first-class construct",
  "outcome-contracts": "Outcome contracts",
  "style-intent": "Style intent",
  governance: "Governance and waivers",
  "data-privacy": "Data purpose and privacy",
  "export-adapters": "Export adapters (DMN, BPMN, model checking)",
  "import-adapters": "Import adapters (round-trip from DMN, BPMN)",
  "graph-to-source": "Graph to source (native round-trip)",
  "schema-migrations": "Schema migrations",
  "editor-support": "Editor support (Language Server)",
  "release-story-tutorial": "Tutorial: 200 missions to a release",
  "compiler-contract": "Compiler contract",
  "ecosystem-brief": "Ecosystem brief",
  "operating-checklist": "Operating checklist",
};

const DOC_BLURBS: Record<string, string> = {
  manifesto: "Why IntentLang exists, and prompt vs durable intent.",
  "getting-started": "Ten minutes from install to running, testing, and gating intent.",
  "syntax-overview": "The keywords, three layers, types, and blocks.",
  spec: "Draft language specification: lexical rules and constructs.",
  tutorial: "Write your first mission, step by step.",
  "ai-age-best-practices": "Ten practices for building software with AI in the loop.",
  "mission-atlas": "A semantic map of many missions, from product to proof.",
  "large-changes": "The hub for navigating many missions. Links every scaling concept.",
  "mission-chains": "Connected missions that form one end-to-end flow.",
  "build-session-digest": "What changed this session, expressed in intent.",
  "semantic-diff": "A diff by meaning, plus a deterministic three-way semantic merge.",
  "proof-matrix": "Verification status across many missions, at a glance.",
  "risk-radar": "Which missions to review first, ranked by risk.",
  "mvp-readiness": "demo_safe to production_ready: can this ship, and what blocks it.",
  "ai-generated-missions": "Keeping dozens of agent-authored missions reviewable.",
  "ai-implementations": "Intentionally deferred, verifiable AI implementations (intent-ai-v1).",
  "intent-graph": "One intent for Product, UX, and engineering (intent-graph-v1).",
  "intent-runtime": "Run decisions and simulate lifecycles deterministically, with no AI and no generated code.",
  "intent-tests": "Declare cases and scenarios inside a .intent file and run them with intent test.",
  "outcome-contracts": "Bind an outcome to a target and check whether the result met the commitment.",
  "style-intent": "Declare brand and visual language against a canonical, lockable token space.",
  governance: "Governed exceptions: waive a blocker on the record, with an owner and an expiry.",
  "data-privacy": "Purpose, retention, and lawful basis for sensitive data, enforced by the compiler.",
  "export-adapters": "Render decisions and lifecycles to DMN, BPMN, and NuSMV for existing tooling.",
  "import-adapters": "Lift existing DMN tables and BPMN processes back into runnable intent, round-trip.",
  "graph-to-source": "Regenerate editable .intent source from an Intent Graph, closing the native round-trip.",
  "schema-migrations": "Upgrade persisted graphs across schema versions, deterministically.",
  "editor-support": "A Language Server so any editor gets diagnostics, completion, and hover.",
  "release-story-tutorial": "From 200 missions to one Release Story, step by step.",
  "compiler-contract": "The deterministic pipeline from source to proof.",
  "ecosystem-brief": "How each SkillsTech sibling uses IntentLang.",
  "operating-checklist": "The Top 100 things IntentLang must do, mapped to status.",
};

marked.setOptions({ gfm: true });

export type DocMeta = { slug: string; label: string; blurb: string };

export function getDocSlugs(): string[] {
  const present = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
  // Curated order first, then any extras alphabetically.
  const ordered = DOC_ORDER.filter((s) => present.includes(s));
  const extras = present.filter((s) => !DOC_ORDER.includes(s)).sort();
  return [...ordered, ...extras];
}

export function getDocList(): DocMeta[] {
  return getDocSlugs().map((slug) => ({
    slug,
    label: DOC_LABELS[slug] ?? slug,
    blurb: DOC_BLURBS[slug] ?? "",
  }));
}

export function getDoc(slug: string): { label: string; html: string } | null {
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const html = marked.parse(raw) as string;
  return { label: DOC_LABELS[slug] ?? slug, html };
}

export type ExampleMeta = { slug: string; filename: string; title: string };

/** examples/CreateInvoice.intent -> slug "createinvoice". */
export function getExampleList(): ExampleMeta[] {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".intent"))
    .map((filename) => {
      const stem = filename.replace(/\.intent$/, "");
      return { slug: stem.toLowerCase(), filename, title: stem };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getExample(
  slug: string,
): { filename: string; title: string; code: string } | null {
  const match = getExampleList().find((e) => e.slug === slug);
  if (!match) return null;
  const code = fs.readFileSync(path.join(EXAMPLES_DIR, match.filename), "utf8");
  return { filename: match.filename, title: match.title, code };
}
