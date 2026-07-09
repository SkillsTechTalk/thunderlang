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
  "syntax-overview",
  "spec",
  "tutorial",
  "ai-age-best-practices",
  "compiler-contract",
  "ecosystem-brief",
  "operating-checklist",
];

const DOC_LABELS: Record<string, string> = {
  manifesto: "Manifesto",
  "syntax-overview": "Syntax overview",
  spec: "Language specification",
  tutorial: "Tutorial",
  "ai-age-best-practices": "AI-age best practices",
  "compiler-contract": "Compiler contract",
  "ecosystem-brief": "Ecosystem brief",
  "operating-checklist": "Operating checklist",
};

const DOC_BLURBS: Record<string, string> = {
  manifesto: "Why IntentLang exists, and prompt vs durable intent.",
  "syntax-overview": "The keywords, three layers, types, and blocks.",
  spec: "Draft language specification: lexical rules and constructs.",
  tutorial: "Write your first mission, step by step.",
  "ai-age-best-practices": "Ten practices for building software with AI in the loop.",
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
