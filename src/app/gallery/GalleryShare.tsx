"use client";
import { ShareLink } from "@/components/thunder/ShareLink";
import { makeGitHubLink } from "@/lib/share-messages";
import type { FileLocation } from "@/lib/share-link.mjs";

/** Copy the shared-reading link for a gallery entry: it opens the same function from GitHub, at the pinned commit. */
export function GalleryShare({ loc, fn }: { loc: FileLocation; fn: string }) {
  return <ShareLink make={() => makeGitHubLink(loc, fn, "flow")} label="Copy a share link" />;
}
