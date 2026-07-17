// Inspectable, honest credibility signals , the review's "show proof the project is real"
// point. Kept as round, floor-phrased numbers so they stay true as the compiler grows.
// Verified 2026-07-13 against the compiler in this repo.

export const PROJECT_FACTS: { value: string; label: string; href?: string }[] = [
  { value: "500+", label: "compiler tests, all passing" },
  { value: "41", label: "canonical Intent Graph node types" },
  { value: "60+", label: "explainable diagnostics", href: "/docs/diagnostics" },
  { value: "23", label: "worked examples", href: "/examples" },
  { value: "10", label: "export formats (DMN, BPMN, OpenAPI, ...)" },
  { value: "v0.1.1", label: "pre-1.0, deterministic, no AI required" },
];

export const NPM_PACKAGE = "@skillstech/thunderlang";
