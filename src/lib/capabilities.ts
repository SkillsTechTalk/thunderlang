// The single source of truth for what ThunderLang can do TODAY. Every status label on the site
// , homepage, roadmap, docs badges, example cards, playground , should derive from this manifest,
// so the site can never again tell three different stories about what exists.
//
// Honesty rule: a capability is only "available" if it ships in the compiler and is tested.
// "experimental" = shipped but inferred/incomplete. "concept-preview" = demonstrable but not a
// contract. "planned" = designed, not built.

export type CapabilityStatus = "available" | "experimental" | "concept-preview" | "planned";

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  available: "Available",
  experimental: "Experimental",
  "concept-preview": "Concept preview",
  planned: "Planned",
};

// Tailwind classes per status (used by the StatusBadge).
export const STATUS_STYLE: Record<CapabilityStatus, string> = {
  available: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  experimental: "border-gold-400/30 bg-gold-400/10 text-gold-300",
  "concept-preview": "border-sky-400/30 bg-sky-400/10 text-sky-300",
  planned: "border-white/15 bg-white/5 text-haze-400",
};

export interface Capability {
  key: string;
  name: string;
  status: CapabilityStatus;
  blurb: string;
}

// Verified against the compiler in this repo (deterministic, tested).
export const CAPABILITIES: Capability[] = [
  { key: "cli", name: "The intent CLI", status: "available", blurb: "Install @skillstech/thunderlang and run check, run, test, build, scan, and more." },
  { key: "parser", name: "Parser + Intent IR", status: "available", blurb: "Deterministic parse into the canonical intent-graph-v1 / intent-ir-v1." },
  { key: "decisions", name: "Executable decisions", status: "available", blurb: "Run decision tables with a full first-hit trace, no code generated." },
  { key: "lifecycles", name: "Lifecycles + temporal", status: "available", blurb: "Walk a state machine and reject illegal transitions." },
  { key: "tests", name: "In-file tests", status: "available", blurb: "case / scenario blocks run by intent test; the spec proves itself." },
  { key: "scanner", name: "Intent Scanner + Fable", status: "available", blurb: "Scan a project into explainable, risk-grouped findings. No AI, no key." },
  { key: "comprehension", name: "Comprehension level C0..C7", status: "available", blurb: "Measure how well-understood each mission is, from Unknown to Governed." },
  { key: "codegenTs", name: "TypeScript code generation", status: "available", blurb: "intent gen emits a typed contract + real decision logic + honest TODO stubs." },
  { key: "atlasCli", name: "Intent Atlas (CLI)", status: "available", blurb: "Navigate many missions with intent atlas / index. No AI." },
  { key: "proof", name: "Proof artifacts", status: "available", blurb: "intent build emits .thunder-proof.json: the source hash + every claim's status." },
  { key: "editor", name: "Editor + Language Server", status: "available", blurb: "intent lsp gives diagnostics, completion, and hover over LSP." },
  { key: "codeToIntent", name: "Code to candidate intent", status: "experimental", blurb: "intent lift infers a humble .thunder draft from 11 languages (TypeScript, Python, Java, C#, Go, Rust, and more); always human-reviewed." },
  { key: "codegenOther", name: "C# / Java code generation", status: "available", blurb: "intent gen --target csharp|java emits typed records + real decision logic + honest TODO stubs, the same adapter shape as TypeScript. Live compile/run needs a JDK or .NET SDK." },
  { key: "visualAtlas", name: "Visual Intent Atlas", status: "experimental", blurb: "An interactive map ships at /atlas (lifted-intent + proof-status views); the CLI graph (intent atlas / index) is available today." },
  { key: "intentEngine", name: "Intent Engine (AI assist)", status: "planned", blurb: "Optional, traced, human-approved prompt-to-intent and generation. Deterministic core needs no model." },
];

export const byStatus = (status: CapabilityStatus) => CAPABILITIES.filter((c) => c.status === status);
