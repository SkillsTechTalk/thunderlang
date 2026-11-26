// Thunder Why: an AI agent's run, explained in plain words (docs/why.md).
//
// Input: the record an agent run leaves behind, as OpenTelemetry spans. Accepted shapes:
//   - an OTLP/JSON export ({ resourceSpans: [...] }), or one such object per line (the collector's file exporter);
//   - the Python SDK's console exporter (pretty JSON objects one after another, or a JSON array of them);
//   - a JSON array of spans with `attributes` as a plain object.
// Spans are read with the OpenTelemetry GenAI conventions (gen_ai.*), the OpenInference conventions
// (openinference.span.kind, used by Phoenix and others), and the plain HTTP and database conventions.
//
// Output: what the agent was asked, what it did step by step, what it changed, what went wrong and what happened
// just before, and how sure Thunder is. Nothing is run and no AI is used: every sentence comes from the record,
// and each step cites its span. Values that look like secrets are hidden.

// ── Reading the record ────────────────────────────────────────────────────────────────────────────────────────

/** Split text holding JSON objects one after another (pretty-printed or not) into the objects. */
function jsonObjects(text) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}' && depth > 0) { depth--; if (depth === 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not JSON */ } } }
  }
  return out;
}

function parseInput(input) {
  if (typeof input !== 'string') return Array.isArray(input) ? input : [input];
  const t = input.trim();
  if (!t) return [];
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : [v]; } catch { return jsonObjects(t); }
}

const otlpValue = (v) => {
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return v.boolValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(otlpValue);
  if (v.kvlistValue) return Object.fromEntries((v.kvlistValue.values || []).map((a) => [a.key, otlpValue(a.value)]));
  return undefined;
};
const attrsOf = (x) => (Array.isArray(x) ? Object.fromEntries(x.map((a) => [a.key, otlpValue(a.value)])) : (x && typeof x === 'object' ? x : {}));

const nanos = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return v > 1e15 ? v : v * 1e6; // already nanoseconds, or milliseconds
  if (/^\d+$/.test(String(v))) return Number(v);
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms * 1e6 : null;
};
const hexId = (v) => (v == null ? null : String(v).replace(/^0x/i, '').toLowerCase() || null);

/** One raw span (any accepted shape) as { id, parent, trace, name, start, end, attrs, status, events }. */
function rawSpan(sp) {
  const ctx = sp.context || {};
  const statusCode = sp.status?.code ?? sp.status?.status_code ?? sp.status?.statusCode;
  return {
    id: hexId(sp.spanId ?? sp.span_id ?? ctx.span_id ?? sp.id),
    parent: hexId(sp.parentSpanId ?? sp.parent_span_id ?? sp.parent_id ?? sp.parentId) || null,
    trace: hexId(sp.traceId ?? sp.trace_id ?? ctx.trace_id),
    name: String(sp.name ?? ''),
    start: nanos(sp.startTimeUnixNano ?? sp.start_time ?? sp.startTime),
    end: nanos(sp.endTimeUnixNano ?? sp.end_time ?? sp.endTime),
    attrs: attrsOf(sp.attributes),
    failed: statusCode === 2 || /ERROR/i.test(String(statusCode ?? '')),
    statusMessage: sp.status?.message ?? sp.status?.description ?? null,
    events: (sp.events || []).map((e) => ({ name: e.name, attrs: attrsOf(e.attributes) })),
  };
}

function collectSpans(docs) {
  const out = [];
  for (const d of docs) {
    if (!d || typeof d !== 'object') continue;
    if (Array.isArray(d.resourceSpans)) {
      for (const rs of d.resourceSpans) {
        const service = attrsOf(rs.resource?.attributes)['service.name'];
        for (const ss of [...(rs.scopeSpans || []), ...(rs.instrumentationLibrarySpans || [])]) {
          for (const sp of ss.spans || []) out.push({ ...rawSpan(sp), service });
        }
      }
    } else if (Array.isArray(d.spans)) out.push(...collectSpans(d.spans));
    else if (d.name != null && (d.spanId || d.span_id || d.context || d.id)) out.push({ ...rawSpan(d), service: attrsOf(d.resource?.attributes)['service.name'] });
  }
  return out;
}

// ── Secrets and long values ───────────────────────────────────────────────────────────────────────────────────

