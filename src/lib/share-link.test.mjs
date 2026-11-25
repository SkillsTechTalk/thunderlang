// Run with: npm run site:test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSharePath, parseShareQuery, buildSharePath, rawFileUrl, githubFileUrl, parseGitHubUrl, isReadablePath,
  memberRef, findMemberByRef, encodeCode, decodeCode, buildPastedShareUrl, parsePastedFragment, MAX_LINK_LENGTH,
} from "./share-link.mjs";

const loc = { owner: "pallets", repo: "flask", ref: "3.0.3", path: "src/flask/app.py" };

test("a /r/ path parses into owner, repo, ref, and path", () => {
  assert.deepEqual(parseSharePath(["pallets", "flask", "3.0.3", "src", "flask", "app.py"]), { ok: true, value: loc });
  // A branch with a slash arrives as one encoded segment.
  assert.deepEqual(parseSharePath(["o", "r", "feature%2Fx", "a.py"]).value, { owner: "o", repo: "r", ref: "feature/x", path: "a.py" });
});

test("a /r/ path that can't name a public file says why", () => {
  assert.match(parseSharePath(["pallets", "flask"]).reason, /needs an owner/);
  assert.match(parseSharePath(["-bad", "flask", "main", "a.py"]).reason, /not a GitHub user/);
  assert.match(parseSharePath(["o", "..", "main", "a.py"]).reason, /not a GitHub repository/);
  assert.match(parseSharePath(["o", "r", "a..b", "a.py"]).reason, /not a branch/);
  assert.match(parseSharePath(["o", "r", "main", "..", "secret"]).reason, /file path/);
  assert.match(parseSharePath(["o", "r", "main", "%E0%A4%A"]).reason, /damaged/);
});

test("the query picks the function and level, with sensible defaults", () => {
  assert.deepEqual(parseShareQuery({ fn: "Flask.full_dispatch_request", level: "details" }), { fn: "Flask.full_dispatch_request", level: "details" });
  assert.deepEqual(parseShareQuery({ fn: "send" }), { fn: "send", level: "flow" });
  assert.deepEqual(parseShareQuery({}), { fn: null, level: "big-picture" });
  assert.deepEqual(parseShareQuery({ level: "bogus" }), { fn: null, level: "big-picture" });
  assert.deepEqual(parseShareQuery({ fn: "a", level: "original" }), { fn: "a", level: "original" });
  assert.deepEqual(parseShareQuery(new URLSearchParams("fn=a&level=text")), { fn: "a", level: "text" });
  assert.equal(parseShareQuery({ fn: "<script>" }).fn, null);
});

test("building a link and parsing it again gives the same reading", () => {
  const path = buildSharePath({ ...loc, fn: "Flask.full_dispatch_request", level: "flow" });
  assert.equal(path, "/r/pallets/flask/3.0.3/src/flask/app.py?fn=Flask.full_dispatch_request&level=flow");
  const [p, q] = path.split("?");
  assert.deepEqual(parseSharePath(p.split("/").slice(2)).value, loc);
  assert.deepEqual(parseShareQuery(new URLSearchParams(q)), { fn: "Flask.full_dispatch_request", level: "flow" });
  assert.equal(buildSharePath({ ...loc, ref: "feature/x" }), "/r/pallets/flask/feature%2Fx/src/flask/app.py");
  assert.equal(buildSharePath({ ...loc, fn: "toBooleanObject@851" }), "/r/pallets/flask/3.0.3/src/flask/app.py?fn=toBooleanObject%40851");
});

test("raw and GitHub addresses point at the same file and lines", () => {
  assert.equal(rawFileUrl(loc), "https://raw.githubusercontent.com/pallets/flask/3.0.3/src/flask/app.py");
  assert.equal(githubFileUrl(loc, [867, 883]), "https://github.com/pallets/flask/blob/3.0.3/src/flask/app.py#L867-L883");
  assert.equal(githubFileUrl(loc, [5, 5]), "https://github.com/pallets/flask/blob/3.0.3/src/flask/app.py#L5");
  assert.equal(githubFileUrl(loc), "https://github.com/pallets/flask/blob/3.0.3/src/flask/app.py");
});

