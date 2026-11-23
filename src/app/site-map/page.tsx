import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { OPENTHUNDER_URL } from "@/lib/site";
import { getSiteMap } from "@/lib/site-map";
import { getDocCategories, getExampleList } from "@/lib/docs";
import { posts } from "../blog/posts";

export const metadata = pageMeta({
  title: "Site map",
  description: "Every page on thunderlang.dev, grouped by what you came for: what Thunder is, reading and trying it, learning, why it exists, and every guide.",
  path: "/site-map",
});

export default function SiteMapPage() {
  const { sections, rest } = getSiteMap();
  const docs = getDocCategories();
  const examples = getExampleList();
  return (
    <>
      <PageHero
        eyebrow="Site map"
        title="Everything on thunderlang.dev."
        intro="Grouped by what you came for. Thunder is the language; OpenThunder, the IDE, has its own site."
      />
      <Section className="!pt-0">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {sections.map((s) => (
            <section key={s.title} aria-labelledby={`map-${s.title}`}>
              <h2 id={`map-${s.title}`} className="text-xl font-semibold text-white">{s.title}</h2>
              <p className="mt-1 text-sm text-haze-400">{s.says}</p>
              <ul className="mt-4 space-y-3">
                {s.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="font-medium text-gold-200 hover:text-gold-100">{l.label}</Link>
                    <p className="text-sm text-haze-300">{l.says}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section aria-labelledby="map-ide">
            <h2 id="map-ide" className="text-xl font-semibold text-white">OpenThunder, the IDE</h2>
            <p className="mt-1 text-sm text-haze-400">Where you use Thunder on your whole application.</p>
            <ul className="mt-4 space-y-3">
              <li><a href={OPENTHUNDER_URL} className="font-medium text-gold-200 hover:text-gold-100">openthunder.dev ↗</a><p className="text-sm text-haze-300">Open a repository, read it in Thunder, change it, and check every change.</p></li>
              <li><a href="https://github.com/SkillsTechTalk/thunderlang" className="font-medium text-gold-200 hover:text-gold-100">Thunder source on GitHub ↗</a><p className="text-sm text-haze-300">The open-source compiler, this site, and the VS Code extension.</p></li>
            </ul>
          </section>
        </div>
      </Section>

      <Section className="border-t border-white/8">
        <h2 className="text-2xl font-semibold text-white">Every guide</h2>
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {docs.map((c) => (
            <section key={c.title} aria-labelledby={`docs-${c.title}`}>
              <h3 id={`docs-${c.title}`} className="font-semibold text-white">{c.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {c.docs.map((d) => <li key={d.slug}><Link href={`/docs/${d.slug}`} className="text-haze-200 hover:text-white">{d.label}</Link></li>)}
              </ul>
            </section>
          ))}
        </div>
      </Section>

      <Section className="border-t border-white/8">
        <div className="grid gap-x-10 gap-y-10 md:grid-cols-3">
          <section aria-labelledby="map-blog">
            <h2 id="map-blog" className="text-lg font-semibold text-white">Blog</h2>
            <ul className="mt-3 space-y-1.5 text-sm">{posts.map((p) => <li key={p.slug}><Link href={`/blog/${p.slug}`} className="text-haze-200 hover:text-white">{p.title}</Link></li>)}</ul>
          </section>
          <section aria-labelledby="map-examples">
            <h2 id="map-examples" className="text-lg font-semibold text-white">Examples</h2>
            <ul className="mt-3 space-y-1.5 text-sm">{examples.map((e) => <li key={e.slug}><Link href={`/examples/${e.slug}`} className="text-haze-200 hover:text-white">{e.title ?? e.slug}</Link></li>)}</ul>
          </section>
          {rest.length > 0 && (
            <section aria-labelledby="map-rest">
              <h2 id="map-rest" className="text-lg font-semibold text-white">Everything else</h2>
              <ul className="mt-3 space-y-1.5 text-sm">{rest.map((r) => <li key={r}><Link href={r} className="font-mono text-haze-200 hover:text-white">{r}</Link></li>)}</ul>
            </section>
          )}
        </div>
        <p className="mt-10 text-sm text-haze-400">For search engines: <a href="/sitemap.xml" className="text-gold-300 hover:text-gold-200">sitemap.xml</a>.</p>
      </Section>
    </>
  );
}
