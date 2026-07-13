/**
 * Central site configuration for intentlanguage.dev.
 * Keep production URL, navigation, and brand strings here so every page,
 * the sitemap, robots, and OpenGraph metadata stay in sync.
 */

export const siteConfig = {
  name: "Intent",
  wordmark: "IntentLang",
  tagline: "The Intent-Oriented Programming Language",
  builtBy: "SkillsTech",
  // Production base URL. Override locally with NEXT_PUBLIC_SITE_URL if needed.
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://intentlanguage.dev",
  description:
    "IntentLang is the intent language for AI-era software by SkillsTech. Define what software should do, what must never happen, and how it must be verified before code is generated or changed.",
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
  { href: "/vision", label: "Vision" },
  { href: "/docs", label: "Docs" },
  { href: "/examples", label: "Examples" },
  { href: "/atlas", label: "Atlas" },
  { href: "/playground", label: "Playground" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/blog", label: "Blog" },
  { href: "/community", label: "Community" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Language",
    items: [
      { href: "/vision", label: "Vision" },
      { href: "/docs", label: "Documentation" },
      { href: "/examples", label: "Examples" },
      { href: "/playground", label: "Playground" },
    ],
  },
  {
    title: "Project",
    items: [
      { href: "/roadmap", label: "Roadmap" },
      { href: "/blog", label: "Blog" },
      { href: "/community", label: "Community" },
      { href: "/waitlist", label: "Join the Waitlist" },
    ],
  },
];

/** Absolute canonical URL helper. */
export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${clean === "/" ? "" : clean}`;
}