test("a pasted GitHub address becomes a file location", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/pallets/flask/blob/3.0.3/src/flask/app.py#L867-L883"), { ...loc, lines: [867, 883] });
  assert.deepEqual(parseGitHubUrl("github.com/pallets/flask/blob/3.0.3/src/flask/app.py"), { ...loc, lines: null });
  assert.deepEqual(parseGitHubUrl("https://raw.githubusercontent.com/pallets/flask/3.0.3/src/flask/app.py"), { ...loc, lines: null });
  assert.equal(parseGitHubUrl("https://github.com/pallets/flask"), null);
  assert.equal(parseGitHubUrl("https://gitlab.com/a/b/blob/main/x.py"), null);
  assert.equal(parseGitHubUrl("not a url at all"), null);
});

test("only languages Thunder reads are fetched", () => {
  for (const f of ["a.py", "b.ts", "c.go", "d.rs", "E.java", "f.cs", "g.c", "h.sql", "Dockerfile", "ci.yml", "main.tf"]) assert.ok(isReadablePath(f), f);
  for (const f of ["logo.png", "README.md", "data.json", "archive.zip"]) assert.ok(!isReadablePath(f), f);
});

const members = [
  { id: "a.java#Utils#toBool#10", name: "toBool", lines: [10, 12] },
  { id: "a.java#Utils#toBool#20", name: "toBool", lines: [20, 30] },
  { id: "a.java#Utils#parse#40", name: "parse", lines: [40, 50] },
  { id: "a.java##main#60", name: "main", lines: [60, 70] },
];

test("a link names a function by Owner.name, adding @line only when needed", () => {
  assert.equal(memberRef(members[2], members), "Utils.parse");
  assert.equal(memberRef(members[3], members), "main");
  assert.equal(memberRef(members[1], members), "Utils.toBool@20");
});

test("the named function is found again, forgivingly", () => {
  assert.equal(findMemberByRef(members, "Utils.toBool@20"), members[1]);
  assert.equal(findMemberByRef(members, "Utils.toBool"), members[0]);
  assert.equal(findMemberByRef(members, "parse"), members[2]);
  assert.equal(findMemberByRef(members, "Utils.toBool@999"), members[0]);
  assert.equal(findMemberByRef(members, "missing"), null);
  assert.equal(findMemberByRef(members, null), null);
});

test("pasted code survives the trip through a link fragment", async () => {
  const code = "def fee(days):\n    if days > 30:\n        return 'late'  # ünïcödé ✓\n    return None\n";
  assert.equal(await decodeCode(await encodeCode(code)), code);
  const made = await buildPastedShareUrl("https://thunderlang.dev", { code, file: "/home/me/secret/fees.py", fn: "fee", level: "details" });
  assert.ok(made.ok);
  assert.match(made.url, /^https:\/\/thunderlang\.dev\/r#/);
  assert.ok(!made.url.includes("secret"), "only the file's name travels, not its folders");
  const back = await parsePastedFragment(new URL(made.url).hash);
  assert.deepEqual(back, { ok: true, value: { code, file: "fees.py", fn: "fee", level: "details" } });
});

test("pasted code that won't fit in a link is refused with its size", async () => {
  // Random-ish text compresses badly, so it overflows the limit.
  let code = "";
  for (let i = 0; i < 4000; i++) code += `x${(i * 7919) % 10007}=${(i * 104729) % 1000003};\n`;
  const made = await buildPastedShareUrl("https://thunderlang.dev", { code });
  assert.equal(made.ok, false);
  assert.equal(made.reason, "too-long");
  assert.ok(made.length > MAX_LINK_LENGTH);
  assert.deepEqual(await buildPastedShareUrl("https://thunderlang.dev", { code: "  " }), { ok: false, reason: "empty", length: 0, limit: MAX_LINK_LENGTH });
});

test("a damaged or empty fragment is reported, not guessed", async () => {
  assert.equal(await parsePastedFragment("#fn=x"), null);
  assert.equal(await parsePastedFragment(""), null);
  const bad = await parsePastedFragment("#code=1AAAA");
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /damaged/);
});
