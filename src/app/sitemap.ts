import type { MetadataRoute } from "next";
import { siteConfig, absoluteUrl } from "@/lib/site";
import { posts } from "./blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/",
    "/vision",
    "/docs",
    "/examples",
    "/playground",
    "/roadmap",
    "/blog",
    "/community",
    "/waitlist",
  ];

  const staticEntries = routes.map((route) => ({
    url: absoluteUrl(route),
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "/" ? 1 : 0.7,
  }));

  const postEntries = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  // Reference siteConfig so the base URL is obviously the source of truth.
  void siteConfig.url;

  return [...staticEntries, ...postEntries];
}
