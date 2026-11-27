// The single source of truth for what ThunderLang can do TODAY. Every status label on the site
// , homepage, roadmap, docs badges, example cards, playground , should derive from this manifest,
// so the site can never again tell three different stories about what exists.
//
// Honesty rule: a capability is only "available" if it ships in the compiler and is tested.
// "experimental" = shipped but inferred/incomplete. "concept-preview" = demonstrable but not a
// contract. "coming" = being built now, not usable yet. "planned" = designed, not built.

export type CapabilityStatus = "available" | "experimental" | "concept-preview" | "coming" | "planned";

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  available: "Available",
  experimental: "Experimental",
  "concept-preview": "Concept preview",
  coming: "Coming",
  planned: "Planned",
};

// Tailwind classes per status (used by the StatusBadge).
export const STATUS_STYLE: Record<CapabilityStatus, string> = {
  available: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  experimental: "border-gold-400/30 bg-gold-400/10 text-gold-300",
  "concept-preview": "border-sky-400/30 bg-sky-400/10 text-sky-300",
  coming: "border-dashed border-gold-300/50 bg-transparent text-gold-200",
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
  { key: "tests", name: "In-file tests", status: "available", blurb: "Case and scenario blocks execute declared behavior for specific inputs through thunder test." },
  { key: "scanner", name: "Intent Scanner + Fable", status: "available", blurb: "Scan a project into explainable, risk-grouped findings. No AI, no key." },
  { key: "comprehension", name: "Comprehension level C0..C7", status: "available", blurb: "Measure how well-understood each mission is, from Unknown to Governed." },
  { key: "codegen", name: "Code generation (4 targets)", status: "available", blurb: "thunder gen --target typescript|csharp|java|python emits a typed contract + real decision logic + honest TODO stubs." },
  { key: "targetExec", name: "Cross-language conformance", status: "available", blurb: "thunder test --target ... and --all-targets compile the generated decision and run it for real (TypeScript, Python, C#, Java), grading it against the intent." },
  { key: "prove", name: "Proof + verification", status: "available", blurb: "thunder prove emits intent-proof-v1 with per-claim verdicts + freshness; thunder verify marks a proof STALE when code, deps, or the compiler move." },
  { key: "atlasCli", name: "Intent Atlas (CLI)", status: "available", blurb: "Navigate many missions with thunder atlas / index. No AI." },
  { key: "editor", name: "Editor + Language Server", status: "available", blurb: "thunder lsp gives diagnostics, completion, and hover over LSP, with a VS Code extension in editors/vscode." },
  { key: "mcp", name: "MCP server for AI agents", status: "available", blurb: "thunder mcp exposes check, lift, verify-diff, prove, conform, and drift so an agent can drive the verify-real-code loop." },
  { key: "thunderVisual", name: "Thunder visual decisions", status: "experimental", blurb: "Read, ask, and change a decision as a Thunder picture at /try; every edit reruns its examples. One decision per contract for now." },
  { key: "thunderedRead", name: "Thunder read (Thundered code)", status: "available", blurb: "Read a file or folder in Thunder at /read, with thunder read, or in OpenThunder: seventeen programming languages (compiler/src/read.mjs READ_LANGUAGES, every one marked available in THUNDER_VISUAL.languages) plus six infrastructure formats. The original code stays the source of truth." },
  { key: "codeToIntent", name: "Code to candidate intent", status: "experimental", blurb: "thunder lift infers a humble .thunder draft from 14 languages (TypeScript, Python, Java, C#, Go, Rust, Kotlin, Scala, Elixir, and more); always human-reviewed." },
  { key: "visualAtlas", name: "Visual Intent Atlas", status: "experimental", blurb: "An interactive map ships at /atlas (lifted-intent + proof-status views); the CLI graph (thunder atlas / index) is available today." },
  { key: "thunderedEdit", name: "Thunder write", status: "available", blurb: "Change existing code in Thunder: thunder write writes and proves the patch itself for TypeScript, JavaScript, Python, and Go (compiler/src/write-steps.mjs WRITE_STEPS_LANGUAGES); other languages get an instruction for an AI agent, and its result is labeled AI-written and checked the same way. At the rule level, thunder write changes a number, comparison, text value, or answer in a recovered rule, writes only those characters back, and checks the result by reading the file again. On Read in Thunder, Change a rule does the same on the page's copy of the code, with Undo. Shape changes stay Propose rule change." },
  { key: "decisionTargets", name: "Decisions and rules compiled to six languages", status: "available", blurb: "A decision written in Thunder compiles to TypeScript, Python, Go, Rust, C#, and Java (src/lib/thunder-compile.ts RULE_TARGETS), and thunder test --target runs it for real in nine languages." },
  { key: "thunderCore", name: "Thunder Core: whole programs written in Thunder", status: "available", blurb: "Write a complete program in Thunder, not only its rules, check it, and run it as Python 3.10+ (thunder new, run, build, test). Exact numbers and money. Python libraries are used with Use, written the Python way; other targets are planned." },
  { key: "coreTypeScript", name: "Thunder Core compiled to TypeScript", status: "available", blurb: "The same Thunder Core programs compile to TypeScript and run on Node (thunder build --target typescript). Every Core test program gives the same output, errors included, on Python, the Thunder engine, and compiled TypeScript, and tsc --strict accepts the code. npm packages work through Use \"<package>\" from npm as <name>, with exact decimals coming back; Python modules are refused for this target (TC405)." },
  { key: "coreCsharp", name: "Thunder Core compiled to C#", status: "available", blurb: "The same Thunder Core programs compile to C# and run on .NET 8 or newer (thunder build --target csharp). Every Core test program gives the same output, errors included, on Python, the Thunder engine, TypeScript, and compiled C#. Python modules (Use) are refused for this target; NuGet libraries are not available from Thunder yet." },
  { key: "coreRust", name: "Thunder Core compiled to Rust", status: "available", blurb: "The same Thunder Core programs compile to Rust (thunder build --target rust): a small Cargo project with a standard-library-only runtime that builds offline. Every Core test program gives the same output, errors included, on Python, the Thunder engine, TypeScript, and compiled Rust. Python modules (Use) are refused for this target; crates are not available from Thunder yet." },
  { key: "coreGo", name: "Thunder Core compiled to Go", status: "available", blurb: "The same Thunder Core programs compile to Go and run with the go toolchain (thunder build --target go): one standard-library-only module with a small runtime ported from the Thunder engine. Every Core test program gives the same output, errors included, on Python, the Thunder engine, TypeScript, and Go. Python modules (Use) are refused for this target; Go packages are not available from Thunder yet." },
  { key: "coreJava", name: "Thunder Core compiled to Java", status: "available", blurb: "The same Thunder Core programs compile to Java 17+ and run on the JVM (thunder build --target java). Every Core test program gives the same output, errors included, on Python, the Thunder engine, TypeScript, and compiled Java. Python modules (Use) are refused for this target; Maven libraries are not available from Thunder yet." },
  { key: "intentEngine", name: "Intent Engine (AI assist)", status: "planned", blurb: "Optional, traced, human-approved prompt-to-intent and generation. Deterministic core needs no model." },
];

export const byStatus = (status: CapabilityStatus) => CAPABILITIES.filter((c) => c.status === status);
