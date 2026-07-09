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
    title: "Introducing IntentLang: programming for the AI era",
    date: "2026-07-09",
    tag: "Announcement",
    excerpt:
      "Why we are building the first Intent-Oriented Programming language, and what we are deliberately not claiming yet.",
    body: [
      "IntentLang is a new programming language from SkillsTech. Its premise is simple: as AI writes more of our code, the scarce and valuable thing becomes a clear, verifiable statement of what the software should do.",
      "Traditional languages ask you to commit to the how first. The intent behind a system (its goals, its constraints, its guarantees) ends up scattered across code, comments, and tickets. Intent-Oriented Programming makes that intent the primary artifact: structured, reviewable, and checkable.",
      "We want to be honest about where this is. IntentLang has no released compiler or CLI. The syntax you see on this site is a draft. It is not production-ready, it is not magic, and it does not claim to outperform the languages you ship today. It targets them.",
      "What we do believe is that engineers deserve a better way to express and own software in an era where machines generate it faster than humans can review it. That is the problem IntentLang exists to solve, and we are building it in the open.",
      "If that resonates, join the waitlist and follow along. The best time to shape a language is before v1.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
