/**
 * Central site configuration for thunderlang.dev.
 * Keep production URL, navigation, and brand strings here so every page,
 * the sitemap, robots, and OpenGraph metadata stay in sync.
 */

export const siteConfig = {
  name: "ThunderLang",
  wordmark: "ThunderLang",
  tagline: "Executable rules for AI-assisted development",
  builtBy: "SkillsTech",
  // Production base URL. Override locally with NEXT_PUBLIC_SITE_URL if needed.
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://thunderlang.dev",
  description:
    "Write readable software rules, test their edge cases, and use the same contracts in OpenThunder or your existing developer tools.",
  promise:
    "Keep the rules behind a code change explicit, executable, and reviewable.",
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
  { href: "/#contract-lab", label: "Try a rule" },
  { href: "/docs/using-with-openthunder", label: "OpenThunder" },
  { href: "/atlas", label: "Atlas" },
  { href: "/playground", label: "Playground" },
  { href: "/roadmap", label: "Roadmap" },
];

// Reading + reference surfaces, grouped under the "Learn" dropdown to keep the header lean.
export const learnNav: NavItem[] = [
  { href: "/docs", label: "Docs" },
  { href: "/examples", label: "Examples" },
  { href: "/articles", label: "Articles" },
  { href: "/blog", label: "Blog" },
  { href: "/docs/mcp", label: "For AI agents (MCP)" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Language",
    items: [
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
      { href: "/roadmap", label: "Roadmap" },
      { href: "/proof", label: "Proof matrix" },
      { href: "/blog", label: "Blog" },
      { href: "/articles", label: "Articles" },
      { href: "/community", label: "Community" },
      { href: "/waitlist", label: "Run a team pilot" },
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
