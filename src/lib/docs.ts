import fs from "fs";
import path from "path";
import { marked } from "marked";

/**
 * Reads the language docs (docs/*.md) and examples (examples/*.thunder) from the
 * repo at build time and exposes them for static site routes. These are
 * first-party, trusted files, so rendered Markdown HTML is safe to inject.
 */

const DOCS_DIR = path.join(process.cwd(), "docs");
const EXAMPLES_DIR = path.join(process.cwd(), "examples");

// Curated reading order + friendly labels for the docs index.
const DOC_ORDER = [
  "manifesto",
  "intent-oriented-programming",
  "language-principles",
  "getting-started",
  "adopting-thunderlang",
  "verifying-ai-changes",
  "runtime-enforcement",
  "intent-scanner",
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
  "ai-assist",
  "twelve-factor-agents",
  "intent-graph",
  "intent-runtime",
  "intent-tests",
  "testing-and-verification",
  "outcome-contracts",
  "style-intent",
  "governance",
  "data-privacy",
  "export-adapters",
  "import-adapters",
  "graph-to-source",
  "schema-migrations",
  "editor-support",
  "structured-editing",
  "diagnostics",
  "release-story-tutorial",
  "compiler-contract",
  "ecosystem-brief",
  "ecosystem-current-state",
  "single-compiler",
  "certification",
  "operating-checklist",
];

const DOC_LABELS: Record<string, string> = {
  manifesto: "Manifesto",
  "intent-oriented-programming": "Intent-oriented programming",
  "language-principles": "Language principles",
  "getting-started": "Getting started",
  "adopting-thunderlang": "Adopting on an existing codebase",
  "verifying-ai-changes": "Verifying AI code changes",
  "runtime-enforcement": "Runtime enforcement",
  "intent-scanner": "Intent Scanner and Fable",
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
  "ai-assist": "Optional AI assist",
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
  "structured-editing": "Structured editing and sync",
  "diagnostics": "Diagnostics catalog",
  "release-story-tutorial": "Tutorial: 200 missions to a release",
  "compiler-contract": "Compiler contract",
  "ecosystem-brief": "Ecosystem brief",
  "ecosystem-current-state": "Ecosystem current-state map",
  "single-compiler": "One compiler, five consumers",
  certification: "Certification track",
  "operating-checklist": "Operating checklist",
};

