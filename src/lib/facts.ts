// Inspectable, honest credibility signals , the review's "show proof the project is real"
// point. Kept as round, floor-phrased numbers so they stay true as the compiler grows.
// Verified 2026-07-20 against the compiler in this repo.

export const PROJECT_FACTS: { value: string; label: string; href?: string }[] = [
  // The living version of this claim: /proof is generated from the repo's own
  // missions by the shipped compiler at build time, and CI gates it (intent:prove).
  { value: "Open source", label: "Apache 2.0 compiler", href: "/license" },
  { value: "Live evidence", label: "example tests and unresolved claims", href: "/proof" },
  { value: "No API key", label: "deterministic policy tests", href: "/docs/intent-tests" },
  { value: "Pre-1.0", label: "check installed version with thunder --version", href: "/docs/getting-started" },
];

export const NPM_PACKAGE = "@skillstech/thunderlang";
