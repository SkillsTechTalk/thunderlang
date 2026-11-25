// Shareable readings: the links that open one Thunder reading.
//
//   GitHub file:  /r/<owner>/<repo>/<ref>/<path>?fn=<name>&level=<level>
//                 The browser fetches the public file from raw.githubusercontent.com and reads it; the server only
//                 ever sees the names in the URL, never the code.
//   Pasted code:  /r#code=<compressed>&file=<name>&fn=<name>&level=<level>
//                 Everything after # stays in the browser (browsers never send the fragment to a server), so the code
//                 travels inside the link itself. Only code that fits in a reasonable link can be shared this way.
//
// Pure functions, no DOM and no Next.js, so the site tests (npm run site:test) can check them in Node.

/** The levels a shared link can open at: the same five a reader can choose on the page. */
export const SHARE_LEVELS = ["big-picture", "flow", "details", "text", "original"];
export const LEVEL_NAMES = { "big-picture": "Big Picture", flow: "Flow", details: "Details", text: "Text", original: "Original" };
/** The largest file a shared link will fetch and read in the browser. */
export const MAX_FILE_BYTES = 300 * 1024;
/** The longest link "Copy link" will make for pasted code. Longer links break in chat apps, email, and some browsers. */
export const MAX_LINK_LENGTH = 8000;

/** File types Thunder reads (the same languages as /read). Anything else gets "unsupported language". */
const READABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|pyi|go|rs|cs|java|kt|kts|php|rb|sql|c|h|cpp|cc|cxx|hpp|hh|hxx|swift|r|sh|bash|zsh|ps1|psm1|tf|bicep|ya?ml)$/i;
const READABLE_NAMES = /(^|\/)(Dockerfile|Containerfile)(\.[\w.-]+)?$/i;

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^[A-Za-z0-9_.\-/]{1,200}$/;
const FN = /^[^\u0000-\u001f<>"`]{1,200}$/;

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return null; } };

/** Can Thunder read a file with this path? (By its extension or name, the same way /read detects a language.) */
export function isReadablePath(path) {
  return READABLE.test(path) || READABLE_NAMES.test(path);
}

/**
 * The file a /r/ link points at, from the route's segments (owner, repo, ref, then the path).
 * A branch name with a slash must be one segment (feature%2Fx); a commit SHA or tag is the usual case.
 * @returns {{ ok: true, value: { owner: string, repo: string, ref: string, path: string } } | { ok: false, reason: string }}
 */
export function parseSharePath(segments) {
  const parts = (segments ?? []).map((s) => (/%[0-9A-Fa-f]{2}/.test(s) ? safeDecode(s) : s));
  if (parts.some((p) => p === null)) return { ok: false, reason: "The link is damaged: part of it could not be decoded." };
  if (parts.length < 4) return { ok: false, reason: "The link needs an owner, a repository, a branch, tag, or commit, and a file path." };
  const [owner, repo, ref, ...rest] = parts;
  if (!OWNER.test(owner)) return { ok: false, reason: `"${owner}" is not a GitHub user or organization name.` };
  if (!REPO.test(repo) || repo === "." || repo === "..") return { ok: false, reason: `"${repo}" is not a GitHub repository name.` };
  if (!REF.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) return { ok: false, reason: `"${ref}" is not a branch, tag, or commit name.` };
  const segs = rest.flatMap((p) => p.split("/"));
  if (segs.some((s) => !s || s === "." || s === ".." || /[\u0000-\u001f]/.test(s))) return { ok: false, reason: "The file path in the link is not valid." };
  return { ok: true, value: { owner, repo, ref, path: segs.join("/") } };
}

/**
 * What to show, from the link's query: the function and the level. A missing or unknown level opens Flow when a
 * function is named and Big Picture when not.
 * @returns {{ fn: string | null, level: string }}
 */
export function parseShareQuery(query) {
  const get = (k) => {
    const v = query?.[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? null : typeof query?.get === "function" ? query.get(k) : null;
  };
  const rawFn = get("fn");
  const fn = rawFn && FN.test(rawFn.trim()) ? rawFn.trim() : null;
  const rawLevel = get("level");
  const level = SHARE_LEVELS.includes(rawLevel) ? rawLevel : fn ? "flow" : "big-picture";
  return { fn, level };
}

const enc = encodeURIComponent;

/** The /r/ path for a GitHub file, function, and level (relative; add the site's origin to share it). */
export function buildSharePath({ owner, repo, ref, path, fn, level }) {
  const base = `/r/${enc(owner)}/${enc(repo)}/${enc(ref)}/${String(path).split("/").map(enc).join("/")}`;
  const q = new URLSearchParams();
  if (fn) q.set("fn", fn);
  if (level && SHARE_LEVELS.includes(level)) q.set("level", level);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Where the browser fetches the file. */
export function rawFileUrl({ owner, repo, ref, path }) {
  return `https://raw.githubusercontent.com/${enc(owner)}/${enc(repo)}/${enc(ref)}/${String(path).split("/").map(enc).join("/")}`;
}

/** The file on GitHub, with its lines highlighted when given. */
export function githubFileUrl({ owner, repo, ref, path }, lines) {
  const base = `https://github.com/${enc(owner)}/${enc(repo)}/blob/${enc(ref)}/${String(path).split("/").map(enc).join("/")}`;
  if (!lines) return base;
  const [a, b] = lines;
  return a === b || !b ? `${base}#L${a}` : `${base}#L${a}-L${b}`;
}

/**
 * A GitHub file address someone pasted: a github.com/…/blob/… page, a raw.githubusercontent.com address, or either
 * without https://. A branch with a slash in its name can't be told apart from a folder here, so it is read as the
 * first segment; a commit SHA or tag always works.
 * @returns {{ owner: string, repo: string, ref: string, path: string, lines: [number, number] | null } | null}
 */
export function parseGitHubUrl(input) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(String(input).trim()) ? String(input).trim() : `https://${String(input).trim()}`); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const segs = url.pathname.split("/").filter(Boolean).map((s) => safeDecode(s) ?? s);
  let parts;
  if (host === "github.com" || host === "www.github.com") {
    if (segs.length < 5 || (segs[2] !== "blob" && segs[2] !== "raw")) return null;
    parts = [segs[0], segs[1], segs[3], ...segs.slice(4)];
  } else if (host === "raw.githubusercontent.com") {
    if (segs.length < 4) return null;
    parts = segs;
  } else return null;
  const parsed = parseSharePath(parts);
  if (!parsed.ok) return null;
  const m = /^#L(\d+)(?:-L(\d+))?$/.exec(url.hash);
  return { ...parsed.value, lines: m ? [Number(m[1]), Number(m[2] ?? m[1])] : null };
}

