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

export const TRACE_SCHEMA = 'thunder-trace-v1';
export const TRACE_IMPACT_SCHEMA = 'thunder-trace-impact-v1';
export const TRACE_RULES_VERSION = '1';

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
    const testItems = ['routes', 'listeners', 'requests', 'publishes'].reduce((n, k) => n + facts[k].filter((x) => !real(x)).length, 0);
    return { name: r.name, sha: r.sha ?? null, dirty: !!r.dirty, files: model.files.length, languages: [...new Set(model.files.map((f) => f.language))].sort(),
      routes: facts.routes.filter(real), listeners: facts.listeners.filter(real), requests: facts.requests.filter(real), publishes: facts.publishes.filter(real), unknown: facts.unknown.filter(real), testItems };
  });
  return linkRepos(read);
}

/** Link already-read repositories (each with routes, listeners, requests, publishes). Pure and deterministic. */
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
  const sortKey = (l) => `${l.from.cite}|${l.to?.cite ?? ''}|${l.kind}|${l.call ?? l.event ?? l.path ?? ''}`;
  // (A step inside a callback is read for the callback and for the function around it: the same call, once.)
  const once = (xs) => { const seen = new Set(); return xs.filter((x) => { const k = sortKey(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  links.splice(0, links.length, ...once(links).sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  notLinked.splice(0, notLinked.length, ...once(notLinked).sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
  const repos = read.map(({ unknown, ...r }) => ({ ...r, unknown: unknown ?? [] }));
  const body = { schema: TRACE_SCHEMA, rulesVersion: TRACE_RULES_VERSION, repos, links, notLinked };
  return { ...body, fingerprint: sha256(JSON.stringify(body)) };
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
  for (const c of changes) {
    const repo = byName.get(c.repo);
    if (!repo) continue;
    const hit = (x) => x.file === c.file && (c.status === 'added' || overlaps(x.lines, c.ranges) || within(x.line, c.ranges));
    const routes = repo.routes.filter(hit), listeners = repo.listeners.filter(hit);
    const requests = repo.requests.filter((x) => x.file === c.file && (c.status === 'added' || within(x.line, c.ranges) || overlaps(x.lines, c.ranges)));
    const publishes = repo.publishes.filter((x) => x.file === c.file && (c.status === 'added' || within(x.line, c.ranges) || overlaps(x.lines, c.ranges)));
    if (routes.length || listeners.length || requests.length || publishes.length || c.before) touched.push({ repo: c.repo, file: c.file, status: c.status });

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
    }
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
  const http = t.match(/^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)\s+)?(\/\S*)$/i);
  const place = t.match(/^([^:\s]+):([^:\s]+?)(?::(\d+))?$/);
  for (const repo of trace.repos) {
    if (http) {
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
  const r = traceImpact(trace, changes);
  // An event name asks about that event only, not the route whose handler happens to publish it.
  if (!http && !(place && byNameOf(trace, place[1]))) r.findings = r.findings.filter((f) => /^(event-|listener-)/.test(f.kind) && f.says.includes(t));
  return { ...r, term: t, matched };
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
  }
  if (trace.links.length) {
    out.push('', 'Links between repositories');
    for (const l of trace.links) {
      out.push(l.kind === 'http'
        ? `  ${l.from.repo} → ${l.to.repo}: ${l.from.label} sends ${l.method} ${l.path}, handled by ${l.to.label}${l.base === 'computed' ? ' (matched by path; the base address is set when it runs)' : ''}`
        : `  ${l.from.repo} → ${l.to.repo}: ${l.from.label} publishes ${l.event}, handled by ${l.to.label}`);
      out.push(`      ${l.from.cite}  →  ${l.to.cite}`);
    }
  }
  if (trace.notLinked.length) {
    const shown = trace.notLinked.slice(0, limit);
    out.push('', `Not linked: ${count(trace.notLinked.length, 'call')} worth knowing about, but not a fact`);
    for (const n of shown) out.push(`  ${n.from.repo}: ${n.call}: ${n.why}  (${n.from.cite})`);
    if (trace.notLinked.length > shown.length) out.push(`  … and ${trace.notLinked.length - shown.length} more (all of them with --json)`);
  }
  const tests = trace.repos.reduce((n, r) => n + (r.testItems || 0), 0);
  if (tests) out.push('', `Left out: ${count(tests, 'route, request, or event')} in test and fixture files.`.replace('route, request, or events', 'routes, requests, and events'));
  out.push('', `Fingerprint ${trace.fingerprint.slice(0, 19)}… (rules v${trace.rulesVersion}). Read from code; nothing was run.`);
  return out.join('\n');
}

/** An impact result as text: high risk first, each finding with its citation and who depends on it. */
export function renderImpact(r) {
  const out = [];
  if (r.matched && !r.matched.length) return `"${r.term}" matched nothing: no route, event, or file by that name in the traced repositories.`;
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
