// Words for running containers, shared by the Kubernetes and Docker Compose readers (spec section 12): an image
// reference in words ("frontend (no tag, so whatever latest is)"), CPU and memory ("0.1 CPU", "128 MiB"), which
// settings hold secrets, and which other services a setting's value names ("redis:6379" -> the service redis).
// Deterministic and browser-safe; no regex here can backtrack.
import { SECRET_NAME } from './infra-words.mjs';
import { isSecretKey } from './infra-cloud.mjs';

/** `${VAR}` (Compose) or `$(VAR)` (Kubernetes): a value filled in when it starts. */
export const hasVar = (s) => /\$\{[A-Za-z_]|\$[A-Za-z_]|\$\([A-Za-z_]/.test(String(s ?? ''));

/** The parts of an image reference: 'gcr.io/proj/api:1.2@sha256:…' -> { name: 'api', repo, tag: '1.2', digest }. */
export function parseImage(ref) {
  const s = String(ref ?? '').trim();
  const at = s.indexOf('@');
  const digest = at >= 0 ? s.slice(at + 1) : null;
  const noDigest = at >= 0 ? s.slice(0, at) : s;
  const slash = noDigest.lastIndexOf('/');
  const colon = noDigest.lastIndexOf(':');
  const tag = colon > slash ? noDigest.slice(colon + 1) : null;
  const repo = colon > slash ? noDigest.slice(0, colon) : noDigest;
  return { ref: s, repo, name: repo.slice(repo.lastIndexOf('/') + 1), tag, digest, computed: hasVar(s) };
}

/** An image reference short enough for a step: a digest becomes ", pinned". */
export function imageShort(ref) {
  const im = parseImage(ref);
  return im.digest ? `${im.repo}${im.tag ? `:${im.tag}` : ''}, pinned` : im.ref;
}

/** The image a container runs, in words. */
export function imageWords(ref, later = 'worked out when it starts') {
  const im = parseImage(ref);
  if (im.computed) return `${im.ref} (${later})`;
  if (im.digest) return `${im.ref} (pinned to one exact image)`;
  if (!im.tag) return `${im.ref} (no tag, so whatever "latest" is when it starts)`;
  return im.ref;
}

/** What a fact says about an image that is not pinned to a digest, or null when it is pinned (or filled in later). */
export function imageNotPinned(ref, where) {
  const im = parseImage(ref);
  if (im.digest || im.computed || !im.repo) return null;
  if (!im.tag || im.tag === 'latest') return `${where} runs ${im.ref}${im.tag ? '' : ' (no tag, so "latest")'}, which can point to a different image every time it starts.`;
  return `${where} runs ${im.ref} without a pinned digest (@sha256:…), so the tag can be moved to a different image.`;
}

/** Kubernetes CPU in words: '100m' -> '0.1 CPU', '2' -> '2 CPUs'. */
export function cpuWords(q) {
  const s = String(q ?? '').trim();
  let n = null;
  if (/^\d+m$/.test(s)) n = Number(s.slice(0, -1)) / 1000;
  else if (/^\d+(\.\d+)?$/.test(s)) n = Number(s);
  if (n == null) return `${s} CPU`;
  return `${n} CPU${n > 1 ? 's' : ''}`;
}

const MEM = { Ki: 'KiB', Mi: 'MiB', Gi: 'GiB', Ti: 'TiB', K: 'KB', k: 'KB', M: 'MB', G: 'GB', T: 'TB', m: 'MB', g: 'GB', b: 'bytes', kb: 'KB', mb: 'MB', gb: 'GB' };
/** Memory or storage in words: '64Mi' -> '64 MiB', '1G' -> '1 GB', '512m' (Compose) -> '512 MB'. */
export function memWords(q) {
  const s = String(q ?? '').trim();
  const m = /^(\d+(?:\.\d+)?)\s*([A-Za-z]{0,2})$/.exec(s);
  if (!m) return s;
  if (!m[2]) return `${m[1]} bytes`;
  return MEM[m[2]] ? `${m[1]} ${MEM[m[2]]}` : s;
}

/** A setting's name that says it holds a secret (its value is never shown). */
export const isSecretName = (name) => isSecretKey(name) || SECRET_NAME.test(String(name ?? ''));

/** True when a literal value written for a secret-looking name is a real value, not a placeholder or a flag. */
export function secretLiteral(name, value) {
  if (!isSecretKey(name) || value == null) return false;
  const v = String(value).trim();
  if (!v || hasVar(v)) return false;
  return !/^(true|false|yes|no|on|off|\d+|enabled|disabled|none|null|changeme|<.*>)$/i.test(v);
}

const HOST_KEY = /(host|hostname|addr|address|url|uri|server|servers|endpoint|dsn|broker|brokers|connection|conn)$/i;

/**
 * The names of services a setting's value points at, from exact names only: 'redis:6379', 'http://api:3000/x',
 * 'postgres://user@db:5432/app', or a bare 'db' under a key like DB_HOST. `known` is the set of service names (null: any name, for matching across files later).
 */
export function servicesNamed(key, value, known) {
  const out = [];
  const v = String(value ?? '').trim();
  const add = (h) => { const host = String(h).toLowerCase(); if ((!known || known.has(host)) && !out.includes(host) && !/^(localhost|0\.0\.0\.0|127\.0\.0\.1)$/.test(host)) out.push(host); };
  for (const part of v.split(/[,\s]+/)) {
    if (!part) continue;
    const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(part);
    if (url) { add(url[1]); continue; }
    const hp = /^([A-Za-z0-9][\w.-]*):\d+$/.exec(part);
    if (hp) { add(hp[1]); continue; }
    if (HOST_KEY.test(String(key ?? '').replace(/[_-]/g, '')) && /^[A-Za-z0-9][\w.-]*$/.test(part)) add(part);
  }
  return out;
}

/** A command (a list or a string) as one line: ['node', 'server.js'] -> 'node server.js'. */
export const commandText = (xs) => (Array.isArray(xs) ? xs.map((x) => (/\s/.test(String(x)) ? `"${x}"` : String(x))).join(' ') : String(xs ?? ''));
