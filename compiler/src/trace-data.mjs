import { byText } from './text-order.mjs';
// Thunder Trace, the data side: packages, settings, and tables each repository declares or uses. Browser-safe, no
// Node APIs. trace.mjs links them across repositories; this file only reads them, with the line each one is on.
//
//   manifests (package.json, go.mod, requirements.txt, *.csproj) ──▶ packages: what a repository publishes, what it depends on
//   code (process.env.KEY, os.getenv("KEY"), …)                    ──▶ settings: each setting key read, and where
//   SQL files and SQL written in code                              ──▶ tables: created, altered, dropped, read, written
//
// Only what is written in the file counts. A setting key built from pieces, a table name inserted into SQL when it
// runs, or a package version decided by a lock file is not read, so it is never linked.

/** Line number (1-based) of a character offset. */
const lineAt = (text, index) => {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};
/** The 1-based line of the first line matching re, or null. */
const lineOf = (text, re) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return null;
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const baseName = (path) => path.split('/').pop();
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

// ── Packages ────────────────────────────────────────────────────────────────────────────────────────────

/** Is this file a package manifest Thunder Trace reads? */
export function isManifest(path) {
  const n = baseName(path);
  return n === 'package.json' || n === 'go.mod' || n === 'requirements.txt' || /\.csproj$/i.test(n);
}

/**
 * What each manifest publishes and depends on.
 * Gives back { publishes: [{ package, version?, file, line, root }], depends: [{ package, version?, dev?, file, line }] }.
 * `root` is the folder the published package's code lives in (the manifest's folder).
 */
export function packagesIn(files) {
  const publishes = [], depends = [];
  for (const f of files) {
    if (!isManifest(f.path)) continue;
    const text = String(f.source ?? '');
    const n = baseName(f.path);
    try {
      if (n === 'package.json') {
        const j = JSON.parse(text);
        if (typeof j.name === 'string' && j.name.trim()) publishes.push({ package: j.name, ...(j.version ? { version: String(j.version) } : {}), file: f.path, line: lineOf(text, /^\s*"name"\s*:/), root: dirOf(f.path) });
        for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
          for (const [name, version] of Object.entries(j[k] ?? {})) {
            depends.push({ package: name, version: String(version), ...(k === 'devDependencies' ? { dev: true } : {}), ...(k === 'peerDependencies' ? { peer: true } : {}), file: f.path, line: lineOf(text, new RegExp(`^\\s*"${esc(name)}"\\s*:`)) });
          }
        }
      } else if (n === 'go.mod') {
        const lines = text.split('\n');
        let inRequire = false;
        lines.forEach((raw, i) => {
          const line = raw.replace(/\/\/.*$/, '').trim();
          let m;
          if ((m = line.match(/^module\s+(\S+)/))) publishes.push({ package: m[1], file: f.path, line: i + 1, root: dirOf(f.path) });
          else if (/^require\s*\($/.test(line)) inRequire = true;
          else if (inRequire && line === ')') inRequire = false;
          else if ((m = inRequire ? line.match(/^(\S+)\s+(v\S+)/) : line.match(/^require\s+(\S+)\s+(v\S+)/))) depends.push({ package: m[1], version: m[2], file: f.path, line: i + 1 });
        });
      } else if (n === 'requirements.txt') {
        text.split('\n').forEach((raw, i) => {
          const line = raw.replace(/#.*/, '').trim();
          if (!line || line.startsWith('-')) return; // -r other.txt, -e ., --index-url: not a package
          const m = line.match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]*\])?\s*(.*)$/);
          if (m) depends.push({ package: m[1].toLowerCase().replace(/_/g, '-'), ...(m[2] ? { version: m[2].replace(/\s*;.*$/, '').trim() } : {}), file: f.path, line: i + 1 });
        });
      } else {
        // .csproj: PackageReference (what it depends on) and PackageId (what it publishes, when it is packed).
        for (const m of text.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)) depends.push({ package: m[1], ...(m[2] ? { version: m[2] } : {}), file: f.path, line: lineAt(text, m.index) });
        const id = text.match(/<PackageId>\s*([^<\s]+)\s*<\/PackageId>/);
        if (id) publishes.push({ package: id[1], file: f.path, line: lineAt(text, id.index), root: dirOf(f.path) });
      }
    } catch { /* a manifest Thunder cannot parse is not a package list */ }
  }
  return { publishes, depends };
}

/** A version that names a place, not a version: it says nothing to compare across repositories. */
export const LOCAL_VERSION = /^(workspace:|file:|link:|portal:|\.{0,2}\/|git\+|github:|https?:)/;

// ── Settings ───────────────────────────────────────────────────────────────────────────────────────────

