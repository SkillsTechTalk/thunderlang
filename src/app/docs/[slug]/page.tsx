import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section, DraftNote } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { getDoc, getDocSlugs, getDocList } from "@/lib/docs";

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const doc = getDoc(params.slug);
  if (!doc) return pageMeta({ title: "Docs", description: "", path: "/docs" });
  return pageMeta({
    title: doc.label,
    description: `${doc.label}: IntentLang documentation.`,
    path: `/docs/${params.slug}`,
  });
}

export default function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDoc(params.slug);
  if (!doc) notFound();

  const all = getDocList();
  const idx = all.findIndex((d) => d.slug === params.slug);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
        {/* Sidebar: all guides */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Link href="/docs" className="text-sm link-muted">
            ← Docs overview
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">
            Guides
          </p>
          <nav className="mt-4 space-y-1.5">
            {all.map((d) => (
              <Link
                key={d.slug}
                href={`/docs/${d.slug}`}
                className={`block rounded-md px-2 py-1 text-sm ${
                  d.slug === params.slug
                    ? "bg-white/[0.06] text-white"
                    : "text-haze-300 hover:text-haze-100"
                }`}
              >
                {d.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Rendered markdown */}
        <div className="min-w-0 max-w-prose">
          <div className="mb-6">
            <DraftNote>
              Draft documentation. Syntax and behavior are illustrative and will
              change before v1.
            </DraftNote>
          </div>
          <article
            className="doc-prose"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          <div className="mt-12 flex items-center justify-between gap-4 border-t border-white/8 pt-6 text-sm">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="link-muted">
                ← {prev.label}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`} className="link-muted">
                {next.label} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
