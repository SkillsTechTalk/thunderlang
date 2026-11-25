import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { readingOgImage } from "@/lib/reading-og";
import { GALLERY, galleryEntry } from "@/gallery/entries.mjs";
import { readGalleryEntry } from "@/gallery/read-entry.mjs";
import { buildSharePath, githubFileUrl } from "@/lib/share-link.mjs";
import { ReadingLevels } from "@/components/thunder/ReadingLevels";
import { GalleryShare } from "../GalleryShare";

type Props = { params: { slug: string } };

export const dynamicParams = false;
export function generateStaticParams() {
  return GALLERY.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const e = galleryEntry(params.slug);
  if (!e) return {};
  const base = pageMeta({ title: `${e.title}: ${e.project}, read in Thunder`, description: e.intro, path: `/gallery/${e.slug}` });
  const image = readingOgImage({ repo: e.repo, path: e.path, fn: e.fn.replace(/@\d+$/, ""), level: "flow" });
  return { ...base, openGraph: { ...base.openGraph, images: [image] }, twitter: { ...base.twitter, images: [image.url] } };
}

const GRADE: Record<"A" | "B", string> = {
  A: "accurate and useful: every sentence checked against the code is true",
  B: "accurate, with some wording that is thin or close to the code",
};

export default function GalleryEntryPage({ params }: Props) {
  const e = galleryEntry(params.slug);
  if (!e) notFound();
  // Built from the vendored file by the current compiler; a reading that no longer finds the function fails the build.
  const r = readGalleryEntry(e);
  const [owner, repo] = e.repo.split("/");
  const loc = { owner, repo, ref: e.sha, path: e.path };
  const shareHref = buildSharePath({ ...loc, fn: e.fn, level: "flow" });
  const i = GALLERY.findIndex((x) => x.slug === e.slug);
  const prev = GALLERY[i - 1], next = GALLERY[i + 1];

  return (
    <>
      <PageHero eyebrow={`Gallery · ${e.language} · ${e.project}`} title={e.title} intro={e.intro} />
      <Section className="!pt-8">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-haze-400">What to look for</h2>
            <p className="mt-2 text-[17px] text-haze-100">{e.look}</p>
          </div>
          <div className="rounded-2xl border border-white/10 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-haze-400">How much Thunder could read</h2>
            <p className="mt-2 text-[17px] text-white">{r.explained} of {r.steps} steps put into words{r.notExplained ? <>; the other {r.notExplained} {r.notExplained === 1 ? "is" : "are"} shown as code.</> : "."}</p>
            <p className="mt-2 text-sm text-haze-400">Read by the current Thunder compiler when this page was built. Hand-checked against the code: {GRADE[e.grade]}.</p>
          </div>
        </div>

        <div className="mt-8">
          <ReadingLevels source={r.source} file={e.path} initialFocusId={r.memberId} initialLevel="flow" />
        </div>

        <div className="mt-8 flex flex-wrap items-start gap-6 rounded-2xl border border-white/10 p-5">
          <div className="space-y-2 text-sm">
            <a href={githubFileUrl(loc, e.lines)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:text-gold-200">
              See lines {e.lines[0]}–{e.lines[1]} on GitHub <span aria-hidden="true">&nbsp;↗</span><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="text-haze-400">Shared reading: <Link href={shareHref} className="break-all text-haze-200 underline decoration-white/30 underline-offset-4 hover:text-white">{shareHref}</Link></p>
          </div>
          <div className="ml-auto"><GalleryShare loc={loc} fn={e.fn} /></div>
        </div>

        <details className="mt-6 rounded-2xl border border-white/10 p-5">
          <summary className="cursor-pointer text-sm font-medium text-haze-200">The same reading as Thunder Text, built with this page</summary>
          <pre className="mt-3 overflow-x-auto font-mono text-[13px] leading-relaxed text-haze-200">{r.text}</pre>
        </details>

        <section aria-labelledby="credit" className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-haze-300">
          <h2 id="credit" className="text-xs font-semibold uppercase tracking-wider text-haze-400">Source and license</h2>
          <p className="mt-2">
            From <a href={`https://github.com/${e.repo}`} target="_blank" rel="noopener noreferrer" className="text-haze-100 underline decoration-white/30 underline-offset-4 hover:text-white">{e.project} ({e.repo})</a>,{" "}
            <span className="break-all font-mono">{e.path}</span>, lines {e.lines[0]}–{e.lines[1]}, at commit{" "}
            <a href={`https://github.com/${e.repo}/tree/${e.sha}`} target="_blank" rel="noopener noreferrer" className="font-mono text-haze-100 underline decoration-white/30 underline-offset-4 hover:text-white">{e.sha.slice(0, 7)}</a> ({e.tag}).
          </p>
          <p className="mt-2"><span className="text-haze-100">{e.license.notice}.</span> Licensed under the{" "}
            <a href={`https://github.com/${e.repo}/blob/${e.sha}/${e.license.file}`} target="_blank" rel="noopener noreferrer" className="text-haze-100 underline decoration-white/30 underline-offset-4 hover:text-white">{e.license.name}</a>. The code is shown unmodified; the Thunder reading is ThunderLang&apos;s.
          </p>
          {r.licenses.map((l) => (
            <details key={l.file} className="mt-3">
              <summary className="cursor-pointer text-haze-200">Full {l.file === "NOTICE" ? "notice" : "license"} text ({l.file})</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-xs text-haze-300">{l.text}</pre>
            </details>
          ))}
        </section>

        <nav aria-label="More from the gallery" className="mt-8 flex flex-wrap justify-between gap-4 text-sm">
          {prev ? <Link href={`/gallery/${prev.slug}`} className="text-gold-300 hover:text-gold-200">← {prev.title}</Link> : <span />}
          <Link href="/gallery" className="text-haze-300 hover:text-white">All gallery entries</Link>
          {next ? <Link href={`/gallery/${next.slug}`} className="text-gold-300 hover:text-gold-200">{next.title} →</Link> : <span />}
        </nav>
      </Section>
    </>
  );
}
