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
    "Thunder (also called ThunderLang) is the human programming language. Write software in a language you understand, build with AI, and compile to the ecosystem you choose. Today Thunder reads code in seventeen languages and compiles rules to six; you can also write whole programs in Thunder and run them as Python, TypeScript, C#, Java, Go, or Rust.",
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

// The site's navigation (header, mobile menu, footer, site map) lives in navigation.ts, so a page has one name
// everywhere. These links are re-exported here for the pages that already import them from site.ts.
export { OPENTHUNDER_URL, LEARN_COURSE_URL, GITHUB_URL } from "./navigation";

/** Absolute canonical URL helper. */
export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${clean === "/" ? "" : clean}`;
}