// ---- Members: which function a link names ----

/** The parts of a member id (file#Owner#name#line); the owner is "" for a top-level function. */
function idParts(id) {
  const p = String(id).split("#");
  return { owner: p.length >= 4 ? p[p.length - 3] : "", name: p[p.length - 2] ?? "", line: Number(p[p.length - 1]) };
}

/** The name a link uses for a member: name, or Owner.name for a method; with @line only when that name is ambiguous. */
export function memberRef(member, members = [member]) {
  const q = (m) => { const { owner } = idParts(m.id); return owner ? `${owner}.${m.name}` : m.name; };
  const name = q(member);
  const same = members.filter((m) => q(m) === name);
  return same.length > 1 ? `${name}@${member.lines[0]}` : name;
}

/** The member a link names (see memberRef). Falls back to a plain name, then to the first of several with that name. */
export function findMemberByRef(members, ref) {
  if (!ref) return null;
  const m = /^(.*?)(?:@(\d+))?$/.exec(String(ref).trim());
  const name = m[1];
  const line = m[2] ? Number(m[2]) : null;
  const q = (x) => { const { owner } = idParts(x.id); return owner ? `${owner}.${x.name}` : x.name; };
  let found = members.filter((x) => q(x) === name);
  if (!found.length) found = members.filter((x) => x.name === name);
  if (!found.length) return null;
  return (line != null && found.find((x) => x.lines[0] === line)) || found[0];
}

// ---- Pasted code: the code travels in the fragment ----

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pipeBytes(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The code as a fragment value: "1" + deflate + base64url, or "0" + base64url when the browser can't compress.
 * Never sent to a server: it is only ever put after # in a link.
 */
export async function encodeCode(code) {
  const bytes = new TextEncoder().encode(code);
  if (typeof CompressionStream === "function") return "1" + bytesToBase64Url(await pipeBytes(bytes, new CompressionStream("deflate")));
  return "0" + bytesToBase64Url(bytes);
}

/** The code back from a fragment value; throws when it is damaged. */
export async function decodeCode(value) {
  const kind = value.charAt(0);
  const bytes = base64UrlToBytes(value.slice(1));
  if (kind === "0") return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (kind !== "1") throw new Error("unknown encoding");
  if (typeof DecompressionStream !== "function") throw new Error("This browser can't open compressed links.");
  return new TextDecoder("utf-8", { fatal: true }).decode(await pipeBytes(bytes, new DecompressionStream("deflate")));
}

/**
 * A link for pasted code, or why there can't be one.
 * @returns {Promise<{ ok: true, url: string, length: number } | { ok: false, reason: "empty" | "too-long", length: number, limit: number }>}
 */
export async function buildPastedShareUrl(origin, { code, file, fn, level }) {
  if (!code || !code.trim()) return { ok: false, reason: "empty", length: 0, limit: MAX_LINK_LENGTH };
  const q = new URLSearchParams();
  if (file) q.set("file", String(file).split(/[\\/]/).pop());
  if (fn) q.set("fn", fn);
  if (level && SHARE_LEVELS.includes(level)) q.set("level", level);
  q.set("code", await encodeCode(code));
  const url = `${origin}/r#${q.toString()}`;
  return url.length > MAX_LINK_LENGTH ? { ok: false, reason: "too-long", length: url.length, limit: MAX_LINK_LENGTH } : { ok: true, url, length: url.length };
}

/**
 * Pasted code, the file name, function, and level from a link's fragment (with or without the leading #).
 * @returns {Promise<{ ok: true, value: { code: string, file: string, fn: string | null, level: string } } | { ok: false, reason: string } | null>}
 *   null when the fragment holds no code at all.
 */
export async function parsePastedFragment(hash) {
  const q = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  const raw = q.get("code");
  if (!raw) return null;
  let code;
  try { code = await decodeCode(raw); } catch (e) {
    return { ok: false, reason: e instanceof Error && /browser/.test(e.message) ? e.message : "The code in this link is damaged, often because the link was cut short when it was copied. Ask for the link again." };
  }
  const file = (q.get("file") ?? "").split(/[\\/]/).pop().slice(0, 200);
  const { fn, level } = parseShareQuery({ fn: q.get("fn"), level: q.get("level") });
  return { ok: true, value: { code, file, fn, level } };
}