const SECRET_KEY = /pass(word|wd)?$|secret|token|api[_-]?key|authori[sz]ation|^auth$|cookie|credential|private[_-]?key|card[_-]?number|cvv|ssn/i;
const SECRET_VALUE = /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{10,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)|Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
const HIDDEN = '(hidden)';

function hide(v, key = '') {
  if (key && SECRET_KEY.test(key)) return HIDDEN;
  if (typeof v === 'string') return v.replace(SECRET_VALUE, HIDDEN);
  if (Array.isArray(v)) return v.map((x) => hide(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hide(x, k)]));
  return v;
}
const maybeJson = (v) => { if (typeof v !== 'string') return v; const t = v.trim(); if (!/^[[{]/.test(t)) return v; try { return JSON.parse(t); } catch { return v; } };
const short = (s, n = 90) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** Arguments as "order_id 1042, amount 40" (at most four, secrets hidden). */
function argText(v) {
  v = hide(maybeJson(v));
  if (v == null || v === '') return '';
  if (typeof v !== 'object' || Array.isArray(v)) return short(typeof v === 'string' ? v : JSON.stringify(v), 70);
  const ks = Object.keys(v);
  const parts = ks.slice(0, 4).map((k) => `${k} ${short(typeof v[k] === 'string' ? v[k] : JSON.stringify(v[k]), 30)}`);
  return parts.join(', ') + (ks.length > 4 ? `, and ${ks.length - 4} more` : '');
}

// ── What each span is ─────────────────────────────────────────────────────────────────────────────────────────

/** Text of the messages in gen_ai.input.messages / gen_ai.output.messages (or OpenInference's flattened form). */
function messagesOf(a, which) {
  const raw = maybeJson(a[`gen_ai.${which}.messages`]);
  const out = [];
  if (Array.isArray(raw)) {
    for (const m of raw) {
      const text = typeof m.content === 'string' ? m.content
        : (m.parts || (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'text').map((p) => p.content ?? p.text).join(' ');
      const tools = [...(m.parts || []).filter((p) => p.type === 'tool_call').map((p) => p.name), ...(m.tool_calls || []).map((t) => t.function?.name ?? t.name)].filter(Boolean);
      out.push({ role: m.role, text: text || '', tools });
    }
    return out;
  }
  const oi = which === 'input' ? 'llm.input_messages' : 'llm.output_messages';
  for (let i = 0; i < 50; i++) {
    const role = a[`${oi}.${i}.message.role`];
    if (role == null) break;
    const tools = [];
    for (let j = 0; j < 20 && a[`${oi}.${i}.message.tool_calls.${j}.tool_call.function.name`] != null; j++) tools.push(a[`${oi}.${i}.message.tool_calls.${j}.tool_call.function.name`]);
    out.push({ role, text: String(a[`${oi}.${i}.message.content`] ?? ''), tools });
  }
  return out;
}

const READ_VERBS = new Set('get list search find lookup look fetch read query retrieve check view show describe count load browse inspect peek lookup_ verify validate calculate compute estimate summarize'.split(' '));
const CHANGE_VERBS = new Set('create add insert update set edit modify change delete remove drop cancel send post email notify message sms charge pay refund transfer write save store upload book reserve schedule submit approve reject close issue publish deploy merge push assign grant revoke rename move archive restore reset'.split(' '));

/** Does this step change anything? { effect: 'read'|'change'|'unknown'|'none', basis } */
function effectOf(s) {
  if (s.kind === 'model' || s.kind === 'agent') return { effect: 'none', basis: 'kind' };
  if (s.kind === 'retrieve') return { effect: 'read', basis: 'kind' };
  if (s.kind === 'http') {
    const m = String(s.method).toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(m)) return { effect: 'read', basis: 'method' };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return { effect: 'change', basis: 'method' };
    return { effect: 'unknown', basis: 'method' };
  }
  if (s.kind === 'db') {
    const op = String(s.dbOp || '').toUpperCase();
    if (/^(SELECT|FIND|GET|SCAN|QUERY|COUNT|AGGREGATE|SHOW|DESCRIBE|EXPLAIN|MGET|HGET|HGETALL|EXISTS)/.test(op)) return { effect: 'read', basis: 'operation' };
    if (/^(INSERT|UPDATE|DELETE|UPSERT|MERGE|REPLACE|CREATE|DROP|ALTER|TRUNCATE|SET|DEL|HSET|PUT|INCR|LPUSH|RPUSH)/.test(op)) return { effect: 'change', basis: 'operation' };
    return { effect: 'unknown', basis: 'operation' };
  }
  if (s.kind === 'tool') {
    const words = String(s.tool).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of words) {
      if (CHANGE_VERBS.has(w)) return { effect: 'change', basis: 'name' };
      if (READ_VERBS.has(w)) return { effect: 'read', basis: 'name' };
    }
    return { effect: 'unknown', basis: 'name' };
  }
  return { effect: 'unknown', basis: 'kind' };
}

/** A raw span as a step: what kind of thing happened, with the facts the story needs. */
function stepOf(r) {
  const a = r.attrs;
  const op = String(a['gen_ai.operation.name'] ?? '').toLowerCase();
  const oi = String(a['openinference.span.kind'] ?? '').toUpperCase();
  const tool = a['gen_ai.tool.name'] ?? a['tool.name'] ?? (oi === 'TOOL' ? r.name : null);
  const method = a['http.request.method'] ?? a['http.method'];
  const db = a['db.system.name'] ?? a['db.system'];
  let kind = 'other';
  if (op === 'invoke_agent' || op === 'create_agent' || oi === 'AGENT') kind = 'agent';
  else if (op === 'execute_tool' || oi === 'TOOL' || tool) kind = 'tool';
  else if (['chat', 'text_completion', 'generate_content', 'embeddings'].includes(op) || oi === 'LLM' || oi === 'EMBEDDING' || a['gen_ai.request.model'] || a['llm.model_name']) kind = 'model';
  else if (oi === 'RETRIEVER') kind = 'retrieve';
  else if (method) kind = 'http';
  else if (db) kind = 'db';
  const s = {
    id: r.id, parent: r.parent, trace: r.trace, name: r.name, start: r.start, end: r.end, service: r.service ?? null,
    durationMs: r.start != null && r.end != null && r.end >= r.start ? (r.end - r.start) / 1e6 : null,
    kind,
  };
  if (kind === 'agent') s.agent = a['gen_ai.agent.name'] ?? (r.name.replace(/^invoke_agent\s*/i, '') || r.name);
  if (kind === 'tool') { s.tool = String(tool ?? r.name.replace(/^execute_tool\s*/i, '')); s.args = a['gen_ai.tool.call.arguments'] ?? a['tool.parameters'] ?? a['input.value']; s.result = a['gen_ai.tool.call.result'] ?? a['output.value']; }
  if (kind === 'model') {
    s.model = a['gen_ai.response.model'] ?? a['gen_ai.request.model'] ?? a['llm.model_name'] ?? null;
    const outMsgs = messagesOf(a, 'output');
    s.decidedTools = [...new Set(outMsgs.flatMap((m) => m.tools))];
    s.said = outMsgs.map((m) => m.text).filter(Boolean).join(' ') || (typeof a['output.value'] === 'string' && !/^[[{]/.test(a['output.value'].trim()) ? a['output.value'] : '');
    const ins = messagesOf(a, 'input').filter((m) => m.role === 'user' && m.text);
    s.ask = ins.length ? ins[ins.length - 1].text : null;
    const fr = a['gen_ai.response.finish_reasons'];
    s.finish = Array.isArray(fr) ? fr[0] : fr ?? null;
  }
  if (kind === 'agent' && typeof a['input.value'] === 'string') s.ask = a['input.value'];
  if (kind === 'http') {
    s.method = String(method).toUpperCase();
    s.url = a['url.full'] ?? a['http.url'] ?? [a['server.address'] ?? a['net.peer.name'] ?? a['http.host'], a['url.path'] ?? a['http.target']].filter(Boolean).join('') ?? null;
    s.status = a['http.response.status_code'] ?? a['http.status_code'] ?? null;
  }
  if (kind === 'db') {
    const q = a['db.query.text'] ?? a['db.statement'];
    s.db = String(db);
    s.dbOp = a['db.operation.name'] ?? a['db.operation'] ?? (typeof q === 'string' ? q.trim().split(/\s+/)[0] : null);
    s.table = a['db.collection.name'] ?? a['db.sql.table'] ?? (typeof q === 'string' ? (q.match(/\b(?:from|into|update|table)\s+["`]?([\w.]+)/i) || [])[1] : null) ?? null;
  }
  // Failure: the span's status, an error.type, or (for a request) a 4xx/5xx answer.
  const exc = r.events.find((e) => e.name === 'exception');
  const httpBad = kind === 'http' && Number(s.status) >= 400;
  s.failed = r.failed || a['error.type'] != null || !!exc || httpBad;
  if (s.failed) {
    s.error = {
      type: exc?.attrs['exception.type'] ?? a['error.type'] ?? null,
      message: exc?.attrs['exception.message'] ?? r.statusMessage ?? null,
      status: s.status ?? a['http.response.status_code'] ?? null,
    };
  }
  if (kind === 'model' && !s.failed && ['length', 'max_tokens', 'content_filter'].includes(String(s.finish))) s.warning = String(s.finish);
  Object.assign(s, effectOf(s));
  return s;
}

// ── Errors in plain words ─────────────────────────────────────────────────────────────────────────────────────

/**
 * An error as plain words: { what, next? }. `what` never contains codes or jargon; the original stays in the
 * step's details.
 */
export function plainError({ type, message, status, finish } = {}) {
  const t = String(type ?? ''), m = String(message ?? ''), both = `${t} ${m}`;
  const st = Number(status);
  if (finish === 'length' || finish === 'max_tokens') return { what: "The AI's answer was cut off: it reached its length limit.", next: 'Allow a longer answer, or ask for a shorter one.' };
  if (finish === 'content_filter') return { what: "The AI's answer was held back by a safety filter.", next: 'Look at what was asked; rephrase it if the filter was wrong.' };
  if (/time ?out|timed out|deadline exceeded|ETIMEDOUT/i.test(both) || st === 408 || st === 504) return { what: 'It waited too long for an answer and gave up.', next: 'Check that the service is up and fast enough, or allow a longer wait.' };
  if (/ECONNREFUSED|connection ?refused|ConnectionError|ConnectError|ENOTFOUND|getaddrinfo|name or service not known|unreachable|ECONNRESET|connection reset/i.test(both)) return { what: "It couldn't reach the service.", next: 'Check that the service is running and its address is right.' };
  if (st === 401 || /unauthori[sz]ed|invalid api key|authentication/i.test(both)) return { what: "The service didn't accept its sign-in.", next: 'Check the key or sign-in it uses.' };
  if (st === 403 || /forbidden|permission denied|PermissionError|not allowed|access denied/i.test(both)) return { what: "It wasn't allowed to do that.", next: 'Check what this agent is permitted to do.' };
  if (st === 404 || /FileNotFoundError|ENOENT|no such file/i.test(both)) return { what: "What it asked for wasn't there.", next: 'Check the name or number it used.' };
  if (st === 409 || /conflict/i.test(both)) return { what: 'It clashed with a change made at the same time.', next: 'Try again once the other change is done.' };
  if (st === 429 || /rate.?limit|too many requests|quota/i.test(both)) return { what: 'It asked too often, and the service told it to slow down.', next: 'Wait and try again, or raise the limit.' };
  if (st >= 500 && st < 600) return { what: 'The service had a problem on its side.', next: "Look at the service's own logs for this time." };
  if (st === 400 || st === 422 || /validation|invalid (argument|input|request|parameter)/i.test(both)) return { what: "The service didn't accept what it sent.", next: 'Compare what was sent with what the service expects.' };
  if (/KeyError/.test(t)) return { what: `A name it looked for wasn't there${m ? `: ${short(m.replace(/^['"]|['"]$/g, ''), 40)}` : ''}.`, next: 'Check that the data has that name.' };
  if (/NoneType|undefined is not|of undefined|of null|null pointer|NullPointer|nil pointer/i.test(both)) return { what: 'A value it needed was empty.', next: 'Find where that value should have been set.' };
  if (/ZeroDivision|divide by zero|division by zero/i.test(both)) return { what: 'It tried to divide by zero.', next: 'Check the number it divided by.' };
  if (/JSONDecodeError|Unexpected token|not valid JSON|invalid json/i.test(both)) return { what: "What came back wasn't in the expected form.", next: 'Look at what the service or the AI actually returned.' };
  if (/ValueError|TypeError|invalid/i.test(both)) return { what: "A value wasn't in the form it expected.", next: 'Look at the value in the details.' };
  return { what: 'Something went wrong.', next: null };
}

// ── Building the story ────────────────────────────────────────────────────────────────────────────────────────

const human = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const hostPath = (u) => { try { const x = new URL(u); return `${x.host}${x.pathname === '/' ? '' : x.pathname}`; } catch { return String(u ?? ''); } };
const quote = (s, n = 90) => `"${short(hide(String(s)), n)}"`;
const secs = (ms) => (ms == null ? null : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} seconds`);
const MEANINGFUL = new Set(['agent', 'model', 'tool', 'http', 'db', 'retrieve']);

/** What a step did, as one plain sentence without its outcome. */
function doing(s) {
  switch (s.kind) {
    case 'agent': return `Handed the work to the agent "${s.agent}"`;
    case 'model': {
      const who = s.model ? `the AI (${s.model})` : 'the AI';
      if (s.decidedTools?.length) return `Asked ${who}, which decided to use ${s.decidedTools.map((t) => `"${t}"`).join(' and ')}`;
      if (s.said) return `Asked ${who}, which answered ${quote(s.said, 70)}`;
      return `Asked ${who}`;
    }
    case 'tool': { const args = argText(s.args); return `Used "${s.tool}"${args ? ` with ${args}` : ''}`; }
    case 'http': return `Called ${s.method} ${hostPath(s.url) || s.name}`;
    case 'db': return `Asked the database (${s.db}) to ${String(s.dbOp || 'run a query').toUpperCase()}${s.table ? ` ${/^(INSERT|UPSERT)/i.test(s.dbOp || '') ? 'into' : /^(SELECT|DELETE)/i.test(s.dbOp || '') ? 'from' : 'on'} ${s.table}` : ''}`;
    case 'retrieve': return 'Searched its documents';
    default: return `Ran "${s.name}"`;
  }
}

/** The outcome of a step (or a group of tries), as a short clause. */
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const ordinal = (n) => ['first', 'second', 'third', 'fourth', 'fifth'][n - 1] ?? `${n}th`;
function outcome(s) {
  const failedKid = [...(s.children || [])].reverse().find((k) => k.failed);
  if (s.failed && failedKid) return `it stopped because step ${failedKid.n} did not work`;
  if (s.failed) return lower(plainError({ ...s.error, finish: s.finish }).what.replace(/\.$/, ''));
  if (s.warning) return lower(plainError({ finish: s.warning }).what.replace(/\.$/, ''));
  const firstFail = (s.tries || []).find((t) => t.failed);
  if (firstFail) return `it worked on the ${ordinal(s.tries.length)} try (before that, ${lower(plainError(firstFail.error).what.replace(/\.$/, ''))})`;
  if (s.kind === 'http' && s.status != null) return `the service answered ${s.status}`;
  if (s.kind === 'model' || s.kind === 'agent') return '';
  return 'it worked';
}
const sentence = (s) => {
  const o = outcome(s);
  const tries = s.tries?.length > 1 && !(s.tries || []).every((t, i, xs) => i === xs.length - 1 || t.failed) ? '' : s.tries?.length > 1 && s.failed ? ` (${s.tries.length} tries)` : '';
  const body = `${doing(s)}${o ? `: ${o}` : ''}${tries}`;
  return /[.!?]["”]$/.test(body) ? body : `${body}.`;
};

/** Steps in time order, keeping the record's nesting but skipping wrappers that say nothing. */
function arrange(all) {
  const byId = new Map(all.map((s) => [s.id, s]));
  const kids = new Map();
  for (const s of all) {
    const p = s.parent && byId.has(s.parent) ? s.parent : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(s);
  }
  const order = (xs) => xs.sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
  const hasFailedMeaningful = (s) => (kids.get(s.id) || []).some((k) => (MEANINGFUL.has(k.kind) && k.failed) || hasFailedMeaningful(k));
  const build = (pid) => {
    const out = [];
    for (const s of order([...(kids.get(pid) || [])])) {
      const children = build(s.id);
      // A wrapper span (a chain, a function) is shown only if it failed and nothing inside it explains why.
      if (!MEANINGFUL.has(s.kind) && !(s.failed && !hasFailedMeaningful(s))) out.push(...children);
      else out.push({ ...s, children });
    }
    return groupTries(out);
  };
  const top = build(null);
  if (top.length === 1 && top[0].kind === 'agent' && top[0].children.length && (!top[0].failed || hasFailedMeaningful(top[0]))) return top[0].children;
  return top;
}

/** Back-to-back attempts at the same thing, where the earlier ones failed, become one step with `tries`. */
function groupTries(steps) {
  const key = (s) => `${s.kind}|${s.tool ?? ''}|${s.method ?? ''}|${s.url ?? ''}|${s.db ?? ''}|${s.dbOp ?? ''}|${s.kind === 'other' ? s.name : ''}`;
  const out = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (prev && s.kind !== 'model' && s.kind !== 'agent' && key(prev) === key(s) && prev.failed) {
      const tries = [...(prev.tries || [prev]), s];
      out[out.length - 1] = { ...s, start: tries[0].start, tries, children: tries.flatMap((t) => t.children || []) };
    } else out.push(s);
  }
  return out;
}

const flatten = (steps, depth = 0, out = []) => { for (const s of steps) { out.push({ step: s, depth }); flatten(s.children || [], depth + 1, out); } return out; };

/**
 * Explain one agent run. `input` is the record's text (or parsed JSON). Options: { run } picks a trace id when the
 * record holds several runs (default: the latest).
 */
export function explainRun(input, { run } = {}) {
  const raw = collectSpans(parseInput(input)).filter((r) => r.id);
  if (!raw.length) {
    return { ok: false, why: 'Thunder found no steps in this file. It reads OpenTelemetry traces: an OTLP JSON export, the collector\'s file exporter, or the Python console exporter.' };
  }
  const traces = new Map();
  for (const r of raw) { const k = r.trace ?? 'unknown'; if (!traces.has(k)) traces.set(k, []); traces.get(k).push(r); }
  const runs = [...traces.entries()].map(([id, spans]) => ({ id, spans, start: Math.min(...spans.map((s) => s.start ?? Infinity)), end: Math.max(...spans.map((s) => s.end ?? -Infinity)) }))
    .sort((x, y) => x.start - y.start);
  let chosen = runs[runs.length - 1];
  if (run) {
    chosen = runs.find((r) => r.id.startsWith(String(run).toLowerCase()));
    if (!chosen) return { ok: false, why: `No run in this file starts with ${run}. The runs are: ${runs.map((r) => r.id.slice(0, 8)).join(', ')}.` };
  }
  const all = chosen.spans.map(stepOf);
  const t0 = Number.isFinite(chosen.start) ? chosen.start : null;
  const tree = arrange(all);
  const flat = flatten(tree);
  flat.forEach((f, i) => { f.step.n = i + 1; f.step.at = t0 != null && f.step.start != null ? (f.step.start - t0) / 1e6 : null; });

  const agentStep = all.find((s) => s.kind === 'agent');
  const agentName = agentStep?.agent ?? null;
  const ask = all.filter((s) => s.ask).sort((x, y) => (x.start ?? 0) - (y.start ?? 0))[0]?.ask ?? null;
  const roots = all.filter((s) => !s.parent || !all.some((x) => x.id === s.parent));
  const durationMs = Number.isFinite(chosen.start) && Number.isFinite(chosen.end) ? (chosen.end - chosen.start) / 1e6 : null;

  // The problem: the last failed step that nothing later recovered from. A run whose top step failed stopped;
  // otherwise its failures were recovered from along the way.
  const failedSteps = flat.map((f) => f.step).filter((s) => s.failed && !(s.children || []).some((k) => k.failed));
  const stopped = roots.some((r) => r.failed) || (failedSteps.length > 0 && failedSteps[failedSteps.length - 1] === [...flat].reverse().find((f) => !(f.step.children || []).length)?.step);
  const problemStep = stopped ? failedSteps[failedSteps.length - 1] ?? flat.find((f) => f.step.failed)?.step ?? null : null;
  const lastFinal = [...flat].reverse().find((f) => f.step.kind === 'model' && f.step.said && !f.step.failed)?.step ?? null;

  let problem = null;
  if (problemStep) {
    const plain = plainError({ ...problemStep.error, finish: problemStep.finish });
    const tries = problemStep.tries?.length ?? 1;
    const ancestors = new Set();
    for (let p = problemStep.parent; p; p = all.find((x) => x.id === p)?.parent) ancestors.add(p);
    const firstTry = problemStep.tries?.[0] ?? problemStep;
    const before = flat.map((f) => f.step).filter((s) => s !== problemStep && !ancestors.has(s.id) && !(problemStep.tries || []).includes(s) && (s.start ?? 0) <= (firstTry.start ?? 0) && s.n < problemStep.n && !(s.children || []).length).pop() ?? null;
    const parentStep = flat.map((f) => f.step).find((s) => s.id === problemStep.parent && MEANINGFUL.has(s.kind) && s.kind !== 'agent');
    problem = {
      step: problemStep.n,
      inside: parentStep ? { step: parentStep.n, text: parentStep.kind === 'tool' ? `"${parentStep.tool}"` : doing(parentStep) } : null,
      what: `${doing(problemStep)}: ${lower(plain.what)}`.replace(/\.?$/, '.'),
      tries,
      before: before ? { step: before.n, text: sentence(before) } : null,
      wouldHaveChanged: tries > 1
        ? `If any of the ${tries} tries had worked, the run would have gone past this step. Thunder can't say what the agent would have done next.`
        : 'If this step had worked, the run would not have stopped here. Thunder can\'t say what the agent would have done next.',
      next: plain.next,
      details: detailsOf(problemStep),
    };
  }

  const stepById = new Map(flat.map((f) => [f.step.id, f.step]));
  const underChange = (s) => { for (let p = stepById.get(s.parent); p; p = stepById.get(p.parent)) if (p.effect === 'change' || p.effect === 'unknown') return true; return false; };
  const changes = flat.map((f) => f.step).filter((s) => s.effect === 'change' && !underChange(s)).map((s) => ({
    step: s.n, text: doing(s), worked: !s.failed, basis: s.basis, tries: s.tries?.length ?? 1,
  }));
  const unknown = flat.map((f) => f.step).filter((s) => s.effect === 'unknown' && !underChange(s)).map((s) => ({ step: s.n, text: doing(s) }));
  const recovered = stopped ? [] : [...failedSteps, ...flat.map((f) => f.step).filter((s) => !s.failed && (s.tries || []).some((t) => t.failed))]
    .sort((x, y) => x.n - y.n).map((s) => ({ step: s.n, text: sentence(s) }));
  const warnings = flat.map((f) => f.step).filter((s) => s.warning).map((s) => ({ step: s.n, text: plainError({ finish: s.warning }).what }));

  const status = stopped ? 'stopped' : recovered.length || warnings.length ? 'finished-with-problems' : 'finished';
  const who = agentName ? `The agent "${agentName}"` : 'The agent';
  const took = durationMs != null ? ` after ${secs(durationMs)}` : '';
  const headline = status === 'stopped' ? `${who} stopped with a problem${took}.`
    : status === 'finished-with-problems' ? `${who} finished${took}, but ${recovered.length + warnings.length === 1 ? 'one step' : `${recovered.length + warnings.length} steps`} had a problem along the way.`
    : `${who} finished${took} with no problems.`;

  return {
    ok: true,
    run: chosen.id,
    otherRuns: runs.filter((r) => r !== chosen).map((r) => r.id),
    status, headline,
    asked: ask ? short(hide(ask), 200) : null,
    answered: !stopped && lastFinal ? short(hide(lastFinal.said), 200) : null,
    problem, recovered, warnings, changes, unknown,
    durationMs,
    steps: flat.map(({ step: s, depth }) => ({
      n: s.n, depth, kind: s.kind, text: doing(s), outcome: outcome(s), sentence: sentence(s), failed: !!s.failed, effect: s.effect,
      tries: s.tries?.length ?? 1, atMs: s.at, durationMs: s.durationMs, span: s.id, details: detailsOf(s),
    })),
    spanCount: all.length,
  };
}

/** Everything the record says about one step, for `--step N` (secrets hidden, long text kept). */
function detailsOf(s) {
  const d = { kind: s.kind, span: s.id, name: s.name };
  for (const k of ['service', 'agent', 'tool', 'model', 'method', 'url', 'status', 'db', 'dbOp', 'table', 'finish']) if (s[k] != null) d[k] = s[k];
  if (s.args != null) d.arguments = hide(maybeJson(s.args));
  if (s.result != null) d.result = hide(maybeJson(s.result));
  if (s.ask) d.asked = hide(s.ask);
  if (s.said) d.answered = hide(s.said);
  if (s.error) d.error = hide(Object.fromEntries(Object.entries(s.error).filter(([, v]) => v != null)));
  if (s.tries) d.tries = s.tries.map((t) => ({ span: t.id, failed: !!t.failed, ...(t.error ? { error: hide(t.error) } : {}) }));
  if (s.durationMs != null) d.durationMs = Math.round(s.durationMs * 10) / 10;
  return d;
}

// ── Printing ──────────────────────────────────────────────────────────────────────────────────────────────────

const at = (ms) => (ms == null ? '' : `+${(ms / 1000).toFixed(1)}s`);
const basisNote = { name: "judged from the tool's name", method: 'judged from the request method', operation: 'judged from the database operation' };

/** The story as text: what happened, what went wrong, what changed, step by step, how sure. */
export function renderWhy(r) {
  if (!r.ok) return r.why;
  const L = [];
  L.push('What happened');
  L.push(`  ${r.headline}`);
  if (r.asked) L.push(`  It was asked: ${quote(r.asked, 160)}`);
  if (r.answered) L.push(`  It answered: ${quote(r.answered, 160)}`);
  L.push('');

  if (r.problem) {
    const p = r.problem;
    L.push('What went wrong');
    L.push(`  Step ${p.step}${p.inside ? `, part of step ${p.inside.step} ${p.inside.text}` : ''}. ${p.what}${p.tries > 1 ? ` It tried ${p.tries} times, then stopped.` : ''}`);
    if (p.before) L.push(`  Just before, step ${p.before.step}: ${p.before.text}`);
    L.push(`  ${p.wouldHaveChanged}`);
    if (p.next) L.push(`  What to do next: ${p.next}`);
    L.push(`  Details: ${detailLine(p.details)}`);
    L.push('');
  } else if (r.recovered.length || r.warnings.length) {
    L.push('Problems along the way');
    for (const x of r.recovered) L.push(`  Step ${x.step}. ${x.text} The run carried on.`);
    for (const x of r.warnings) L.push(`  Step ${x.step}. ${x.text}`);
    L.push('');
  }

  L.push('What it changed');
  if (!r.changes.length) L.push(`  Nothing. No step in the record changes anything${r.unknown.length ? ', but some steps could not be judged (below)' : ''}.`);
  for (const c of r.changes) {
    const how = basisNote[c.basis] ? ` (${basisNote[c.basis]})` : '';
    L.push(c.worked ? `  Step ${c.step}. Changed: ${c.text}${how}.`
      : `  Step ${c.step}. Tried to change, but it did not work: ${c.text}${how}. The record can't show whether anything was partly done.`);
  }
  if (r.unknown.length) L.push(`  Could not judge whether ${r.unknown.length === 1 ? 'this step changes' : 'these steps change'} anything: ${r.unknown.map((u) => `step ${u.step} (${u.text})`).join('; ')}.`);
  L.push('');

  L.push('Step by step');
  for (const s of r.steps) {
    const mark = s.failed ? '✗' : '✓';
    L.push(`  ${'   '.repeat(s.depth)}${mark} ${s.n}. ${s.sentence}${s.atMs != null ? `  ${at(s.atMs)}` : ''}`);
  }
  L.push('');
  L.push(`How sure: everything above is read from the agent's record (${r.spanCount} recorded step${r.spanCount === 1 ? '' : 's'}, run ${r.run.slice(0, 8)}). Thunder ran nothing and used no AI. Values that look like secrets are hidden. See one step in full with --step <n>.`);
  if (r.otherRuns.length) L.push(`This file holds ${r.otherRuns.length + 1} runs; this is the latest. Pick another with --run <id>: ${r.otherRuns.map((x) => x.slice(0, 8)).join(', ')}.`);
  return L.join('\n');
}

function detailLine(d) {
  const bits = [];
  if (d.method) bits.push(`${d.method} ${d.url ?? ''}`.trim());
  if (d.status != null) bits.push(`answered ${d.status}`);
  if (d.error?.type) bits.push(String(d.error.type));
  if (d.error?.message) bits.push(short(d.error.message, 120));
  bits.push(`span ${String(d.span).slice(0, 8)}`);
  return bits.join(' · ');
}

/** One step in full, for --step N. */
export function renderStep(r, n) {
  if (!r.ok) return r.why;
  const s = r.steps.find((x) => x.n === Number(n));
  if (!s) return `There is no step ${n}. This run has steps 1 to ${r.steps.length}.`;
  const L = [`Step ${s.n}. ${s.sentence}`];
  if (s.atMs != null) L.push(`  When: ${at(s.atMs)} into the run${s.durationMs != null ? `, took ${secs(s.durationMs)}` : ''}.`);
  const show = (k, v) => L.push(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`);
  for (const [k, v] of Object.entries(s.details)) if (!['kind', 'durationMs'].includes(k)) show(k, v);
  return L.join('\n');
}
