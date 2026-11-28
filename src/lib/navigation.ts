// The site's navigation, in one place: the header menus, the mobile menu, the footer, and the /site-map page all read
// these groups, so a page has one name everywhere and sits in one group.
//
// The model a visitor should hold: thunderlang.dev answers four questions.
//   Try it       see Thunder work on code, in the browser, with nothing to install
//   Learn        from the first lesson to the full reference
//   Why Thunder  the thinking behind it, and the evidence
//   Community    news, people, and getting involved
// Labels name what you will do there; an established feature name (Thunder Atlas, Semantic Zoom) goes in the line
// under the label, not in place of it (DESIGN.md §9.1). No server-only imports: the header is a client component.

export const OPENTHUNDER_URL = "https://openthunder.dev";
export const GITHUB_URL = "https://github.com/SkillsTechTalk/thunderlang";
export const LEARN_COURSE_URL = "https://app.skillstechtalk.com/learn/technology/t/thunderlang";

export type NavLink = {
  href: string;
  label: string;
  /** One short line: what you can do there. */
  says: string;
  /** Not finished yet, said on the link itself. */
  status?: "Preview" | "Prototype";
};
export type NavSection = { title?: string; links: NavLink[] };
export type NavGroup = {
  /** The menu's name in the header. */
  title: string;
  /** One line under the menu's name: what the whole group is for. */
  says: string;
  sections: NavSection[];
};

export const isExternal = (href: string) => /^https?:\/\//.test(href);

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Try it",
    says: "See Thunder work on real code, in your browser. Nothing to install.",
    sections: [
      {
        title: "Read code",
        links: [
          { href: "/read", label: "Read your code in Thunder", says: "Paste code in any of 17 languages and see what it does, in words and pictures." },
          { href: "/live", label: "Translate as you type", says: "Type Python or JavaScript and watch it appear in Thunder." },
          { href: "/gallery", label: "Famous code, read in Thunder", says: "Real functions from Flask, Express, Go, Redis, and more." },
          { href: "/map", label: "Read a whole app", says: "Thunder Atlas: zoom from a whole product down to one rule.", status: "Prototype" },
          { href: "/zoom", label: "Read at five levels of detail", says: "Semantic Zoom: from the big picture down to the original code.", status: "Preview" },
        ],
      },
      {
        title: "Change and run",
        links: [
          { href: "/playground", label: "Write and run a program", says: "Write Thunder, run it, and see each step and the result." },
          { href: "/try", label: "Change a rule safely", says: "Ask a refund rule questions, change it, and see what breaks." },
          { href: "/review", label: "Review an AI change", says: "See what a change kept, broke, or left unchecked." },
        ],
      },
    ],
  },
  {
    title: "Learn",
    says: "From your first lesson to the full reference.",
    sections: [
      {
        title: "Start",
        links: [
          { href: "/install", label: "Install Thunder", says: "The thunder command for your terminal, and the VS Code extension." },
          { href: "/learn", label: "Tutorial: read Thunder", says: "Twelve short lessons in your browser. No install." },
          { href: "/learn/write-rules", label: "Tutorial: write rules", says: "Write a rule once, prove it with examples, get it in six languages." },
          { href: LEARN_COURSE_URL, label: "Full course", says: "Practice and progress on Skills Tech Talk." },
        ],
      },
      {
        title: "Look things up",
        links: [
          { href: "/language", label: "The language", says: "What Thunder is, how it reads, and how it fits with OpenThunder." },
          { href: "/docs", label: "Documentation", says: "Every guide, grouped by what you want to do." },
          { href: "/docs/spec", label: "Specification", says: "Every part of the language, as a picture and as text." },
          { href: "/examples", label: "Examples", says: "Programs and rules you can run." },
          { href: "/docs/mcp", label: "For AI agents", says: "Connect an AI agent to Thunder's tools (MCP)." },
        ],
      },
    ],
  },
  {
    title: "Why Thunder",
    says: "The thinking behind it, and the evidence for what works.",
    sections: [
      {
        title: "The idea",
        links: [
          { href: "/blog/why-i-created-thunder", label: "Why Thunder exists", says: "The essay: programming, made human." },
          { href: "/manifesto", label: "Manifesto", says: "The human programming language, in a page." },
          { href: "/vision", label: "Vision", says: "Where Thunder is going." },
          { href: "/architecture", label: "How Thunder works", says: "How the compiler and the tools fit together." },
        ],
      },
      {
        title: "The evidence",
        links: [
          { href: "/roadmap", label: "What works today", says: "What is done, what is in progress, and what is next." },
          { href: "/proof", label: "Proof", says: "Every claim, how it is checked, and the honest count." },
          { href: "/atlas", label: "Project map from mission files", says: "Intent Atlas: see a project through its intent, and which parts are checked." },
        ],
      },
    ],
  },
  {
    title: "Community",
    says: "News, people, and ways to get involved.",
    sections: [
      {
        links: [
          { href: "/blog", label: "Blog", says: "Essays, case studies, and announcements." },
          { href: "/articles", label: "Articles", says: "Longer reads about software in the AI era." },
          { href: "/community", label: "Community", says: "Where to ask, share, and contribute." },
          { href: "/waitlist", label: "Run a team pilot", says: "Try Thunder with your team." },
          { href: GITHUB_URL, label: "Source on GitHub", says: "The compiler, the site, and every issue, in the open." },
        ],
      },
    ],
  },
];

/** The fine print: in the footer and the site map, not the header. */
export const TRUST_LINKS: NavLink[] = [
  { href: "/license", label: "License and governance", says: "Open source, and how decisions are made." },
  { href: "/privacy", label: "Privacy", says: "What this site collects." },
  { href: "/security", label: "Security", says: "How to report a problem." },
  { href: "/site-map", label: "Site map", says: "Every page, grouped by what you came for." },
];

/** The header's one main button. Its label says where it goes. */
export const PRIMARY_ACTION = { href: "/install", label: "Install" } as const;

/** Every link in a group, in order. */
export const groupLinks = (g: NavGroup) => g.sections.flatMap((s) => s.links);

/** The group the current page belongs to (the longest matching link wins: /learn/write-rules over /learn). */
export function groupOf(pathname: string): NavGroup | null {
  let best: { group: NavGroup; len: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const l of groupLinks(group)) {
      if (isExternal(l.href)) continue;
      const hit = pathname === l.href || pathname.startsWith(`${l.href}/`);
      if (hit && (!best || l.href.length > best.len)) best = { group, len: l.href.length };
    }
  }
  return best?.group ?? null;
}
