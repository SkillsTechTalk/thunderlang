// Thunder Trace: how several repositories depend on each other, and what a change can affect. Browser-safe, no
// Node APIs (folders and git are read by trace-fs.mjs).
//
//   repos ──thunderModel + serviceFacts──▶ per repo: routes, listeners (what it offers)
//                                                  requests, publishes (what it asks of others)
//         ──buildTrace──▶ thunder-trace-v1: cross-repo links, each end cited repo@sha:file:line
//         ──traceImpact──▶ what a change can affect, one hop out, ranked by risk
//
// The rules (each one keeps an answer from turning into noise or a guess):
//   - Linked only on a fact: an HTTP request whose method and path match exactly one route in another repository,
//     or an event published under the same name another repository listens for.
//   - Paths every service has (/health, /metrics, …) and paths with no fixed part (/:id) are never linked across
//     repositories; they are listed in notLinked with the reason. Two routes that match equally are not chosen
//     between: both are named and nothing is linked.
//   - Impact stops at the first hop. The callers of a changed route are listed; their own callers are not, or one
//     shared service would list the whole estate.
//   - Every finding cites repo@sha:file:line. No citation, no finding.

import { thunderModel } from './model.mjs';
import { serviceFacts, segsMatch, GENERIC_PATHS } from './system.mjs';
import { sha256 } from './hash.mjs';
import { packagesIn, settingsIn, tablesIn, isManifest, LOCAL_VERSION, isGenericSetting, DEFINES } from './trace-data.mjs';

export const TRACE_SCHEMA = 'thunder-trace-v1';
export const TRACE_IMPACT_SCHEMA = 'thunder-trace-impact-v1';
export const TRACE_RULES_VERSION = '2';

/** Test and fixture files: what they declare or call is pretend, so it is left out of the links. */
export function isTestFile(file) {
  return /(^|\/)(tests?|__tests__|specs?|__mocks__|mocks?|fixtures?|__fixtures__|e2e|testdata|test-data)\//i.test(file)
    || /\.(test|spec|e2e)\.[a-z0-9]+$/i.test(file) || /(^|\/)test_[^/]+\.py$/.test(file) || /_test\.(go|py|rb|exs?)$/.test(file)
    || /(Tests?|Spec|IT)\.(cs|java|kt|scala)$/.test(file);
}

const short = (sha) => (sha ? String(sha).slice(0, 7) : 'working-tree');
/** repo@sha:file:line, the citation every finding carries. */
export function cite(repo, at) {
  return `${repo.name}@${short(repo.sha)}${repo.dirty ? '+changes' : ''}:${at.file}${at.line ? `:${at.line}` : ''}`;
}
const end = (repo, at, extra = {}) => ({ repo: repo.name, member: at.member, label: at.label, file: at.file, line: at.line, cite: cite(repo, at), ...extra });
const distinctive = (segs) => segs.some((s) => s !== '*');
// Across repositories, fixed path parts match whatever their case: ASP.NET routes ignore it, and /api/Items is
// the same route as /api/items there. (Inside one repository the linker's own rules apply.)
const lower = (segs) => segs.map((s) => s.toLowerCase());
const pathMatch = (a, b) => segsMatch(lower(a), lower(b));

/**
 * Read each repository and link them. repos: [{ name, files: [{ path, source }], sha?, dirty? }].
 * Gives back thunder-trace-v1: { repos, links, notLinked, rules, fingerprint }.
 */
export function buildTrace(repos) {
  const names = new Set();
  const read = repos.map((r) => {
    if (!r.name || names.has(r.name)) throw new Error(`Each repository needs its own name; "${r.name}" is used twice.`);
    names.add(r.name);
    const model = thunderModel(r.files, { name: r.name });
    const facts = serviceFacts(model, r.files);
    // Test code is not how services talk to each other: a test's fake route or request is never a link.
    const real = (x) => !isTestFile(x.file);
    const data = dataFacts(r.files, model);
    const testItems = ['routes', 'listeners', 'requests', 'publishes'].reduce((n, k) => n + facts[k].filter((x) => !real(x)).length, 0) + data.testItems;
    return { name: r.name, sha: r.sha ?? null, dirty: !!r.dirty, files: model.files.length, languages: [...new Set(model.files.map((f) => f.language))].sort(),
      routes: facts.routes.filter(real), listeners: facts.listeners.filter(real), requests: facts.requests.filter(real), publishes: facts.publishes.filter(real), unknown: facts.unknown.filter(real),
      packages: data.packages, settings: data.settings, tables: data.tables, testItems };
  });
  return linkRepos(read);
}

