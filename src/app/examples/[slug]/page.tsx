import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section, DraftNote } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { pageMeta } from "@/lib/seo";
import { getExample, getExampleList } from "@/lib/docs";

export function generateStaticParams() {
  return getExampleList().map((e) => ({ slug: e.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const ex = getExample(params.slug);
  if (!ex)
    return pageMeta({ title: "Examples", description: "", path: "/examples" });
  return pageMeta({
    title: ex.title,
    description: `${ex.filename}: a draft IntentLang example.`,
    path: `/examples/${params.slug}`,
  });
}

export default function ExampleFilePage({
  params,
}: {
  params: { slug: string };
}) {
  const ex = getExample(params.slug);
  if (!ex) notFound();

  const all = getExampleList();

  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        <Link href="/examples" className="text-sm link-muted">
          ← All examples
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
          {ex.title}
        </h1>
        <p className="mt-2 font-mono text-sm text-haze-400">
          examples/{ex.filename}
        </p>

        <div className="mt-6">
          <IntentCode code={ex.code} filename={ex.filename} />
        </div>

        <div className="mt-6">
          <DraftNote>
            Draft syntax. This file is illustrative and does not run yet.
          </DraftNote>
        </div>

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">
            More examples
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {all
              .filter((e) => e.slug !== params.slug)
              .map((e) => (
                <Link
                  key={e.slug}
                  href={`/examples/${e.slug}`}
                  className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs text-haze-200 transition-colors hover:border-white/25 hover:text-white"
                >
                  {e.title}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
