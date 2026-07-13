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
    slug: "introducing-intent",
    title: "Introducing IntentLang: understand and control AI-era software",
    date: "2026-07-09",
    tag: "Announcement",
    excerpt:
      "Why we are building a new Intent-Oriented Programming language and software-understanding system, and what we are deliberately not claiming yet.",
    body: [
      "Editorial update (2026-07-13): an earlier version of this post said IntentLang had no released compiler or CLI. That is out of date. The deterministic compiler and the `intent` CLI now exist and are tested: you can install `@skillstech/intentlang`, run decisions and lifecycles, scan a project, generate a TypeScript scaffold, and emit proof artifacts. See What works today on the homepage for the current, honestly-labeled status of every capability.",
      "IntentLang is a new Intent-Oriented Programming language and software-understanding system from SkillsTech. Its premise is simple: as AI writes more of our code, the scarce and valuable thing becomes a clear, verifiable statement of what the software should do, and the ability to recover that meaning from code that already exists.",
      "Traditional languages ask you to commit to the how first. The intent behind a system (its goals, its constraints, its guarantees) ends up scattered across code, comments, and tickets. Intent-Oriented Programming makes that intent the primary artifact: structured, reviewable, checkable, and , with the compiler , executable and provable.",
      "We stay honest about where this is. The language and its schemas are pre-1.0 and can still change. It is not production-ready, it is not magic, and it does not claim to outperform the languages you ship today. It targets them, and it helps you understand and verify them.",
      "What we believe is that engineers and teams deserve a better way to express, understand, and own software in an era where machines generate it faster than humans can review it. That is the problem IntentLang exists to solve, and we are building it in the open.",
      "If that resonates, try the Playground, install the CLI, and follow along. The best time to shape a language is before v1.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