/** The member (function, method) whose lines hold `line` in `file`: the innermost one, or none. */
function memberAt(model, file, line) {
  let best = null;
  for (const m of model.members) {
    if (m.file !== file || !m.lines || line < m.lines[0] || line > m.lines[1]) continue;
    if (!best || m.lines[1] - m.lines[0] < best.lines[1] - best.lines[0]) best = m;
  }
  return best ? { member: best.id, label: best.label } : { member: null, label: file.split('/').pop() };
}

/**
 * Packages, settings, and tables of one repository (trace-data.mjs), each placed in the member it is written in.
 * Test and fixture files are left out and counted, as for routes.
 */
export function dataFacts(files, model) {
  const real = (x) => !isTestFile(x.file);
  const pk = packagesIn(files), settings = settingsIn(files), tables = tablesIn(files);
  const place = (x) => ({ ...x, ...memberAt(model, x.file, x.line) });
  const manifest = (x) => ({ ...x, member: null, label: x.file });
  const testItems = [...pk.publishes, ...pk.depends, ...settings, ...tables].filter((x) => !real(x)).length;
  return {
    packages: { publishes: pk.publishes.filter(real).map(manifest), depends: pk.depends.filter(real).map(manifest) },
    settings: settings.filter(real).map(place),
    tables: tables.filter(real).map((t) => (/\.sql$/i.test(t.file) ? { ...t, member: null, label: t.file } : place(t))),
    testItems,
  };
}
export { isManifest };

