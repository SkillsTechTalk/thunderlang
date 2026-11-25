import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { GALLERY } from "@/gallery/entries.mjs";
import { readGalleryEntry } from "@/gallery/read-entry.mjs";

export const metadata = pageMeta({
  title: "Gallery: famous code, read in Thunder",
  description: "Real functions from Flask, Requests, Express, axios, NestJS, Go, fd, Apache Commons Lang, Json.NET, Redis, and the Sakila database, read in Thunder: what each one does, in pictures and plain words, with honest counts of what Thunder could and couldn't put into words.",
  path: "/gallery",
});

export default function GalleryPage() {
  // Read at build time with the current compiler: these numbers move when the reader improves.
  const entries = GALLERY.map((e) => ({ e, r: readGalleryEntry(e) }));
  return (
    <>
      <PageHero eyebrow="Gallery" title="Famous code, read in Thunder."
        intro="Real functions from well-known open-source projects, each pinned to a commit and read by the Thunder compiler when this site was built. Every reading says how much Thunder put into words and shows the rest as the original code, so you can judge it for yourself." />
      <Section className="!pt-8">
        <ul className="grid gap-4 md:grid-cols-2">
          {entries.map(({ e, r }) => (
            <li key={e.slug}>
              <Link href={`/gallery/${e.slug}`} className="group flex h-full flex-col rounded-2xl border border-white/10 bg-ink-850/40 p-5 transition hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-300">
                <span className="flex flex-wrap items-center gap-2 text-xs text-haze-400">
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-haze-200">{e.language}</span>
                  <span>{e.project}</span>
                </span>
                <span className="mt-3 text-lg font-semibold text-white group-hover:text-gold-200">{e.title}</span>
                <span className="mt-1 font-mono text-xs text-haze-400">{e.fn.replace(/@\d+$/, "")} · {e.path.split("/").pop()}</span>
                <span className="mt-3 text-sm text-haze-300">{r.explained} of {r.steps} steps put into words{r.notExplained ? `; ${r.notExplained} shown as code` : ""}.</span>
                <span aria-hidden="true" className="mt-auto pt-3 text-sm font-medium text-gold-300">Read it →</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 max-w-3xl space-y-3 text-sm leading-relaxed text-haze-400">
          <p>
            <span className="font-medium text-haze-200">How these were chosen.</span> Each function comes from a project under a permissive
            license (MIT, BSD, or Apache 2.0) and was checked by hand against its code. Readings that said something false, or left out
            something important, were left out of the gallery rather than shown. Only the one source file each function lives in is kept
            on this site, with its license; the attribution is on every page.
          </p>
          <p>
            <span className="font-medium text-haze-200">They improve on their own.</span> The readings aren&apos;t written down anywhere: the
            site reads these files with the current Thunder compiler at every build. Want one of your own?{" "}
            <Link href="/r" className="font-medium text-gold-300 hover:text-gold-200">Open any public GitHub file</Link> or{" "}
            <Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">paste your code</Link>.
          </p>
        </div>
      </Section>
    </>
  );
}
