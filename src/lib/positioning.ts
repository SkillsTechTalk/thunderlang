// The status data behind the home page's "one language, every ecosystem" story. Every label is derived from the
// compiler's own constants or from CAPABILITIES, so the site can only advertise a compilation capability once it
// exists. When the compiler grows (a new reader, a new writer, a new target), these labels follow without a copy edit.
import { READ_LANGUAGES, INFRA_LANGUAGES } from "../../compiler/src/read.mjs";
import { WRITE_STEPS_LANGUAGES } from "../../compiler/src/write-steps.mjs";
import { THUNDER_VISUAL } from "../../compiler/src/visual.mjs";
import { RULE_TARGETS } from "@/lib/thunder-compile";
import { CAPABILITIES, type Capability, type CapabilityStatus } from "@/lib/capabilities";

const capability = (key: string): Capability => {
  const c = CAPABILITIES.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown capability "${key}" in src/lib/capabilities.ts`);
  return c;
};

/** Programming languages Thunder reads today (the code reader's list, without infrastructure formats). */
export const READ_PROGRAMMING = READ_LANGUAGES.filter((l) => !INFRA_LANGUAGES.includes(l) && THUNDER_VISUAL.languages[l]?.status === "available");
const nameOf = (key: string) => THUNDER_VISUAL.languages[key]?.name ?? key;
const list = (keys: readonly string[]) => {
  const names = keys.map(nameOf);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}` : names.join("");
};

/** Thunder Core (whole programs written in Thunder): the status shown on the home page's hello-world preview. */
export const CORE_STATUS: CapabilityStatus = capability("thunderCore").status;

/** What works today, and what does not yet, in the order a person meets it. */
export const CAPABILITY_ROWS: { what: string; detail: string; status: CapabilityStatus; href?: string; cta?: string; caveat?: { text: string; href: string; label: string } }[] = [
  {
    what: "Read existing code in Thunder",
    detail: `${READ_PROGRAMMING.length} languages, including ${list(["python", "typescript", "java", "csharp", "go", "rust"])}, plus infrastructure files.`,
    status: capability("thunderedRead").status,
    href: "/read",
    cta: "Read code in Thunder",
    // Honest about accuracy next to the claim: the fresh audit (docs/accuracy.md) still finds false readings on code
    // nobody has graded. Update this line when a new fresh audit is published.
    caveat: { text: "Not every reading is right yet: on code we had never graded, about 1 in 10 readings still said something false.", href: "/docs/accuracy", label: "How accurate is Thunder?" },
  },
  {
    what: "Change existing code from Thunder",
    detail: `The compiler writes and proves the patch in ${list(WRITE_STEPS_LANGUAGES)}. Other languages are handed to an AI agent and labeled AI-written.`,
    status: capability("thunderedEdit").status,
    href: "/read",
    cta: "Change a rule in code",
  },
  {
    what: "Compile decisions and rules",
    detail: `A rule written in Thunder compiles to ${list(RULE_TARGETS)}, and its examples run against the generated code.`,
    status: capability("decisionTargets").status,
    href: "/learn/write-rules",
    cta: "Write a rule",
  },
  {
    what: "Write whole programs in Thunder (Thunder Core)",
    detail: capability("thunderCore").status === "available"
      ? "Write a program in plain words, check it, and run it as Python: thunder new, run, build, and test. It can use Python libraries (Use csv as csv), written the Python way."
      : "Being built now, compiling to Python first. Not available yet.",
    status: capability("thunderCore").status,
    ...(capability("thunderCore").status === "available" ? { href: "/docs/core", cta: "Write a program" } : {}),
  },
  {
    what: "Compile Thunder Core to TypeScript",
    detail: capability("coreTypeScript").status === "available"
      ? "The same program, compiled to TypeScript and run on Node: thunder build --target typescript. Every Core test program gives the same output on Python, the Thunder engine, and TypeScript. Python modules are refused for this target."
      : "Being built: the same programs, compiled to TypeScript. Not available yet.",
    status: capability("coreTypeScript").status,
    ...(capability("coreTypeScript").status === "available" ? { href: "/docs/core", cta: "Compile to TypeScript" } : {}),
  },
  {
    what: "Compile Thunder Core to C#",
    detail: capability("coreCsharp").status === "available"
      ? "The same program, compiled to C# and run on .NET: thunder build --target csharp. Every Core test program gives the same output on Python, the Thunder engine, TypeScript, and C#. Python modules are refused for this target."
      : "Being built: the same programs, compiled to C#. Not available yet.",
    status: capability("coreCsharp").status,
    ...(capability("coreCsharp").status === "available" ? { href: "/docs/core", cta: "Compile to C#" } : {}),
  },
  {
    what: "Compile Thunder Core to Java, Go, and Rust",
    detail: "Designed, not built. Each target will be announced only when it passes the same conformance tests.",
    status: capability("coreTargets").status,
  },
];

/** The founder's architecture picture: the six ecosystems Thunder compiles to, with what works for each today. */
export type Target = {
  key: string;
  name: string;
  role: string;
  reads: boolean;
  edits: boolean;
  rules: boolean;
  program: CapabilityStatus;
};

const TARGET_ROLES: [key: string, role: string][] = [
  ["python", "AI and ML"],
  ["java", "Enterprise"],
  ["typescript", "Web"],
  ["csharp", ".NET"],
  ["go", "Cloud"],
  ["rust", "Systems"],
];

export const TARGETS: Target[] = TARGET_ROLES.map(([key, role]) => ({
  key,
  name: nameOf(key),
  role,
  reads: READ_PROGRAMMING.includes(key),
  edits: WRITE_STEPS_LANGUAGES.includes(key),
  rules: (RULE_TARGETS as readonly string[]).includes(key),
  // Thunder Core compiles to Python and TypeScript; the rest follow. Status comes from CAPABILITIES, never from copy.
  program: key === "python" ? capability("thunderCore").status : key === "typescript" ? capability("coreTypeScript").status : key === "csharp" ? capability("coreCsharp").status : capability("coreTargets").status,
}));

/** Thunder gives access to each ecosystem's libraries rather than recreating them. */
export const ECOSYSTEMS: { name: string; libraries: string[] }[] = [
  { name: "Python", libraries: ["NumPy", "pandas", "PyTorch", "TensorFlow", "FastAPI"] },
  { name: "Java", libraries: ["Spring Boot", "Hibernate", "Kafka", "Maven"] },
  { name: ".NET", libraries: ["ASP.NET Core", "Entity Framework", "Azure SDK"] },
  { name: "TypeScript", libraries: ["React", "Next.js", "Node.js", "npm"] },
  { name: "Go", libraries: ["cloud infrastructure", "Kubernetes", "networking"] },
];