/** Link already-read repositories (each with routes, listeners, requests, publishes; packages, settings, tables). Pure and deterministic. */
export function linkRepos(read) {
  const links = [], notLinked = [];
  for (const repo of read) {
    for (const q of repo.requests) {
      // A request this repository answers itself is not a link between repositories.
      if (q.base === 'this app' && repo.routes.some((r) => methodOk(r.method, q.method) && pathMatch(r.segs, q.segs) >= 0)) continue;
      const from = end(repo, q);
      const call = `${q.method} ${q.path}`;
      if (GENERIC_PATHS.has(q.path) || !distinctive(q.segs)) {
        notLinked.push({ kind: 'http', call, from, why: GENERIC_PATHS.has(q.path) ? `every service has ${q.path}, so matching it to one repository would be a guess` : `${q.path} has no fixed part to match on` });
        continue;
      }
      const matches = [];
      for (const other of read) {
        if (other === repo) continue;
        for (const r of other.routes) {
          const score = methodOk(r.method, q.method) ? pathMatch(r.segs, q.segs) : -1;
          if (score >= 0) matches.push({ other, r, score });
        }
      }
      const best = Math.max(-1, ...matches.map((x) => x.score));
      const top = matches.filter((x) => x.score === best);
      if (top.length === 1) {
        const { other, r } = top[0];
        links.push({ kind: 'http', method: q.method, path: q.path, route: `${r.method} ${r.path}`, base: q.base, from, to: end(other, r) });
      } else if (top.length > 1) {
        notLinked.push({ kind: 'http', call, from, why: `${top.length} routes match equally (${top.map((x) => `${x.other.name}: ${x.r.method} ${x.r.path}`).join('; ')}), so none is chosen` });
      } else notLinked.push({ kind: 'http', call, from, why: q.base === 'this app' ? `no route Thunder read, in this repository or the others traced, handles ${call}` : `no route Thunder read in the traced repositories handles ${call}` });
    }
    for (const p of repo.publishes) {
      const from = end(repo, p);
      let found = repo.listeners.some((l) => l.event === p.event);
      for (const other of read) {
        if (other === repo) continue;
        for (const l of other.listeners) if (l.event === p.event) { links.push({ kind: 'event', event: p.event, from, to: end(other, l) }); found = true; }
      }
      if (!found) notLinked.push({ kind: 'event', call: `event ${p.event}`, from, why: `no listener Thunder read in the traced repositories waits for ${p.event}` });
    }
  }
  // Packages: a dependency on a package exactly one other traced repository publishes (package.json name, go.mod
  // module, .csproj PackageId). A package the repository publishes itself is its own, not a link.
  const pk = (r) => r.packages ?? { publishes: [], depends: [] };
  const publishers = new Map();
  for (const repo of read) for (const p of pk(repo).publishes) (publishers.get(p.package) ?? publishers.set(p.package, []).get(p.package)).push({ repo, p });
  for (const repo of read) {
    const own = new Set(pk(repo).publishes.map((p) => p.package));
    for (const d of pk(repo).depends) {
      if (own.has(d.package)) continue;
      const pubs = (publishers.get(d.package) ?? []).filter((x) => x.repo !== repo);
      const byRepo = [...new Map(pubs.map((x) => [x.repo.name, x])).values()];
      if (byRepo.length === 1) links.push({ kind: 'package', package: d.package, version: d.version ?? null, ...(d.dev ? { dev: true } : {}), from: end(repo, d), to: end(byRepo[0].repo, byRepo[0].p) });
      else if (byRepo.length > 1) notLinked.push({ kind: 'package', call: `package ${d.package}`, from: end(repo, d), why: `${byRepo.length} repositories publish ${d.package} (${byRepo.map((x) => x.repo.name).join(', ')}), so none is chosen` });
    }
  }
  // Tables: code or SQL that reads or writes a table exactly one other traced repository creates (CREATE TABLE in its
  // SQL). A repository that creates the table itself is using its own.
  const tb = (r) => r.tables ?? [];
  const creators = new Map();
  for (const repo of read) for (const t of tb(repo)) if (t.access === 'creates') (creators.get(t.table) ?? creators.set(t.table, []).get(t.table)).push({ repo, t });
  for (const repo of read) {
    const own = new Set(tb(repo).filter((t) => t.access === 'creates').map((t) => t.table));
    for (const t of tb(repo)) {
      if (DEFINES.has(t.access) || own.has(t.table)) continue;
      const owners = [...new Map((creators.get(t.table) ?? []).filter((x) => x.repo !== repo).map((x) => [x.repo.name, x])).values()];
      if (owners.length === 1) links.push({ kind: 'data', table: t.table, access: t.access, from: end(repo, t), to: end(owners[0].repo, owners[0].t) });
      else if (owners.length > 1) notLinked.push({ kind: 'data', call: `table ${t.name}`, from: end(repo, t), why: `${owners.length} repositories create a table named ${t.table} (${owners.map((x) => x.repo.name).join(', ')}), so none is chosen` });
    }
  }
  const shared = sharedFacts(read);

  const sortKey = (l) => `${l.from.cite}|${l.to?.cite ?? ''}|${l.kind}|${l.call ?? l.event ?? l.path ?? l.package ?? l.table ?? ''}`;
  // (A step inside a callback is read for the callback and for the function around it: the same call, once.)
  const once = (xs) => { const seen = new Set(); return xs.filter((x) => { const k = sortKey(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  links.splice(0, links.length, ...once(links).sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  notLinked.splice(0, notLinked.length, ...once(notLinked).sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  const repos = read.map(({ unknown, ...r }) => ({ ...r, unknown: unknown ?? [], packages: pk(r), settings: r.settings ?? [], tables: tb(r) }));
  const body = { schema: TRACE_SCHEMA, rulesVersion: TRACE_RULES_VERSION, repos, links, notLinked, shared };
  return { ...body, fingerprint: sha256(JSON.stringify(body)) };
}

/**
 * What more than one repository has in common without one depending on the other: the same setting key read, the
 * same table used, the same package at different versions. Facts worth knowing, not links.
 *   settings: [{ key, readers: [End] }]   keys every service reads for itself or the platform sets (PORT, NODE_ENV, VERCEL_ENV, …) are left out
 *   tables:   [{ table, users: [End + access] }]
 *   drift:    [{ package, versions: [{ version, at: [End] }] }]   versions that name a place (workspace:, file:) and peer ranges are left out
 */
function sharedFacts(read) {
  const group = (items) => { const m = new Map(); for (const [k, repo, x] of items) (m.get(k) ?? m.set(k, []).get(k)).push({ repo, x }); return m; };
  const manyRepos = (xs) => new Set(xs.map((y) => y.repo.name)).size > 1;
  const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const settings = [...group(read.flatMap((r) => (r.settings ?? []).filter((x) => !isGenericSetting(x.key)).map((x) => [x.key, r, x]))).entries()]
    .filter(([, xs]) => manyRepos(xs)).sort(byKey).map(([key, xs]) => ({ key, readers: xs.map(({ repo, x }) => end(repo, x)) }));
  const tables = [...group(read.flatMap((r) => (r.tables ?? []).map((x) => [x.table, r, x]))).entries()]
    .filter(([, xs]) => manyRepos(xs)).sort(byKey).map(([table, xs]) => ({ table, users: xs.map(({ repo, x }) => ({ ...end(repo, x), access: x.access })) }));
  // Drift is between repositories: each repository's set of versions for the package differs from another's. Two
  // manifests in one repository asking ^9 and ^9.39.5, as every other repository does too, is not drift. Peer
  // dependency ranges (>=19) say what a package accepts, not what is used, so they are left out.
  const drift = [];
  for (const [name, xs] of [...group(read.flatMap((r) => (r.packages?.depends ?? []).filter((d) => d.version && !d.peer && !LOCAL_VERSION.test(d.version)).map((d) => [d.package, r, d]))).entries()].sort(byKey)) {
    const versions = group(xs.map(({ repo, x }) => [x.version, repo, x]));
    const perRepo = new Set([...group(xs.map(({ repo, x }) => [repo.name, repo, x])).values()].map((ys) => [...new Set(ys.map((y) => y.x.version))].sort().join('|')));
    if (!manyRepos(xs) || versions.size < 2 || perRepo.size < 2) continue;
    drift.push({ package: name, versions: [...versions.entries()].sort(byKey).map(([version, ys]) => ({ version, at: ys.map(({ repo, x }) => end(repo, x)) })) });
  }
  return { settings, tables, drift };
}

const methodOk = (route, req) => route === req || route === 'ANY' || route === 'ALL';
const within = (line, ranges) => line != null && ranges.some(([a, b]) => line >= a && line <= b);
const overlaps = (lines, ranges) => !!lines && ranges.some(([a, b]) => a <= lines[1] && b >= lines[0]);

/**
 * What a change can affect, one hop out.
 * changes: [{ repo, file, ranges: [[from, to], …] (lines changed in the new file; [] for a removed file),
 *            status: 'added' | 'changed' | 'removed', before?: { routes, listeners, publishes } }]
 *   `before` is what the file offered before the change (read from the base commit); with it, a route or an event
 *   that was REMOVED is checked too: its callers in other repositories now reach nothing.
 * Gives back thunder-trace-impact-v1: { findings (high first), changed, stopsAt: 1 }.
 */
export function traceImpact(trace, changes) {
  const byName = new Map(trace.repos.map((r) => [r.name, r]));
  const findings = [];
  const touched = [];
  const packagesDone = new Set();
  // Every place outside `repo` that reads or writes `table` (for a dropped or removed table, linked or not).
  const usesElsewhere = (repo, table) => trace.repos.filter((o) => o.name !== repo.name).flatMap((o) => (o.tables ?? []).filter((t) => t.table === table && !DEFINES.has(t.access)).map((t) => ({ ...end(o, t), how: `${t.access} ${t.name}` })));
  for (const c of changes) {
    const repo = byName.get(c.repo);
    if (!repo) continue;
    const found = findings.length;
    const hit = (x) => x.file === c.file && (c.status === 'added' || overlaps(x.lines, c.ranges) || within(x.line, c.ranges));
    const routes = repo.routes.filter(hit), listeners = repo.listeners.filter(hit);
    const requests = repo.requests.filter((x) => x.file === c.file && (c.status === 'added' || within(x.line, c.ranges) || overlaps(x.lines, c.ranges)));
    const publishes = repo.publishes.filter((x) => x.file === c.file && (c.status === 'added' || within(x.line, c.ranges) || overlaps(x.lines, c.ranges)));

    for (const r of routes) {
      const callers = trace.links.filter((l) => l.kind === 'http' && l.to.repo === repo.name && l.to.member === r.member);
      findings.push({ risk: callers.length ? 'high' : 'low', kind: 'route-changed', says: callers.length ? `${r.method} ${r.path} changed, and ${count(callers.length, 'caller')} in other repositories ${callers.length === 1 ? 'depends' : 'depend'} on it` : `${r.method} ${r.path} changed; no traced repository calls it`, at: end(repo, r), dependents: callers.map((l) => ({ ...l.from, how: l.base === 'computed' ? 'matched by path; the base address is set when it runs' : l.base === 'this app' ? 'same path from another app' : `through ${l.base}` })) });
    }
    for (const p of publishes) {
      const ls = trace.links.filter((l) => l.kind === 'event' && l.from.repo === repo.name && l.from.member === p.member && l.event === p.event);
      findings.push({ risk: ls.length ? 'high' : 'low', kind: 'event-published', says: ls.length ? `publishes ${p.event}, which ${count(ls.length, 'listener')} in other repositories ${ls.length === 1 ? 'handles' : 'handle'}; a change to what it sends reaches them` : `publishes ${p.event}; nothing in the traced repositories listens for it`, at: end(repo, p), dependents: ls.map((l) => ({ ...l.to, how: `listens for ${p.event}` })) });
    }
    for (const q of requests) {
      const l = trace.links.find((x) => x.kind === 'http' && x.from.repo === repo.name && x.from.member === q.member && x.from.line === q.line);
      if (l) findings.push({ risk: 'medium', kind: 'request-changed', says: `a ${q.method} request to ${q.path} changed; it is handled in ${l.to.repo}`, at: end(repo, q), dependents: [{ ...l.to, how: `handles ${l.route}` }] });
    }
    for (const x of listeners) {
      const senders = trace.links.filter((l) => l.kind === 'event' && l.to.repo === repo.name && l.to.member === x.member);
      findings.push({ risk: 'low', kind: 'listener-changed', says: `the handler for ${x.event} changed${senders.length ? `; ${count(senders.length, 'publisher')} in other repositories ${senders.length === 1 ? 'sends' : 'send'} it` : ''}`, at: end(repo, x), dependents: senders.map((l) => ({ ...l.from, how: `publishes ${x.event}` })) });
    }
    // Tables: a changed definition reaches every repository that uses the table; a changed query depends on the
    // repository that creates the table.
    const lineHit = (x) => x.file === c.file && (c.status === 'added' || overlaps(x.lines, c.ranges) || within(x.line, c.ranges));
    const tablesHere = (repo.tables ?? []).filter(lineHit);
    for (const t of tablesHere.filter((x) => x.access === 'creates' || x.access === 'alters')) {
      const users = trace.links.filter((l) => l.kind === 'data' && l.to.repo === repo.name && l.table === t.table);
      findings.push({ risk: users.length ? 'high' : 'low', kind: 'table-changed', says: users.length ? `the ${t.name} table's ${t.access === 'creates' ? 'definition' : 'ALTER TABLE'} changed, and ${count(users.length, 'place')} in other repositories ${users.length === 1 ? 'uses' : 'use'} the table` : `the ${t.name} table's ${t.access === 'creates' ? 'definition' : 'ALTER TABLE'} changed; no traced repository uses the table`, at: end(repo, t), dependents: users.map((l) => ({ ...l.from, how: `${l.access} ${t.table}` })) });
    }
    for (const t of tablesHere.filter((x) => x.access === 'drops')) {
      const users = usesElsewhere(repo, t.table);
      findings.push({ risk: users.length ? 'high' : 'low', kind: 'table-dropped', says: users.length ? `DROP TABLE ${t.name}, but ${count(users.length, 'place')} in other repositories still ${users.length === 1 ? 'uses' : 'use'} it` : `DROP TABLE ${t.name}; no traced repository uses it`, at: end(repo, t), dependents: users });
    }
    for (const t of tablesHere.filter((x) => !DEFINES.has(x.access))) {
      const l = trace.links.find((x) => x.kind === 'data' && x.from.repo === repo.name && x.from.file === t.file && x.from.line === t.line && x.table === t.table);
      if (l) findings.push({ risk: 'medium', kind: 'query-changed', says: `SQL that ${t.access} ${t.name} changed; the table is created in ${l.to.repo}`, at: end(repo, t), dependents: [{ ...l.to, how: `creates ${t.table}` }] });
    }
    // Settings: a key other repositories read too, so a new name or value has to reach them as well.
    for (const k of (repo.settings ?? []).filter(lineHit)) {
      const others = (trace.shared?.settings?.find((x) => x.key === k.key)?.readers ?? []).filter((r) => r.repo !== repo.name);
      if (others.length) findings.push({ risk: 'low', kind: 'setting-changed', says: `code that reads the setting ${k.key} changed; ${count(new Set(others.map((o) => o.repo)).size, 'other repository')} ${new Set(others.map((o) => o.repo)).size === 1 ? 'reads' : 'read'} it too`, at: end(repo, k), dependents: others.map((o) => ({ ...o, how: `reads ${k.key}` })) });
    }
    // A package this repository publishes: code inside its folder changed, so the repositories that depend on it get
    // the change when they take the new version. Once per package.
    if (!isTestFile(c.file)) {
      for (const p of repo.packages?.publishes ?? []) {
        if (p.root && c.file !== p.root && !c.file.startsWith(`${p.root}/`)) continue;
        const key = `${repo.name}|${p.package}`;
        if (packagesDone.has(key)) continue;
        const deps = trace.links.filter((l) => l.kind === 'package' && l.to.repo === repo.name && l.package === p.package);
        if (!deps.length) continue;
        packagesDone.add(key);
        findings.push({ risk: 'medium', kind: 'package-changed', says: `${p.package} is published from here, and ${count(new Set(deps.map((d) => d.from.repo)).size, 'other repository')} ${new Set(deps.map((d) => d.from.repo)).size === 1 ? 'depends' : 'depend'} on it; the change reaches them when they take the new version`, at: end(repo, p), dependents: deps.map((l) => ({ ...l.from, how: `depends on ${p.package}${l.version ? ` ${l.version}` : ''}` })) });
      }
    }
    // Removed: what the file offered before and no longer offers.
    if (c.before) {
      const nowRoutes = new Set(repo.routes.filter((r) => r.file === c.file).map((r) => `${r.method} ${r.path}`));
      for (const r of c.before.routes || []) {
        if (nowRoutes.has(`${r.method} ${r.path}`)) continue;
        const callers = [];
        for (const other of trace.repos) {
          if (other.name === repo.name) continue;
          for (const q of other.requests) if (methodOk(r.method, q.method) && pathMatch(r.segs, q.segs) >= 0 && distinctive(q.segs) && !GENERIC_PATHS.has(q.path)) callers.push({ ...end(other, q), how: `still sends ${q.method} ${q.path}` });
        }
        findings.push({ risk: callers.length ? 'high' : 'low', kind: 'route-removed', says: callers.length ? `${r.method} ${r.path} was removed, but ${count(callers.length, 'caller')} in other repositories still ${callers.length === 1 ? 'sends' : 'send'} it` : `${r.method} ${r.path} was removed; no traced repository calls it`, at: { repo: repo.name, file: c.file, line: r.line, label: r.label, cite: `${cite(repo, r)} (before the change)` }, dependents: callers });
      }
      const nowEvents = new Set(repo.publishes.map((p) => p.event));
      for (const p of c.before.publishes || []) {
        if (nowEvents.has(p.event)) continue;
        const ls = [];
        for (const other of trace.repos) if (other.name !== repo.name) for (const l of other.listeners) if (l.event === p.event) ls.push({ ...end(other, l), how: `waits for ${p.event}` });
        findings.push({ risk: ls.length ? 'high' : 'low', kind: 'event-removed', says: ls.length ? `${p.event} is no longer published here, but ${count(ls.length, 'listener')} in other repositories ${ls.length === 1 ? 'waits' : 'wait'} for it` : `${p.event} is no longer published here; nothing else listens for it`, at: { repo: repo.name, file: c.file, line: p.line, label: p.label, cite: `${cite(repo, p)} (before the change)` }, dependents: ls });
      }
      const createsNow = new Set((repo.tables ?? []).filter((t) => t.access === 'creates').map((t) => t.table));
      for (const t of (c.before.tables || []).filter((x) => x.access === 'creates')) {
        if (createsNow.has(t.table)) continue;
        const users = usesElsewhere(repo, t.table);
        findings.push({ risk: users.length ? 'high' : 'low', kind: 'table-removed', says: users.length ? `the ${t.name} table is no longer created here, but ${count(users.length, 'place')} in other repositories still ${users.length === 1 ? 'uses' : 'use'} it` : `the ${t.name} table is no longer created here; no traced repository uses it`, at: { repo: repo.name, file: c.file, line: t.line, label: t.file, cite: `${cite(repo, t)} (before the change)` }, dependents: users });
      }
    }
    if (findings.length > found || routes.length || listeners.length || requests.length || publishes.length || c.before) touched.push({ repo: c.repo, file: c.file, status: c.status });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => rank[a.risk] - rank[b.risk] || a.at.cite.localeCompare(b.at.cite));
  return { schema: TRACE_IMPACT_SCHEMA, traceFingerprint: trace.fingerprint, findings, changed: touched, stopsAt: 1, note: 'Stops at the first hop: callers of the callers are not listed. Links are facts read from code (no code was run); a call whose address is worked out when it runs is not linked.' };
}

const count = (n, w) => `${n} ${n === 1 ? w : w.endsWith('y') ? `${w.slice(0, -1)}ies` : `${w}s`}`;

/**
 * Impact of one named thing: "POST /api/orders", "/api/orders/:id", an event name, "repo:file" or "repo:file:line".
 * Gives back the same shape as traceImpact, plus `matched` (what the term was read as), so a surprising answer
 * can be checked.
 */
export function traceImpactOf(trace, term) {
  const t = String(term).trim();
  const changes = [];
  const matched = [];
  const pre = t.match(/^(table|setting|package):\s*(.+)$/i);
  const data = pre && !byNameOf(trace, pre[1]) ? { kind: pre[1].toLowerCase(), name: pre[2].trim() } : null;
  const http = !data && t.match(/^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)\s+)?(\/\S*)$/i);
  const place = !data && t.match(/^([^:\s]+):([^:\s]+?)(?::(\d+))?$/);
  for (const repo of trace.repos) {
    if (data) {
      dataChanges(repo, data, changes, matched);
    } else if (http) {
      const segs = http[2].split('/').filter(Boolean).map((s) => (/^(:\w+|\{[^}]+\}|\*)$/.test(s) ? '*' : s));
      for (const r of repo.routes) if ((!http[1] || methodOk(r.method, http[1].toUpperCase())) && pathMatch(r.segs, segs) >= 0 && r.segs.length === segs.length) { changes.push({ repo: repo.name, file: r.file, ranges: [r.lines ?? [r.line, r.line]], status: 'changed' }); matched.push(`${repo.name}: route ${r.method} ${r.path}`); }
    } else if (place && byNameOf(trace, place[1])) {
      if (repo.name !== place[1]) continue;
      const line = place[3] ? Number(place[3]) : null;
      changes.push({ repo: repo.name, file: place[2], ranges: line ? [[line, line]] : [[1, Number.MAX_SAFE_INTEGER]], status: 'changed' });
      matched.push(`${repo.name}: ${place[2]}${line ? ` line ${line}` : ' (the whole file)'}`);
    } else {
      for (const p of repo.publishes) if (p.event === t) { changes.push({ repo: repo.name, file: p.file, ranges: [[p.line, p.line]], status: 'changed' }); matched.push(`${repo.name}: publishes ${p.event}`); }
      for (const l of repo.listeners) if (l.event === t) { changes.push({ repo: repo.name, file: l.file, ranges: [l.lines ?? [l.line, l.line]], status: 'changed' }); matched.push(`${repo.name}: listens for ${l.event}`); }
    }
  }
  // A plain name that is no route, event, or file: a table, setting, or package by that name.
  let asked = data;
  if (!data && !http && !(place && byNameOf(trace, place[1])) && !changes.length) {
    for (const kind of ['table', 'setting', 'package']) {
      for (const repo of trace.repos) dataChanges(repo, { kind, name: t }, changes, matched);
      if (changes.length) { asked = { kind, name: t }; break; }
    }
  }
  const r = traceImpact(trace, changes);
  if (asked) {
    // A table, setting, or package asks about that one thing, not whatever else sits on the same lines.
    const kinds = { table: /^(table-|query-)/, setting: /^setting-/, package: /^package-/ }[asked.kind];
    r.findings = r.findings.filter((f) => kinds.test(f.kind));
  } else if (!http && !(place && byNameOf(trace, place[1]))) {
    // An event name asks about that event only, not the route whose handler happens to publish it.
    r.findings = r.findings.filter((f) => /^(event-|listener-)/.test(f.kind) && f.says.includes(t));
  }
  return { ...r, term: t, matched };
}

/** The places in `repo` that define a table, read a setting, or publish a package named `ask.name`, as changes. */
function dataChanges(repo, ask, changes, matched) {
  if (ask.kind === 'table') {
    const want = ask.name.replace(/[`"[\]]/g, '').split('.').pop().toLowerCase();
    for (const x of (repo.tables ?? []).filter((y) => y.table === want && (y.access === 'creates' || y.access === 'alters'))) { changes.push({ repo: repo.name, file: x.file, ranges: [[x.line, x.line]], status: 'changed' }); matched.push(`${repo.name}: ${x.access} table ${x.name}`); }
  } else if (ask.kind === 'setting') {
    for (const x of (repo.settings ?? []).filter((y) => y.key === ask.name)) { changes.push({ repo: repo.name, file: x.file, ranges: [[x.line, x.line]], status: 'changed' }); matched.push(`${repo.name}: reads setting ${x.key}`); }
  } else {
    for (const x of (repo.packages?.publishes ?? []).filter((y) => y.package === ask.name)) { changes.push({ repo: repo.name, file: x.file, ranges: [[x.line, x.line]], status: 'changed' }); matched.push(`${repo.name}: publishes package ${x.package}`); }
  }
}
const byNameOf = (trace, name) => trace.repos.some((r) => r.name === name);

/** The trace as text, for the terminal. */
export function renderTrace(trace, { limit = 15 } = {}) {
  const out = [];
  out.push(`Thunder Trace: ${count(trace.repos.length, 'repository')}, ${count(trace.links.length, 'link')} between them`);
  out.push('');
  for (const r of trace.repos) {
    out.push(`${r.name} @ ${short(r.sha)}${r.dirty ? ' (with uncommitted changes)' : ''}: ${r.files} files${r.languages.length ? ` (${r.languages.join(', ')})` : ''}`);
    out.push(`  offers ${count(r.routes.length, 'route')} and listens for ${count(new Set(r.listeners.map((l) => l.event)).size, 'event')}; sends ${count(r.requests.length, 'request')} and publishes ${count(new Set(r.publishes.map((p) => p.event)).size, 'event')}`);
    const tables = r.tables ?? [], pk = r.packages ?? { publishes: [], depends: [] };
    const made = new Set(tables.filter((t) => t.access === 'creates').map((t) => t.table)), used = new Set(tables.filter((t) => !DEFINES.has(t.access)).map((t) => t.table));
    out.push(`  creates ${count(made.size, 'table')} and uses ${count(used.size, 'table')}; reads ${count(new Set((r.settings ?? []).map((k) => k.key)).size, 'setting')}; publishes ${count(new Set(pk.publishes.map((p) => p.package)).size, 'package')} and depends on ${count(new Set(pk.depends.map((d) => d.package)).size, 'package')}`);
  }
  if (trace.links.length) {
    out.push('', 'Links between repositories');
    for (const l of trace.links) {
      out.push(l.kind === 'http'
        ? `  ${l.from.repo} → ${l.to.repo}: ${l.from.label} sends ${l.method} ${l.path}, handled by ${l.to.label}${l.base === 'computed' ? ' (matched by path; the base address is set when it runs)' : ''}`
        : l.kind === 'event' ? `  ${l.from.repo} → ${l.to.repo}: ${l.from.label} publishes ${l.event}, handled by ${l.to.label}`
          : l.kind === 'package' ? `  ${l.from.repo} → ${l.to.repo}: depends on the package ${l.package}${l.version ? ` ${l.version}` : ''}${l.dev ? ' (for development)' : ''}, published by ${l.to.repo}`
            : `  ${l.from.repo} → ${l.to.repo}: ${l.from.label} ${l.access} the ${l.table} table, created by ${l.to.repo}`);
      out.push(`      ${l.from.cite}  →  ${l.to.cite}`);
    }
  }
  const sh = trace.shared ?? { settings: [], tables: [], drift: [] };
  const repoList = (ends) => [...new Set(ends.map((e) => e.repo))].join(', ');
  if (sh.tables.length) {
    out.push('', `Tables used by more than one repository: ${sh.tables.length}`);
    for (const x of sh.tables.slice(0, limit)) {
      out.push(`  ${x.table}: ${repoList(x.users)}`);
      for (const u of x.users.slice(0, 4)) out.push(`      ${u.access.padEnd(7)} ${u.cite}`);
      if (x.users.length > 4) out.push(`      … and ${x.users.length - 4} more`);
    }
    if (sh.tables.length > limit) out.push(`  … and ${sh.tables.length - limit} more (all of them with --json)`);
  }
  if (sh.settings.length) {
    out.push('', `Settings read by more than one repository: ${sh.settings.length} (a new name or value has to reach each one)`);
    for (const x of sh.settings.slice(0, limit)) out.push(`  ${x.key}: ${repoList(x.readers)}  (${x.readers.slice(0, 3).map((e) => e.cite).join(', ')}${x.readers.length > 3 ? ', …' : ''})`);
    if (sh.settings.length > limit) out.push(`  … and ${sh.settings.length - limit} more (all of them with --json)`);
  }
  if (sh.drift.length) {
    out.push('', `Packages at different versions: ${sh.drift.length}`);
    for (const x of sh.drift.slice(0, limit)) out.push(`  ${x.package}: ${x.versions.map((v) => `${v.version} in ${repoList(v.at)}`).join('; ')}`);
    if (sh.drift.length > limit) out.push(`  … and ${sh.drift.length - limit} more (all of them with --json)`);
  }
  if (trace.notLinked.length) {
    const shown = trace.notLinked.slice(0, limit);
    out.push('', `Not linked: ${count(trace.notLinked.length, 'call')} worth knowing about, but not a fact`);
    for (const n of shown) out.push(`  ${n.from.repo}: ${n.call}: ${n.why}  (${n.from.cite})`);
    if (trace.notLinked.length > shown.length) out.push(`  … and ${trace.notLinked.length - shown.length} more (all of them with --json)`);
  }
  const tests = trace.repos.reduce((n, r) => n + (r.testItems || 0), 0);
  if (tests) out.push('', `Left out: ${tests} ${tests === 1 ? 'item' : 'items'} (routes, requests, events, tables, settings, packages) in test and fixture files.`);
  out.push('', `Fingerprint ${trace.fingerprint.slice(0, 19)}… (rules v${trace.rulesVersion}). Read from code; nothing was run.`);
  return out.join('\n');
}

/** An impact result as text: high risk first, each finding with its citation and who depends on it. */
export function renderImpact(r) {
  const out = [];
  if (r.matched && !r.matched.length) return `"${r.term}" matched nothing: no route, event, file, table, setting, or package by that name in the traced repositories.`;
  const high = r.findings.filter((f) => f.risk === 'high').length;
  out.push(r.findings.length
    ? `Thunder Trace impact: ${count(r.findings.length, 'finding')}, ${high} high risk. Stops at the first hop.`
    : `Thunder Trace impact: nothing this change touches is called from, or calls into, another traced repository.`);
  if (r.matched) out.push(`Read "${r.term}" as: ${r.matched.join('; ')}`);
  for (const f of r.findings) {
    out.push('', `${f.risk.toUpperCase().padEnd(6)} ${f.at.repo}: ${f.says}`, `       ${f.at.cite}`);
    for (const d of f.dependents) out.push(`         ← ${d.repo}: ${d.label} (${d.how})  ${d.cite}`);
  }
  return out.join('\n');
}