const KEY = '([A-Za-z_][A-Za-z0-9_]*)';
const Q = `["'\`]`;
const SETTING_READS = [
  new RegExp(`\\bprocess\\.env\\.${KEY}`, 'g'),
  new RegExp(`\\bprocess\\.env\\[\\s*${Q}${KEY}${Q}\\s*\\]`, 'g'),
  new RegExp(`\\bimport\\.meta\\.env\\.${KEY}`, 'g'),
  new RegExp(`\\bDeno\\.env\\.get\\(\\s*${Q}${KEY}${Q}`, 'g'),
  new RegExp(`\\b(?:os\\.)?environ(?:\\.get)?\\s*[\\[(]\\s*${Q}${KEY}${Q}`, 'g'),
  new RegExp(`\\bos\\.getenv\\(\\s*${Q}${KEY}${Q}`, 'g'),
  new RegExp(`\\bos\\.(?:Getenv|LookupEnv)\\(\\s*"${KEY}"`, 'g'),
  new RegExp(`\\bSystem\\.getenv\\(\\s*"${KEY}"`, 'g'),
  new RegExp(`\\bEnvironment\\.GetEnvironmentVariable\\(\\s*"${KEY}"`, 'g'),
  new RegExp(`\\bENV(?:\\.fetch\\(\\s*|\\[\\s*)${Q}${KEY}${Q}`, 'g'),
  new RegExp(`\\benv::var(?:_os)?\\(\\s*"${KEY}"`, 'g'),
  new RegExp(`\\bgetenv\\(\\s*${Q}${KEY}${Q}`, 'g'),
  new RegExp(`\\$_ENV\\[\\s*${Q}${KEY}${Q}`, 'g'),
];

/** Settings every service reads for itself, or the platform sets: two repositories reading PORT share nothing. */
export const isGenericSetting = (key) => GENERIC_SETTINGS.has(key) || /^(VERCEL_|EAS_BUILD|GITHUB_|RUNNER_|npm_|NETLIFY|RENDER_|RAILWAY_|FLY_|HEROKU_|AWS_LAMBDA_|K_SERVICE|KUBERNETES_)/.test(key);
export const GENERIC_SETTINGS = new Set(['NODE_ENV', 'PORT', 'HOST', 'HOSTNAME', 'HOME', 'PATH', 'PWD', 'USER', 'SHELL', 'TMPDIR', 'TEMP', 'TMP', 'TZ', 'LANG', 'CI', 'DEBUG', 'ENV', 'ENVIRONMENT', 'APP_ENV', 'LOG_LEVEL', 'LOGLEVEL', 'VERBOSE', 'GITHUB_ACTIONS', 'npm_package_version', 'ASPNETCORE_ENVIRONMENT', 'DOTNET_ENVIRONMENT', 'PYTHONPATH', 'GOPATH', 'JAVA_HOME', 'NODE_OPTIONS', 'CI_COMMIT_SHA']);

