// Run with: npm run site:test
// The build-time check for the gallery: every entry must still be read by the current compiler, at the lines the
// entry names, with its source and license files present. The gallery pages run the same reader during `next build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { GALLERY } from "../gallery/entries.mjs";
import { readGalleryEntry, sourcesDir } from "../gallery/read-entry.mjs";
import { MAX_FILE_BYTES, buildSharePath, parseSharePath, parseShareQuery } from "./share-link.mjs";

test("the gallery covers the languages it promises", () => {
  const langs = new Set(GALLERY.map((e) => e.language));
  for (const l of ["Python", "JavaScript", "TypeScript", "Go", "Rust", "Java", "C#", "C", "SQL"]) assert.ok(langs.has(l), l);
  assert.equal(new Set(GALLERY.map((e) => e.slug)).size, GALLERY.length, "slugs are unique");
});

for (const entry of GALLERY) {
  test(`gallery: ${entry.slug} still reads without errors`, () => {
    assert.match(entry.sha, /^[0-9a-f]{40}$/, "pinned to a full commit SHA");
    assert.ok(["A", "B"].includes(entry.grade), "only accurate readings are kept");
    const dir = sourcesDir(entry.slug);
    for (const f of [entry.file, ...entry.licenseFiles]) assert.ok(existsSync(join(dir, f)), `${f} is vendored`);
    // The share link fetches the same file from GitHub, so it must fit the link's size limit too.
    assert.ok(statSync(join(dir, entry.file)).size <= MAX_FILE_BYTES, "fits a share link");
    const r = readGalleryEntry(entry);
    assert.ok(r.steps > 0);
    assert.equal(r.explained + r.notExplained, r.steps);
    assert.ok(r.text.trim().length > 0, "has Thunder Text");
    // Its share link opens this same function.
    const path = buildSharePath({ owner: entry.repo.split("/")[0], repo: entry.repo.split("/")[1], ref: entry.sha, path: entry.path, fn: entry.fn, level: "flow" });
    const [p, q] = path.split("?");
    assert.equal(parseSharePath(p.split("/").slice(2)).value.path, entry.path);
    assert.equal(parseShareQuery(new URLSearchParams(q)).fn, entry.fn);
  });
}
