/** Blog posts as simple structured data. Bodies are arrays of paragraphs. */

export type Post = {
  slug: string;
  title: string;
  date: string;
  tag: string;
  excerpt: string;
  body: string[];
};

export const posts: Post[] = [
  {
    slug: "feature-flag-gate-case-study",
    title: "A feature-flag gate, proven across four languages",
    date: "2026-07-21",
    tag: "Case study",
    excerpt:
      "We lifted an ordinary feature-flag evaluator into intent, proved TypeScript, Python, C#, and Java all agree on it, and watched ThunderLang block an AI change that logged the override token.",
    body: [
      "Every product has a feature-flag evaluator: a kill switch, an allowlist, a percentage rollout. It is small, it gets copied between services, and when it drifts (a refactor that forgets the kill switch, an assistant that logs the override token) the blast radius is everyone. It is a perfect first mission to adopt ThunderLang on, because the logic is real, the failure is expensive, and the whole loop fits on one page.",
      "We started from an existing TypeScript evaluator and let `thunder lift` recover a humble draft, which said plainly what a human still had to decide: review the goal, mark the sensitive fields, add the never-log rules. A person then turned that draft into a contract: a disabled flag is off for everyone, an allowlisted user on an enabled flag is on, and the override token is never logged.",
      "Then we proved it. `thunder conform --all-targets` ran the same test cases against the decision compiled to TypeScript, Python, C#, and Java, and all four agreed with the semantic engine on every case. The kill switch stopped being a code-review convention and became a rule that four languages are held to, from one source of truth.",
      "Finally we let an assistant add logging. It wrote a reasonable-looking line that happened to send the override token to the logs, and `thunder verify-diff` refused the change with a BLOCK and exit code 1, naming the exact never-rule and line. No AI ran in that check; the verdict is deterministic.",
      "The evaluator was never rewritten. ThunderLang wrapped the decision the team already had, proved the targets agree, and turned do-not-log-the-token from a hope into a gate. The full walkthrough with every command and its output is in the docs at /docs/case-study-feature-flags, and the runnable files are in examples/adoption on GitHub.",
    ],
  },
  {
    slug: "introducing-intent",
    title: "Introducing ThunderLang: understand and control AI-era software",
    date: "2026-07-09",
    tag: "Announcement",
    excerpt:
      "Why we are building a new Intent-Oriented Programming language and software-understanding system, and what we are deliberately not claiming yet.",
    body: [
      "Editorial update (2026-07-13): an earlier version of this post said ThunderLang had no released compiler or CLI. That is out of date. The deterministic compiler and the `intent` CLI now exist and are tested: you can install `@skillstech/thunderlang`, run decisions and lifecycles, scan a project, generate a TypeScript scaffold, and emit proof artifacts. See What works today on the homepage for the current, honestly-labeled status of every capability.",
      "ThunderLang is a new Intent-Oriented Programming language and software-understanding system from SkillsTech. Its premise is simple: as AI writes more of our code, the scarce and valuable thing becomes a clear, verifiable statement of what the software should do, and the ability to recover that meaning from code that already exists.",
      "Traditional languages ask you to commit to the how first. The intent behind a system (its goals, its constraints, its guarantees) ends up scattered across code, comments, and tickets. Intent-Oriented Programming makes that intent the primary artifact: structured, reviewable, checkable, and , with the compiler , executable and provable.",
      "We stay honest about where this is. The language and its schemas are pre-1.0 and can still change. It is not production-ready, it is not magic, and it does not claim to outperform the languages you ship today. It targets them, and it helps you understand and verify them.",
      "What we believe is that engineers and teams deserve a better way to express, understand, and own software in an era where machines generate it faster than humans can review it. That is the problem ThunderLang exists to solve, and we are building it in the open.",
      "If that resonates, try the Playground, install the CLI, and follow along. The best time to shape a language is before v1.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
