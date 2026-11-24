/**
 * Central site configuration for thunderlang.dev.
 * Keep production URL, navigation, and brand strings here so every page,
 * the sitemap, robots, and OpenGraph metadata stay in sync.
 */

export const siteConfig = {
  name: "Intent",
  wordmark: "ThunderLang",
  tagline: "Thunder. Programming, made human",
  builtBy: "SkillsTech",
  // Production base URL. Override locally with NEXT_PUBLIC_SITE_URL if needed.
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://thunderlang.dev",
  description:
    "Thunder. Programming, made human. AI can write the code; humans should understand it. Thunder makes software rules visual and readable: read a rule, understand why it decides, change it, and ship it in the language you use. The Thunder programming language, also called ThunderLang, is open source, by SkillsTech.",
  promise:
    "Write what your software should do. Let AI and the compiler help determine how to build it, verify it, and keep it understandable.",
  twitter: "@skillstech",
  keywords: [
    "Intent programming language",
    "Intent-Oriented Programming",
    "AI programming language",
    "programming language for AI era",
    "pseudocode programming language",
    "AI-assisted software engineering",
    "software verification",
    "architecture as code",
    "SkillsTech Intent",
  ],
} as const;

export type NavItem = { href: string; label: string };

export const mainNav: NavItem[] = [
  { href: "/language", label: "The language" },
  { href: "/read", label: "Thunder Code" },
  { href: "/try", label: "Try it" },
  { href: "/map", label: "Thunder Atlas" },
  { href: "/playground", label: "Playground" },
];

export const OPENTHUNDER_URL = "https://openthunder.dev";

// Reading + reference surfaces, grouped under the "Learn" dropdown to keep the header lean.
export const learnNav: NavItem[] = [
  { href: "/language", label: "The Thunder language" },
  { href: "/install", label: "Install" },
  { href: "/learn", label: "Tutorial" },
  { href: "/zoom", label: "Semantic Zoom (preview)" },
  { href: "/vision", label: "Vision" },
  { href: "/architecture", label: "Architecture" },
  { href: "/docs/thunder-vocabulary", label: "Thunder vocabulary" },
  { href: "/atlas", label: "Intent Atlas (missions)" },
  { href: "/docs", label: "Docs" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/examples", label: "Examples" },
  { href: "/articles", label: "Articles" },
  { href: "/blog", label: "Blog" },
  { href: "/docs/mcp", label: "For AI agents (MCP)" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Language",
    items: [
      { href: "/learn", label: "Tutorial" },
      { href: "/read", label: "Thunder Code" },
      { href: "/map", label: "Thunder Atlas" },
      { href: "/vision", label: "Vision" },
      { href: "/architecture", label: "Architecture" },
      { href: "/docs", label: "Documentation" },
      { href: "/docs/mcp", label: "For AI agents (MCP)" },
      { href: "/examples", label: "Examples" },
      { href: "/playground", label: "Playground" },
    ],
  },
  {
    title: "Project",
    items: [
      { href: "https://github.com/SkillsTechTalk/thunderlang", label: "Source on GitHub" },
      { href: "https://openthunder.dev", label: "OpenThunder, the IDE for Thunder" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/proof", label: "Proof matrix" },
      { href: "/blog", label: "Blog" },
      { href: "/articles", label: "Articles" },
      { href: "/community", label: "Community" },
      { href: "/waitlist", label: "Run a team pilot" },
      { href: "/site-map", label: "Site map" },
    ],
  },
  {
    title: "Trust",
    items: [
      { href: "/license", label: "License and governance" },
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
    ],
  },
];

/** Absolute canonical URL helper. */
export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${clean === "/" ? "" : clean}`;
}