/** Each setting key read in code, with its line: [{ key, file, line }]. */
export function settingsIn(files) {
  const out = [];
  for (const f of files) {
    if (isManifest(f.path) || /\.sql$/i.test(f.path)) continue;
    const text = String(f.source ?? '');
    if (!/env/i.test(text)) continue;
    const seen = new Set();
    for (const re of SETTING_READS) {
      for (const m of text.matchAll(re)) {
        const line = lineAt(text, m.index);
        const k = `${m[1]}|${line}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ key: m[1], file: f.path, line });
      }
    }
  }
  return out.sort((a, b) => byText(a.file, b.file) || a.line - b.line || byText(a.key, b.key));
}

// ── Tables ─────────────────────────────────────────────────────────────────────────────────────────────

const NAME = '((?:[`"\\[]?[A-Za-z_][\\w$]*[`"\\]]?\\.){0,2}[`"\\[]?[A-Za-z_][\\w$]*[`"\\]]?)';
// Words that can follow FROM / JOIN / INTO / UPDATE without being a table.
const NOT_TABLES = new Set(['select', 'set', 'where', 'values', 'dual', 'lateral', 'unnest', 'only', 'table', 'if', 'exists', 'not', 'the', 'a', 'an', 'my', 'your', 'this', 'that', 'each', 'all', 'json_table', 'information_schema', 'pg_catalog', 'sys']);

/** "public"."Orders" → { table: 'orders' (what links match on), name: 'public.Orders' (as written) }. */
export function tableName(raw) {
  const name = raw.replace(/[`"[\]]/g, '');
  return { table: name.split('.').pop().toLowerCase(), name };
}

/** Reads and writes in one piece of SQL, at character offset `at` of the file. */
function usesIn(sql, offsetOf, push) {
  const re = new RegExp(`\\b(DELETE\\s+FROM|INSERT\\s+(?:OR\\s+\\w+\\s+)?INTO|MERGE\\s+INTO|UPDATE|FROM|JOIN)\\s+${NAME}(\\s*\\()?`, 'gi');
  for (const m of sql.matchAll(re)) {
    const kw = m[1].toUpperCase().replace(/\s+/g, ' ');
    if (m[3] && (kw === 'FROM' || kw === 'JOIN')) continue; // FROM generate_series(…): a function, not a table
    const { table, name } = tableName(m[2]);
    if (NOT_TABLES.has(table) || NOT_TABLES.has(name.toLowerCase())) continue;
    // UPDATE names a table only when SET follows (UPDATE t SET, UPDATE t AS x SET); not "FOR UPDATE" or "DO UPDATE SET".
    if (kw === 'UPDATE' && (/\b(DO|FOR|KEY)\s*$/i.test(sql.slice(Math.max(0, m.index - 12), m.index)) || !/^\s*(?:(?:AS\s+)?\w+\s+)?SET\b/i.test(sql.slice(m.index + m[0].length)))) continue;
    push({ table, name, access: kw === 'FROM' || kw === 'JOIN' ? 'reads' : 'writes', at: offsetOf(m.index) });
  }
}

// A string is SQL only when it has a statement's shape, not just a SQL word first: "Delete your data from
// Profile" and "Update the app to continue" are sentences.
const SQL_SHAPES = [
  /^\s*SELECT\b[\s\S]*?\bFROM\s/i,
  /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s/i,
  /^\s*UPDATE\s+[\w."`[\]]+\s+(?:(?:AS\s+)?\w+\s+)?SET\s/i,
  /^\s*DELETE\s+FROM\s/i,
  /^\s*WITH\s+(?:RECURSIVE\s+)?\w+\s+AS\s*\(/i,
  /^\s*MERGE\s+INTO\s/i,
];
const isSql = (text) => SQL_SHAPES.some((re) => re.test(text));
// SQL written in code: strings that start with a SQL verb. Single-line '…' and "…"; `…`, """…""", '''…''' may span lines.
const CODE_STRINGS = /"""([\s\S]*?)"""|'''([\s\S]*?)'''|`((?:\\[\s\S]|[^`\\])*)`|"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'/g;

/**
 * Each table a file creates, alters, drops, reads, or writes: [{ table, name, access, file, line, lines? }].
 * SQL files are read whole; in code, only strings that start with a SQL verb are read as SQL.
 */
export function tablesIn(files) {
  const out = [];
  for (const f of files) {
    if (isManifest(f.path)) continue;
    const text = String(f.source ?? '');
    const push = (u) => out.push({ table: u.table, name: u.name, access: u.access, file: f.path, line: lineAt(text, u.at), ...(u.end != null ? { lines: [lineAt(text, u.at), lineAt(text, u.end)] } : {}) });
    if (/\.sql$/i.test(f.path)) {
      const clean = text.replace(/--[^\n]*/g, (s) => ' '.repeat(s.length)).replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
      const ddl = new RegExp(`\\b(CREATE(?:\\s+OR\\s+REPLACE)?(?:\\s+(?:TEMP|TEMPORARY|UNLOGGED|GLOBAL|LOCAL))*\\s+TABLE|ALTER\\s+TABLE|DROP\\s+TABLE)(?:\\s+IF\\s+(?:NOT\\s+)?EXISTS)?(?:\\s+ONLY)?\\s+${NAME}`, 'gi');
      const ddlSpans = [];
      for (const m of clean.matchAll(ddl)) {
        const { table, name } = tableName(m[2]);
        if (NOT_TABLES.has(table)) continue;
        const kw = m[1].toUpperCase();
        if (/TEMP/.test(kw)) continue; // a temporary table belongs to one session, not to the schema
        const end = clean.indexOf(';', m.index);
        const stop = end < 0 ? clean.length : end;
        ddlSpans.push([m.index, stop]);
        push({ table, name, access: kw.startsWith('CREATE') ? 'creates' : kw.startsWith('ALTER') ? 'alters' : 'drops', at: m.index, end: stop });
      }
      // Views, functions, and data changes in SQL files read and write tables too (not inside the table definitions,
      // where REFERENCES and defaults are not a use).
      // GRANT … TO and REVOKE … FROM name roles, not tables (REVOKE ALL ON t FROM public).
      const roles = [...clean.matchAll(/\b(?:GRANT|REVOKE)\b[^;]*/gi)].map((m) => [m.index, m.index + m[0].length]);
      const skip = [...ddlSpans, ...roles];
      usesIn(clean, (i) => i, (u) => { if (!skip.some(([a, b]) => u.at >= a && u.at <= b)) push(u); });
      continue;
    }
    if (!/\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(text)) continue;
    for (const m of text.matchAll(CODE_STRINGS)) {
      const body = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
      if (!isSql(body)) continue;
      const start = m.index + m[0].indexOf(body);
      usesIn(body, (i) => start + i, push);
    }
  }
  // The same table, file, line, and access once (a statement like UPDATE t … FROM t names it twice).
  const seen = new Set();
  return out.filter((t) => { const k = `${t.file}|${t.line}|${t.table}|${t.access}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => byText(a.file, b.file) || a.line - b.line || byText(a.table, b.table));
}

/** Does this access define the table (rather than use it)? */
export const DEFINES = new Set(['creates', 'alters', 'drops']);
