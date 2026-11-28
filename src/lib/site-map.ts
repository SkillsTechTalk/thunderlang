// The site's map, in one place: every page is discovered from src/app at build time, so a new page can never be
// left out of sitemap.xml or the /site-map page. The curated sections below only decide grouping and wording; any
// page they do not mention still appears under "Everything else".
import fs from "node:fs";
import path from "node:path";
import { posts } from "@/app/blog/posts";
import { getDocSlugs, getExampleList } from "@/lib/docs";
import { NAV_GROUPS, TRUST_LINKS, groupLinks, isExternal, type NavLink } from "@/lib/navigation";

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Every static page route (folders under src/app with a page.tsx and no [dynamic] segment), sorted. */
export function discoverRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith("[") || name.startsWith("_") || name.startsWith(".") || name === "api") continue;
      const next = name.startsWith("(") ? route : `${route}/${name}`; // (groups) do not appear in URLs
      const full = path.join(dir, name);
      if (fs.existsSync(path.join(full, "page.tsx"))) routes.push(next);
      walk(full, next);
    }
  };
  if (fs.existsSync(path.join(APP_DIR, "page.tsx"))) routes.push("/");
  walk(APP_DIR, "");
  return [...new Set(routes)].sort();
}

export type MapLink = { href: string; label: string; says: string };
export type MapSection = { title: string; says: string; links: MapLink[] };

/**
 * The same groups as the header and footer (navigation.ts), with their one-line descriptions, so the map, the menus,
 * and the footer name every page the same way. A few pages are on the map without a header slot (EXTRA).
 */
const EXTRA: Record<string, MapLink[]> = {
  "Try it": [{ href: "/r", label: "Share a reading", says: "Open a public GitHub file in Thunder and copy a link to one function at one level." }],
  Learn: [{ href: "/docs/thunder-vocabulary", label: "Thunder vocabulary", says: "Thunder, Thunder Text, Thundered code, and the views." }],
};
const SECTIONS: MapSection[] = [
  ...NAV_GROUPS.map((g) => ({
    title: g.title,
    says: g.says,
    links: [...groupLinks(g), ...(EXTRA[g.title] ?? [])].filter((l) => !isExternal(l.href)).map((l: NavLink | MapLink) => ({ href: l.href, label: 'status' in l && l.status ? `${l.label} (${l.status.toLowerCase()})` : l.label, says: l.says })),
  })),
  { title: "Fine print", says: "License, privacy, and security.", links: TRUST_LINKS.filter((l) => l.href !== "/site-map").map(({ href, label, says }) => ({ href, label, says })) },
];

/** The curated sections, keeping only pages that exist, plus every discovered page they do not mention. */
export function getSiteMap(): { sections: MapSection[]; rest: string[] } {
  const routes = new Set(discoverRoutes());
  const docs = new Set(getDocSlugs()), blog = new Set(posts.map((p) => p.slug)), examples = new Set(getExampleList().map((e) => e.slug));
  const exists = (href: string) => {
    const [, top, slug] = href.split("/");
    if (slug && top === "docs") return docs.has(slug);
    if (slug && top === "blog") return blog.has(slug);
    if (slug && top === "examples") return examples.has(slug);
    return routes.has(href);
  };
  const sections = SECTIONS.map((s) => ({ ...s, links: s.links.filter((l) => exists(l.href)) })).filter((s) => s.links.length);
  const named = new Set(SECTIONS.flatMap((s) => s.links.map((l) => l.href)));
  const rest = [...routes].filter((r) => !named.has(r) && r !== "/site-map" && r !== "/"); // home: the logo, on every page
  return { sections, rest };
}

/** How important a page is to a search engine, by how people arrive. */
export function priorityOf(route: string): number {
  if (route === "/") return 1;
  if (["/language", "/learn", "/read"].includes(route)) return 0.9;
  if (["/try", "/install", "/map", "/docs", "/docs/spec", "/blog/why-i-created-thunder"].includes(route)) return 0.8;
  if (["/license", "/privacy", "/security", "/site-map"].includes(route)) return 0.3;
  return 0.7;
}
