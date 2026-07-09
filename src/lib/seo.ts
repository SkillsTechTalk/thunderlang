import type { Metadata } from "next";
import { siteConfig } from "./site";

/** Build per-page metadata with a canonical URL and consistent OG/Twitter. */
export function pageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const canonical = path === "/" ? "/" : path;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | Intent Language`,
      description,
      url: `${siteConfig.url}${path === "/" ? "" : path}`,
      siteName: "Intent Language",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Intent Language`,
      description,
      creator: siteConfig.twitter,
    },
  };
}
