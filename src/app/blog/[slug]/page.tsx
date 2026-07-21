import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section, Pill } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { posts, getPost } from "../posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const post = getPost(params.slug);
  if (!post) return pageMeta({ title: "Post", description: "", path: "/blog" });
  return pageMeta({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
  });
}

export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <Section>
      <article className="mx-auto max-w-prose">
        <Link href="/blog" className="text-sm link-muted">
          ← All posts
        </Link>
        <div className="mt-6 flex items-center gap-3">
          <Pill>{post.tag}</Pill>
          <span className="text-xs text-haze-400">{post.date}</span>
        </div>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {post.title}
        </h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-haze-200">
          {post.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        <div className="mt-12 border-t border-white/8 pt-6">
          <Link href="/docs/getting-started" className="btn-primary">
            Get started
          </Link>
        </div>
      </article>
    </Section>
  );
}
