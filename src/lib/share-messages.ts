// The words around share links, in one place so every page explains them the same way.
import type { MadeLink } from "@/components/thunder/ShareLink";
import { buildPastedShareUrl, buildSharePath, LEVEL_NAMES, MAX_LINK_LENGTH, type FileLocation, type ShareLevel } from "./share-link.mjs";

const levelName = (level: string) => LEVEL_NAMES[level as ShareLevel] ?? "Big Picture";
const opens = (fn: string | null | undefined, level: string) => (fn ? `It opens ${fn} at ${levelName(level)}.` : `It opens the whole file at ${levelName(level)}.`);

/** A link for code pasted on this page: the code travels in the link's fragment, or a plain reason why it can't. */
export async function makePastedLink(opts: { code: string; file?: string | null; fn?: string | null; level: string }): Promise<MadeLink> {
  const made = await buildPastedShareUrl(window.location.origin, opts);
  if (made.ok) {
    return { ok: true, url: made.url, note: `${opens(opts.fn, opts.level)} The code travels inside the link itself (after the #), so it is never sent to thunderlang.dev; anyone with the link can read it.` };
  }
  if (made.reason === "empty") return { ok: false, message: "There is no code to share yet. Paste some code first." };
  return {
    ok: false,
    message: `This code is too long to share as a link: the link would be about ${made.length.toLocaleString("en-US")} characters, and links over ${MAX_LINK_LENGTH.toLocaleString("en-US")} break in chat apps and email. Thunder never stores your code on a server, so there is nowhere else to keep it. To share it, put the file in a public GitHub repository and open its GitHub address at thunderlang.dev/r, or share a smaller part of the code.`,
  };
}

/** A link to a public GitHub file at a function and level. */
export function makeGitHubLink(loc: FileLocation, fn: string | null, level: string): MadeLink {
  return { ok: true, url: `${window.location.origin}${buildSharePath({ ...loc, fn, level })}`, note: `${opens(fn, level)} Whoever opens it reads the file straight from GitHub in their own browser.` };
}
