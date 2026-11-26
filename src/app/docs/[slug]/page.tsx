import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DraftNote } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { getDoc, getDocSlugs, getDocList, getDocCategories } from "@/lib/docs";
import { DocCopy } from "@/components/DocCopy";

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
    description: `${doc.label}: ThunderLang documentation.`,
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
    <section className="py-14 sm:py-16">
      <div className="mx-auto w-full max-w-[1280px] px-6 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px]">
        {/* Sidebar: all guides */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Link href="/docs" className="text-sm link-muted">
            ← Docs overview
          </Link>
          <nav className="mt-6 space-y-5">
            {getDocCategories().map((cat) => (
              <div key={cat.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-500">
                  {cat.title}
                </p>
                <div className="mt-2 space-y-1">
                  {cat.docs.map((d) => (
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
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Rendered markdown */}
        <div className="min-w-0 max-w-[46rem]">
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
          <DocCopy />

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

        {/* On this page: the doc's sections, for long references. */}
        {doc.headings.length > 2 && (
          <nav aria-label="On this page" className="hidden xl:block xl:sticky xl:top-24 xl:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-500">On this page</p>
            <ul className="mt-3 max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto border-l border-white/8 [scrollbar-width:thin]">
              {doc.headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-[13px] leading-snug text-haze-400 hover:border-haze-300 hover:text-haze-100 aria-[current]:border-[#b49bff] aria-[current]:text-white">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      </div>
    </section>
  );
}
