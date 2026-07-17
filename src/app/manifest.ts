import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThunderLang",
    short_name: "ThunderLang",
    description:
      "Intent-Oriented Programming for the AI era, by SkillsTech.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070E",
    theme_color: "#05070E",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