const DOC_BLURBS: Record<string, string> = {
  manifesto: "Why ThunderLang exists, and prompt vs durable intent.",
  "intent-oriented-programming": "The paradigm above OOP and FP: build around meaning, prove the code still honors it.",
  "language-principles": "The ten design rules the language holds itself to.",
  "getting-started": "Ten minutes from install to running, testing, and gating intent.",
  "adopting-thunderlang": "Bring intent to a codebase you already have: lift, review, check, gate, and keep in sync.",
  "verifying-ai-changes": "Gate an AI-proposed code change against the intent it must uphold, deterministically.",
  "runtime-enforcement": "Compile intent into a guard that blocks forbidden actions and redacts secrets at runtime.",
  "intent-scanner": "Scan a project into Intent IR and explainable Fable findings grouped by risk.",
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
  "ai-assist": "Where optional, gated AI helps, and where the compiler already does the work.",
  "intent-graph": "One intent for Product, UX, and engineering (intent-graph-v1).",
  "intent-runtime": "Run decisions and simulate lifecycles deterministically, with no AI and no generated code.",
  "intent-tests": "Declare cases and scenarios inside a .thunder file and run them with intent test.",
  "outcome-contracts": "Bind an outcome to a target and check whether the result met the commitment.",
  "style-intent": "Declare brand and visual language against a canonical, lockable token space.",
  governance: "Governed exceptions: waive a blocker on the record, with an owner and an expiry.",
  "data-privacy": "Purpose, retention, and lawful basis for sensitive data, enforced by the compiler.",
  "export-adapters": "Render decisions and lifecycles to DMN, BPMN, and NuSMV for existing tooling.",
  "import-adapters": "Lift existing DMN tables and BPMN processes back into runnable intent, round-trip.",
  "graph-to-source": "Regenerate editable .thunder source from an Intent Graph, closing the native round-trip.",
  "schema-migrations": "Upgrade persisted graphs across schema versions, deterministically.",
  "editor-support": "A Language Server so any editor gets diagnostics, completion, and hover.",
  "structured-editing": "Edit intent as structured fields and sync back to source, comments intact.",
  "diagnostics": "Every canonical diagnostic code, its severity, and what it blocks.",
  "release-story-tutorial": "From 200 missions to one Release Story, step by step.",
  "compiler-contract": "The deterministic pipeline from source to proof.",
  "ecosystem-brief": "How each SkillsTech sibling uses ThunderLang.",
  "ecosystem-current-state": "Grounded inventory of the ecosystem: what exists, what is duplicated, what ThunderLang owns.",
  "single-compiler": "The universal /core surface OpenThunder, Repo Mastery, Studio, Mobile, and the CLI all share.",
  certification: "The Intent-Oriented Programming Associate credential, and how intent backs it.",
  "operating-checklist": "The Top 100 things ThunderLang must do, mapped to status.",
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

// Docs grouped into task-oriented sections (the review's information architecture), so a
// first-time visitor knows where to start instead of facing one long list.
const DOC_CATEGORIES: { title: string; blurb: string; slugs: string[] }[] = [
  {
    title: "Start here",
    blurb: "The mental model and your first ten minutes.",
    slugs: ["manifesto", "intent-oriented-programming", "getting-started", "tutorial", "adopting-thunderlang", "verifying-ai-changes"],
  },
  {
    title: "Understand the language",
    blurb: "The syntax and the constructs you write.",
    slugs: ["syntax-overview", "language-principles", "intent-runtime", "intent-tests", "outcome-contracts", "data-privacy", "style-intent", "governance"],
  },
  {
    title: "Understand software",
    blurb: "Scan, map, and reason about existing and AI-written code.",
    slugs: ["intent-scanner", "ai-assist", "semantic-diff", "risk-radar", "mission-atlas", "mission-chains", "ai-generated-missions"],
  },
  {
    title: "Build and verify",
    blurb: "From source to proof, editor, and adapters.",
    slugs: ["runtime-enforcement", "compiler-contract", "proof-matrix", "editor-support", "structured-editing", "graph-to-source", "export-adapters", "import-adapters", "schema-migrations"],
  },
  {
    title: "Scale across a system",
    blurb: "Navigate many missions and large changes.",
    slugs: ["large-changes", "build-session-digest", "mvp-readiness", "release-story-tutorial"],
  },
  {
    title: "Reference",
    blurb: "The exhaustive specification and catalogs.",
    slugs: ["spec", "diagnostics", "intent-graph", "single-compiler", "ai-age-best-practices", "operating-checklist"],
  },
  {
    title: "Ecosystem",
    blurb: "How ThunderLang fits the wider SkillsTech ecosystem.",
    slugs: ["ecosystem-brief", "ecosystem-current-state", "certification"],
  },
  {
    title: "Experimental and forward-looking",
    blurb: "Designed and in progress. Read as direction, not a contract.",
    slugs: ["ai-implementations"],
  },
];

export type DocCategory = { title: string; blurb: string; docs: DocMeta[] };

/** The docs grouped into sections; any doc not placed in a category lands in "More guides". */
export function getDocCategories(): DocCategory[] {
  const all = getDocList();
  const bySlug = new Map(all.map((d) => [d.slug, d]));
  const placed = new Set<string>();
  const cats: DocCategory[] = DOC_CATEGORIES.map((c) => ({
    title: c.title,
    blurb: c.blurb,
    docs: c.slugs.map((s) => bySlug.get(s)).filter((d): d is DocMeta => Boolean(d)),
  }));
  for (const c of DOC_CATEGORIES) for (const s of c.slugs) placed.add(s);
  const extras = all.filter((d) => !placed.has(d.slug));
  if (extras.length) cats.push({ title: "More guides", blurb: "", docs: extras });
  return cats.filter((c) => c.docs.length > 0);
}

export function getDoc(slug: string): { label: string; html: string } | null {
  const file = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const html = marked.parse(raw) as string;
  return { label: DOC_LABELS[slug] ?? slug, html };
}

export type ExampleStatus = "runnable" | "compiler-valid";
export type ExampleMeta = { slug: string; filename: string; title: string; runnable: boolean; status: ExampleStatus };

/** examples/CreateInvoice.thunder -> slug "createinvoice". */
export function getExampleList(): ExampleMeta[] {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".thunder"))
    .map((filename) => {
      const stem = filename.replace(/\.thunder$/, "");
      // Every tracked example is compiler-valid (CI gates it). Those with an in-file `test`
      // block are runnable end to end with `thunder test`.
      const code = fs.readFileSync(path.join(EXAMPLES_DIR, filename), "utf8");
      const runnable = /^test\s+\w/m.test(code);
      return {
        slug: stem.toLowerCase(),
        filename,
        title: stem,
        runnable,
        status: (runnable ? "runnable" : "compiler-valid") as ExampleStatus,
      };
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
