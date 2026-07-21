import Link from "next/link";
import { PageHero, Section, Card } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { listArticles } from "@/lib/articles";

export const revalidate = 3600;

export const metadata = pageMeta({
  title: "Articles",
  description:
    "Field notes on intent-oriented development: gating AI-written code against intent, spec-driven workflows, requirements as code, and intent drift.",
  path: "/articles",
});

export default async function ArticlesPage() {
  const { articles } = await listArticles(1, 24);
  return (
    <>
      <PageHero
        eyebrow="Writing"
        title="Articles"
        intro="Field notes on intent-oriented development: gating AI-written code against intent with verify-diff, cross-language conformance, spec-driven workflows, requirements as code, and intent drift."
      />
      <Section>
        {articles.length === 0 ? (
          <p className="text-sm text-haze-400">
            No articles published yet. New pieces land here as they are written and reviewed. In the
            meantime, start with the{" "}
            <Link href="/docs/getting-started" className="text-gold-300 hover:text-gold-200">
              getting-started guide
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {articles.map((a) => (
              <Link key={a.slug} href={`/articles/${a.slug}`} className="block">
                <Card>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">
                    {a.category}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-white">{a.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-haze-300">{a.description}</p>
                  <div className="mt-3 text-xs text-haze-500">
                    {a.read_minutes} min read
                    {a.published_date ? ` · ${new Date(a.published_date).toISOString().slice(0, 10)}` : ""}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
