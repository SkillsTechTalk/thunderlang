import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { LEVEL_NAMES, buildSharePath, parseSharePath, parseShareQuery } from "@/lib/share-link.mjs";
import { readingOgImage } from "@/lib/reading-og";
import { GitHubReading } from "./GitHubReading";

type Props = { params: { slug: string[] }; searchParams: Record<string, string | string[] | undefined> };

// The server sees only the names in the URL; the browser fetches and reads the code.
export function generateMetadata({ params, searchParams }: Props): Metadata {
  const parsed = parseSharePath(params.slug);
  if (!parsed.ok) return { title: "Shared reading", robots: { index: false } };
  const { owner, repo, ref, path } = parsed.value;
  const { fn, level } = parseShareQuery(searchParams);
  const fileName = path.split("/").pop()!;
  const title = `${fn ? `${fn} in ${fileName}` : fileName} (${owner}/${repo}), read in Thunder`;
  const description = `${fn ? `The function ${fn}` : `The file ${path}`} from ${owner}/${repo} at ${ref}, read in Thunder at the ${LEVEL_NAMES[level]} level: what it does, in pictures and plain words. Read in your browser, with no AI.`;
  const image = readingOgImage({ repo: `${owner}/${repo}`, path, fn, level });
  return {
    title,
    description,
    // Anyone can make one of these links, so they are not offered to search engines.
    robots: { index: false, follow: true },
    alternates: { canonical: buildSharePath({ ...parsed.value, fn, level }) },
    openGraph: { title, description, type: "website", siteName: "ThunderLang", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function SharedReadingPage({ params, searchParams }: Props) {
  const parsed = parseSharePath(params.slug);
  if (!parsed.ok) {
    return (
      <>
        <PageHero eyebrow="Shared reading" title="This link doesn't point at a file" intro={parsed.reason} />
        <Section>
          <p className="text-haze-300">A shared reading looks like <code className="font-mono text-haze-100">/r/owner/repository/branch-or-commit/path/to/file.py</code>.{" "}
            <Link href="/r" className="font-medium text-gold-300 hover:text-gold-200">Open a file by its GitHub address →</Link></p>
        </Section>
      </>
    );
  }
  const loc = parsed.value;
  const { fn, level } = parseShareQuery(searchParams);
  return (
    <>
      <PageHero eyebrow="Shared reading · from GitHub" title={fn ?? loc.path.split("/").pop()!}
        intro={<><span className="font-mono text-base text-haze-200">{loc.owner}/{loc.repo}</span> · <span className="font-mono text-base">{loc.path}</span> at <span className="font-mono text-base">{loc.ref.length === 40 ? loc.ref.slice(0, 7) : loc.ref}</span>. Read in Thunder: what the code does, at five levels, from the big picture to the original code.</>} />
      <Section className="!pt-8">
        <GitHubReading loc={loc} fn={fn} level={level} />
        <p className="mt-8 text-sm text-haze-400">
          New to Thunder? <Link href="/gallery" className="font-medium text-gold-300 hover:text-gold-200">See famous code read in Thunder</Link> or{" "}
          <Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">read your own code</Link>.
        </p>
      </Section>
    </>
  );
}
