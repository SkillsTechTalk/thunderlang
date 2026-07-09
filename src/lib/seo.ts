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
      title: `${title} | IntentLang`,
      description,
      url: `${siteConfig.url}${path === "/" ? "" : path}`,
      siteName: "IntentLang",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | IntentLang`,
      description,
      creator: siteConfig.twitter,
    },
  };
}
