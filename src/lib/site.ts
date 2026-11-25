/**
 * Central site configuration for thunderlang.dev.
 * Keep production URL, navigation, and brand strings here so every page,
 * the sitemap, robots, and OpenGraph metadata stay in sync.
 */

export const siteConfig = {
  name: "Intent",
  wordmark: "ThunderLang",
  tagline: "Thunder. The Human Programming Language",
  builtBy: "SkillsTech",
  // Production base URL. Override locally with NEXT_PUBLIC_SITE_URL if needed.
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://thunderlang.dev",
  description:
    "Thunder (also called ThunderLang) is the human programming language. Write software in a language you understand, build with AI, and compile to the ecosystem you choose. Today Thunder reads code in seventeen languages and compiles rules to six; writing whole programs in Thunder is coming, Python first.",
  promise:
    "Write software in a language you understand. Build with AI. Compile to the ecosystem you choose.",
  twitter: "@skillstech",
  keywords: [
    "Thunder programming language",
    "Thunder language",
    "ThunderLang",
    "Thunder",
    "human-native programming language",
    "human programming language",
    "one language every ecosystem",
    "visual programming language",
    "learn Thunder",
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

// Where to send people who want to learn Thunder in depth: the full course on Skills Tech Talk.
export const LEARN_COURSE_URL = "https://app.skillstechtalk.com/learn/technology/t/thunderlang";

// Reading + reference surfaces, grouped under the "Learn" dropdown to keep the header lean.
export const learnNav: NavItem[] = [
  { href: "/language", label: "The Thunder language" },
  { href: "/install", label: "Install" },
  { href: "/learn", label: "Tutorial" },
  { href: LEARN_COURSE_URL, label: "Full course ↗" },
  { href: "/zoom", label: "Semantic Zoom (preview)" },
  { href: "/manifesto", label: "Manifesto" },
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
      { href: LEARN_COURSE_URL, label: "Full course ↗" },
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
      { href: "https://openthunder.dev", label: "OpenThunder, the IDE for AI-written code" },
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
