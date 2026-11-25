// Read one gallery entry with the current compiler, at build time (and in the site tests). Nothing here is stored:
// the reading, its counts, and its Thunder Text are worked out from the vendored file every build.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { thunderModel, readLevel } from "../../compiler/src/model.mjs";
import { findMemberByRef } from "../lib/share-link.mjs";

/** Where an entry's vendored files live. */
export function sourcesDir(slug, root = process.cwd()) {
  return join(root, "src", "gallery", "sources", slug);
}

/**
 * The reading of an entry's function. Throws, with what to fix, when the file is missing, the function can't be
 * found, or the compiler now finds it on different lines (so the build fails rather than showing a wrong reading).
 * @param {import("./entries.mjs").GalleryEntry} entry
 */
export function readGalleryEntry(entry, root = process.cwd()) {
  const dir = sourcesDir(entry.slug, root);
  const source = readFileSync(join(dir, entry.file), "utf8");
  const licenses = entry.licenseFiles.map((f) => ({ file: f, text: readFileSync(join(dir, f), "utf8") }));
  const model = thunderModel([{ path: entry.path, source }], { name: entry.path });
  const member = findMemberByRef(model.members, entry.fn);
  if (!member) throw new Error(`Gallery entry ${entry.slug}: Thunder no longer finds ${entry.fn} in ${entry.path}.`);
  if (member.lines[0] !== entry.lines[0] || member.lines[1] !== entry.lines[1]) {
    throw new Error(`Gallery entry ${entry.slug}: Thunder reads ${entry.fn} at lines ${member.lines.join("-")}, the entry says ${entry.lines.join("-")}. Re-check the reading and update the entry.`);
  }
  const details = readLevel(model, "details", member.id);
  const text = readLevel(model, "text", member.id).text ?? "";
  const steps = details.steps?.length ?? 0;
  const notExplained = details.notExplained ?? 0;
  if (!steps) throw new Error(`Gallery entry ${entry.slug}: the reading of ${entry.fn} has no steps.`);
  return {
    source,
    licenses,
    memberId: member.id,
    label: member.label,
    youGive: member.youGive,
    youGetBack: member.youGetBack ?? null,
    steps,
    explained: steps - notExplained,
    notExplained,
    text,
    stops: details.stops?.length ?? 0,
    endings: (details.givesBack?.length ?? 0),
  };
}
