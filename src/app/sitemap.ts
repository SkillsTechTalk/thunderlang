import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { discoverRoutes, priorityOf } from "@/lib/site-map";
import { posts } from "./blog/posts";
import { getDocSlugs, getExampleList } from "@/lib/docs";
import { GALLERY } from "@/gallery/entries.mjs";

/**
 * sitemap.xml. Pages are discovered from src/app at build time (see src/lib/site-map.ts), so every page is listed
 * without anyone remembering to add it. Docs, examples, and blog posts come from their own sources.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const built = new Date();
  const pages = discoverRoutes().map((route) => ({
    url: absoluteUrl(route),
    lastModified: built,
    changeFrequency: "weekly" as const,
    priority: priorityOf(route),
  }));

  const postEntries = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: priorityOf(`/blog/${post.slug}`) === 0.7 ? 0.5 : priorityOf(`/blog/${post.slug}`),
  }));

  const docEntries = getDocSlugs().map((slug) => ({
    url: absoluteUrl(`/docs/${slug}`),
    lastModified: built,
    changeFrequency: "monthly" as const,
    priority: priorityOf(`/docs/${slug}`) === 0.7 ? 0.6 : priorityOf(`/docs/${slug}`),
  }));

  const exampleEntries = getExampleList().map((e) => ({
    url: absoluteUrl(`/examples/${e.slug}`),
    lastModified: built,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const galleryEntries = GALLERY.map((e) => ({
    url: absoluteUrl(`/gallery/${e.slug}`),
    lastModified: built,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const seen = new Set<string>();
  return [...pages, ...postEntries, ...docEntries, ...exampleEntries, ...galleryEntries].filter((e) => !seen.has(e.url) && seen.add(e.url));
}
