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
  { key: "cli", name: "The thunder CLI", status: "available", blurb: "Install @skillstech/thunderlang and run check, run, test, prove, conform, lift, build, scan, and more (intent stays as a legacy alias)." },
  { key: "parser", name: "Parser + Intent IR", status: "available", blurb: "Deterministic parse into the canonical intent-graph-v1 / intent-ir-v1." },
  { key: "decisions", name: "Executable decisions", status: "available", blurb: "Run decision tables with a full first-hit trace, no code generated." },
  { key: "lifecycles", name: "Lifecycles + temporal", status: "available", blurb: "Walk a state machine and reject illegal transitions." },
  { key: "tests", name: "In-file tests", status: "available", blurb: "case / scenario blocks run by thunder test; the spec proves itself." },
  { key: "scanner", name: "Intent Scanner + Fable", status: "available", blurb: "Scan a project into explainable, risk-grouped findings. No AI, no key." },
  { key: "comprehension", name: "Comprehension level C0..C7", status: "available", blurb: "Measure how well-understood each mission is, from Unknown to Governed." },
  { key: "codegen", name: "Code generation (4 targets)", status: "available", blurb: "thunder gen --target typescript|csharp|java|python emits a typed contract + real decision logic + honest TODO stubs." },
  { key: "targetExec", name: "Cross-language conformance", status: "available", blurb: "thunder test --target ... and --all-targets compile the generated decision and run it for real (TypeScript, Python, C#, Java), grading it against the intent." },
  { key: "prove", name: "Proof + verification", status: "available", blurb: "thunder prove emits intent-proof-v1 with per-claim verdicts + freshness; thunder verify marks a proof STALE when code, deps, or the compiler move." },
  { key: "atlasCli", name: "Intent Atlas (CLI)", status: "available", blurb: "Navigate many missions with thunder atlas / index. No AI." },
  { key: "editor", name: "Editor + Language Server", status: "available", blurb: "thunder lsp gives diagnostics, completion, and hover over LSP, with a VS Code extension in editors/vscode." },
  { key: "mcp", name: "MCP server for AI agents", status: "available", blurb: "thunder mcp exposes check, lift, verify-diff, prove, conform, and drift so an agent can drive the verify-real-code loop." },
  { key: "codeToIntent", name: "Code to candidate intent", status: "experimental", blurb: "thunder lift infers a humble .thunder draft from 14 languages (TypeScript, Python, Java, C#, Go, Rust, Kotlin, Scala, Elixir, and more); always human-reviewed." },
  { key: "visualAtlas", name: "Visual Intent Atlas", status: "experimental", blurb: "An interactive map ships at /atlas (lifted-intent + proof-status views); the CLI graph (thunder atlas / index) is available today." },
  { key: "intentEngine", name: "Intent Engine (AI assist)", status: "planned", blurb: "Optional, traced, human-approved prompt-to-intent and generation. Deterministic core needs no model." },
];

export const byStatus = (status: CapabilityStatus) => CAPABILITIES.filter((c) => c.status === status);
