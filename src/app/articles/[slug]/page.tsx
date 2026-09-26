import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Marked } from "marked";
import { Section } from "@/components/ui";
import { absoluteUrl } from "@/lib/site";
import { getArticle } from "@/lib/articles";

export const revalidate = 3600;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (value: string) => /^(https:\/\/|\/(?!\/))/.test(value) ? escapeHtml(value) : "";
const markdown = new Marked({ renderer: {
  html(token) { return escapeHtml(token.text); },
  link(token) { const href = safeUrl(token.href); const text = this.parser.parseInline(token.tokens); return href ? `<a href="${href}">${text}</a>` : text; },
  image(token) { const src = safeUrl(token.href); return src ? `<img src="${src}" alt="${escapeHtml(token.text)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;border-radius:14px">` : ""; },
} });

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const a = await getArticle(params.slug);
  if (!a) return { title: "Article not found" };
  const canonical = absoluteUrl(`/articles/${a.slug}`);
  return {
    title: a.title,
    description: a.description,
    keywords: a.keywords,
    alternates: { canonical },
    robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
    openGraph: { images: a.images?.map(image => ({ url: image.url, alt: image.alt, width: image.width, height: image.height })), title: a.title, description: a.description, type: "article", url: canonical },
    twitter: { images: a.images?.map(image => image.url), card: "summary_large_image", title: a.title, description: a.description },
  };
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const a = await getArticle(params.slug);
  if (!a) notFound();

  const html = markdown.parse(a.content || "") as string;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.published_date,
    ...(a.images?.length ? { image: a.images.map(image => image.url) } : {}),
    author: { "@type": "Organization", name: a.author || "SkillsTech" },
    publisher: { "@type": "Organization", name: "ThunderLang" },
    url: absoluteUrl(`/articles/${a.slug}`),
    mainEntityOfPage: absoluteUrl(`/articles/${a.slug}`),
  };

  return (
    <Section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-prose">
        <Link href="/articles" className="text-sm link-muted">
          &larr; All articles
        </Link>
        <div className="mb-6 mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">
            {a.category}
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{a.title}</h1>
          <div className="mt-3 text-xs text-haze-500">
            {a.read_minutes} min read
            {a.published_date ? ` · ${new Date(a.published_date).toISOString().slice(0, 10)}` : ""}
            {a.author ? ` · ${a.author}` : ""}
          </div>
        </div>
        <div className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Section>
  );
}
