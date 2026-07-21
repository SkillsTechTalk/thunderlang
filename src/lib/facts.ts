// Inspectable, honest credibility signals , the review's "show proof the project is real"
// point. Kept as round, floor-phrased numbers so they stay true as the compiler grows.
// Verified 2026-07-20 against the compiler in this repo.

export const PROJECT_FACTS: { value: string; label: string; href?: string }[] = [
  // The living version of this claim: /proof is generated from the repo's own
  // missions by the shipped compiler at build time, and CI gates it (intent:prove).
  { value: "600+", label: "compiler tests, all passing", href: "/proof" },
  { value: "42", label: "canonical Intent Graph node types" },
  { value: "80+", label: "explainable diagnostics", href: "/docs/diagnostics" },
  { value: "39", label: "worked examples", href: "/examples" },
  { value: "14", label: "languages lifted to intent", href: "/docs/language-support-matrix" },
  { value: "10", label: "export formats (DMN, BPMN, OpenAPI, ...)" },
  { value: "v0.4.1", label: "pre-1.0, deterministic, no AI required" },
];

export const NPM_PACKAGE = "@skillstech/thunderlang";
