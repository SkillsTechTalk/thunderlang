import Link from "next/link";
import { PageHero, Section, Pill } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { posts } from "./posts";

export const metadata = pageMeta({
  title: "Blog",
  description:
    "Notes from the team building Intent, an Intent-Oriented Programming language by SkillsTech for the AI era.",
  path: "/blog",
});

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Notes from building Intent in the open."
        intro="Design decisions, open questions, and progress as the language takes shape. Early and honest, expect thinking-in-progress, not press releases."
      />
      <Section>
        <div className="mx-auto max-w-prose space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="panel block p-6 transition-colors hover:border-white/20"
            >
              <div className="flex items-center gap-3">
                <Pill>{post.tag}</Pill>
                <span className="text-xs text-haze-400">{post.date}</span>
              </div>
              <h2 className="mt-3 text-xl font-semibold text-white">
                {post.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {post.excerpt}
              </p>
              <span className="mt-3 inline-block text-sm text-gold-300">
                Read post →
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
