// The site's map, in one place: every page is discovered from src/app at build time, so a new page can never be
// left out of sitemap.xml or the /site-map page. The curated sections below only decide grouping and wording; any
// page they do not mention still appears under "Everything else".
import fs from "node:fs";
import path from "node:path";
import { posts } from "@/app/blog/posts";
import { getDocSlugs, getExampleList } from "@/lib/docs";

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

/** How people think about the site, from "what is this?" to the fine print. */
const SECTIONS: MapSection[] = [
  {
    title: "Start here",
    says: "What Thunder is, and the fastest way to see it.",
    links: [
      { href: "/", label: "Home", says: "Thunder. Programming, made human." },
      { href: "/language", label: "The Thunder Programming Language", says: "Human-native programming, and why. Thunder is the language; OpenThunder is the IDE." },
      { href: "/learn", label: "Learn Thunder", says: "Seven short lessons on reading software in Thunder. No install." },
      { href: "/install", label: "Install", says: "The open-source Thunder compiler for your terminal and VS Code." },
    ],
  },
  {
    title: "Read and try Thunder",
    says: "Real code, read in Thunder in your browser.",
    links: [
      { href: "/read", label: "Thunder Code", says: "Paste code in ten languages and read it in Thunder." },
      { href: "/try", label: "Try it on a refund rule", says: "Ask a rule questions and change it safely." },
      { href: "/map", label: "Thunder Atlas", says: "Zoom from a whole product down to one rule." },
      { href: "/review", label: "Review", says: "See an AI change as before-and-after Thunder." },
      { href: "/playground", label: "Playground", says: "Write rules and watch them become code in six languages." },
    ],
  },
  {
    title: "Learn and look things up",
    says: "Tutorials, the specification, and every guide.",
    links: [
      { href: "/learn/write-rules", label: "Learn Thunder, part 2: write rules", says: "Write a rule once, prove it with examples, get it in six languages." },
      { href: "/docs/spec", label: "Thunder V1 specification", says: "Every element, as a picture and as Thunder Text." },
      { href: "/docs/thunder-vocabulary", label: "Thunder vocabulary", says: "Thunder, Thunder Text, Thundered code, and the views." },
      { href: "/docs", label: "All documentation", says: "Every guide, grouped by what you want to do." },
      { href: "/examples", label: "Examples", says: "Runnable rules and missions." },
    ],
  },
  {
    title: "Why Thunder",
    says: "The thinking behind it, and the evidence.",
    links: [
      { href: "/blog/why-i-created-thunder", label: "Why I Created Thunder", says: "The essay: programming, made human." },
      { href: "/vision", label: "Vision", says: "Where Thunder is going." },
      { href: "/architecture", label: "Architecture", says: "How the compiler and the tools fit together." },
      { href: "/atlas", label: "Intent Atlas (missions)", says: "The mission-level map from the earlier intent language." },
      { href: "/proof", label: "Proof matrix", says: "What is verified, and how." },
      { href: "/roadmap", label: "Roadmap", says: "What is done, and what is next." },
      { href: "/blog", label: "Blog", says: "Essays, case studies, announcements." },
      { href: "/articles", label: "Articles", says: "Longer reads about software in the AI era." },
    ],
  },
  {
    title: "Community and trust",
    says: "Get involved, and the fine print.",
    links: [
      { href: "/community", label: "Community", says: "Where to ask, share, and contribute." },
      { href: "/waitlist", label: "Run a team pilot", says: "Try Thunder with your team." },
      { href: "/license", label: "License and governance", says: "Open source, and how decisions are made." },
      { href: "/privacy", label: "Privacy", says: "What this site collects." },
      { href: "/security", label: "Security", says: "How to report a problem." },
    ],
  },
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
  const rest = [...routes].filter((r) => !named.has(r) && r !== "/site-map");
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
