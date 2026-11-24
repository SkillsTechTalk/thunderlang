// Dockerfiles in Thunder: how an app is packaged and started. Each build stage is one Steps card ("Image build" for
// a single stage, or the stage's own name), its instructions read in words: "Starts from node:22-slim", "Copies
// package.json into the image", "Installs what it needs (npm ci)", "Opens port 3000", "Starts with npm start". The
// image it makes is a Resource that knows what it starts from, its ports, its user, how it starts, and its settings
// (a value only when the file writes it, never a secret's). Deterministic, browser-safe, line by line.
import { shellSteps, commandSays, listWords, lc, cap, SECRET_NAME } from './infra-words.mjs';

const BUILT = 'worked out when it is built';
const hasVar = (s) => /\$\{?[A-Za-z_]/.test(String(s));
const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();

/** Instructions with their lines: continuation lines joined, comments skipped, heredocs kept with their body. */
export function dockerInstructions(src) {
  const lines = String(src ?? '').replace(/^﻿/, '').split('\n').map((l) => l.replace(/\r$/, ''));
  let escape = '\\';
  // Parser directives (`# escape=\``) are only read at the very top.
  for (const l of lines) { const m = /^#\s*([a-z]+)\s*=\s*(\S+)\s*$/i.exec(l); if (!m) break; if (m[1].toLowerCase() === 'escape') escape = m[2]; }
  const out = [];
  let comments = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) { comments = []; continue; }
    if (t.startsWith('#')) { comments.push(t.replace(/^#+\s?/, '')); continue; }
    const line = i + 1;
    let text = '';
    let cur = lines[i];
    // Join lines that end with the escape character; comment and blank lines inside are skipped.
    while (true) {
      const tr = cur.replace(/\s+$/, '');
      if (tr.endsWith(escape) && i + 1 < lines.length) {
        text += `${tr.slice(0, -1)} `;
        i++;
        while (i < lines.length && (/^\s*#/.test(lines[i]) || !lines[i].trim()) && i + 1 < lines.length) i++;
        cur = lines[i];
        continue;
      }
      text += tr;
      break;
    }
    const m = /^\s*([A-Za-z]+)\s*(.*)$/.exec(text);
    if (!m) continue;
    const ins = { op: m[1].toUpperCase(), args: m[2].trim(), line, endLine: i + 1, ...(comments.length ? { doc: comments.join(' ') } : {}) };
    comments = [];
    // Heredocs: RUN <<EOF … EOF, COPY <<EOF /path … EOF.
    const hd = /<<-?\s*["']?([A-Za-z_]\w*)["']?/.exec(ins.args);
    if (hd && (ins.op === 'RUN' || ins.op === 'COPY' || ins.op === 'ADD')) {
      const body = [];
      const bodyLine = i + 2;
      while (++i < lines.length && lines[i].trim() !== hd[1]) body.push(lines[i]);
      ins.heredoc = { word: hd[1], body: body.join('\n'), line: bodyLine };
      ins.endLine = i + 1;
    }
    out.push(ins);
  }
  return out;
}

/** `["npm", "start"]` -> 'npm start'; shell form stays as written. */
function execForm(args) {
  const a = String(args).trim();
  if (!a.startsWith('[')) return { text: a, exec: false };
  try { const arr = JSON.parse(a); if (Array.isArray(arr)) return { text: arr.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' '), exec: true, parts: arr }; } catch { /* not JSON: shell form */ }
  return { text: a, exec: false };
}

/** Flags at the start of an instruction (`--from=build --chown=app`), and the rest. */
function flags(args) {
  const f = {};
  let rest = String(args).trim();
  let m;
  while ((m = /^--([\w-]+)(?:=(\S*))?\s*/.exec(rest))) { f[m[1]] = m[2] ?? true; rest = rest.slice(m[0].length); }
  return { f, rest };
}

/** KEY=value pairs (or the old `KEY value` form), with quotes removed. */
function pairs(args) {
  const a = String(args).trim();
  if (!/^[\w.-]+=/.test(a)) { const m = /^(\S+)\s+(.*)$/.exec(a); return m ? [{ key: m[1], value: m[2].replace(/^["']|["']$/g, '') }] : a ? [{ key: a, value: null }] : []; }
  const out = [];
  let i = 0;
  while (i < a.length) {
    while (a[i] === ' ') i++;
    let k = '';
    while (i < a.length && a[i] !== '=' && a[i] !== ' ') k += a[i++];
    if (!k) break;
    if (a[i] !== '=') { out.push({ key: k, value: null }); continue; }
    i++;
    let v = '';
    if (a[i] === '"' || a[i] === "'") { const q = a[i++]; while (i < a.length && a[i] !== q) { if (a[i] === '\\' && q === '"') i++; v += a[i++]; } i++; }
    else while (i < a.length && a[i] !== ' ') { if (a[i] === '\\') i++; v += a[i++]; }
    out.push({ key: k, value: v });
  }
  return out;
}

const imageWords = (image) => (image.toLowerCase() === 'scratch' ? 'nothing (an empty image)' : `${image}${hasVar(image) ? ` (${BUILT})` : ''}`);
const sourcesWords = (srcs) => (srcs.length === 1 && (srcs[0] === '.' || srcs[0] === './') ? 'the whole project folder' : listWords(srcs));
const destWords = (dest, srcs = []) => (!dest || dest === '.' || dest === './' || (srcs.length === 1 && dest.replace(/^\.\/|\/$/g, '') === srcs[0].replace(/^\.\/|\/$/g, '')) ? 'into the image' : `into ${dest}`);
const portWords = (ports) => `${ports.length === 1 ? 'port' : 'ports'} ${listWords(ports.map((p) => p.replace(/\/tcp$/i, '').replace(/^(\d+)\/udp$/i, '$1 (UDP)')))}`;
const userWords = (u) => (/^(root|0)(:.*)?$/.test(u) ? 'root, the user that can do anything' : `the user ${u}`);

/**
 * Read a Dockerfile: stages as Steps items (kind 'function'), plus the Resource it makes, its settings, facts, and the
 * links between stages. `file` names the image after its folder.
 */
export function readDockerfile(src, file = 'Dockerfile') {
  const all = dockerInstructions(src);
  const stages = [];
  const globalArgs = [];
  for (const ins of all) {
    if (ins.op === 'FROM') {
      const { f, rest } = flags(ins.args);
      const m = /^(\S+)(?:\s+AS\s+(\S+))?/i.exec(rest);
      stages.push({ from: m?.[1] ?? rest, name: m?.[2] ?? null, platform: f.platform, line: ins.line, doc: ins.doc, ins: [] });
    } else if (!stages.length) { if (ins.op === 'ARG') globalArgs.push(ins); }
    else stages.at(-1).ins.push(ins);
  }
  const stageNames = new Map([...stages.map((s, i) => [String(i), i]), ...stages.filter((s) => s.name).map((s) => [s.name.toLowerCase(), stages.indexOf(s)])]);
  const stageOf = (ref) => stageNames.get(String(ref).toLowerCase());
  const single = stages.length === 1;
  const itemName = (s, i) => (s.name ?? (single ? 'image build' : `stage ${i + 1}`));
  const stageLabel = (s, i) => (single && !s.name ? 'Image build' : s.name ? `The ${words(s.name)} stage` : `Stage ${i + 1}`);
  const items = [], settings = [], facts = [], links = [];
  const fact = (kind, says, line) => facts.push({ id: `${file}#${kind}#${line}`, kind, says, file, line });
  const setting = (name, source, line, secret = SECRET_NAME.test(name)) => { if (!settings.some((x) => x.name === name && x.source === source)) settings.push({ name, source, secret, file, line, ...(source === 'computed' ? { computed: true } : {}) }); };

  for (const a of globalArgs) for (const p of pairs(a.args)) setting(p.key, 'parameter', a.line);

  stages.forEach((s, i) => {
    const steps = [];
    const prev = stageOf(s.from);
    if (prev != null && prev < i) {
      steps.push({ kind: 'call', says: `Starts from the ${words(stages[prev].name ?? `stage ${prev + 1}`)} stage`, code: `FROM ${s.from}`, line: s.line });
      links.push({ from: `${itemName(s, i)}:${s.line}`, to: `${itemName(stages[prev], prev)}:${stages[prev].line}`, kind: 'uses', file, line: s.line });
    } else {
      steps.push({ kind: 'call', says: `Starts from ${imageWords(s.from)}${s.platform ? ` for ${s.platform}` : ''}`, code: `FROM ${s.from}`, line: s.line });
      if (!/^scratch$/i.test(s.from) && !/@sha256:/.test(s.from)) fact('image-not-pinned', `It starts from ${s.from} without a pinned digest (@sha256:…), so the image it starts from can change between builds.`, s.line);
    }
    const last = [];
    let cmd = null, entry = null;
    for (const ins of s.ins) {
      const code = `${ins.op} ${ins.args}`.trim();
      const step = (says, kind = 'call', extra = {}) => ({ kind, says, code, line: ins.line, ...extra });
      const { f, rest } = flags(ins.args);
      switch (ins.op) {
        case 'WORKDIR': steps.push(step(`Works in ${rest}${hasVar(rest) ? ` (${BUILT})` : ''}`)); break;
        case 'COPY': case 'ADD': {
          if (ins.heredoc) { steps.push(step(`Writes the file ${rest.replace(/<<-?\s*["']?\w+["']?\s*/, '').trim() || 'shown here'} into the image`)); break; }
          const ex = execForm(rest);
          const parts = ex.exec ? ex.parts : rest.split(/\s+/).filter(Boolean);
          const dest = parts.length > 1 ? parts.at(-1) : null;
          const srcs = parts.length > 1 ? parts.slice(0, -1) : parts;
          const from = f.from != null ? stageOf(f.from) : undefined;
          const where = f.from == null ? '' : from != null ? ` from the ${words(stages[from].name ?? `stage ${from + 1}`)} stage` : ` from the image ${f.from}`;
          if (from != null) links.push({ from: `${itemName(s, i)}:${s.line}`, to: `${itemName(stages[from], from)}:${stages[from].line}`, kind: 'uses', file, line: ins.line });
          const remote = ins.op === 'ADD' && srcs.some((x) => /^(https?|git):\/\//.test(x) || /^git@/.test(x));
          const unpack = ins.op === 'ADD' && srcs.some((x) => /\.(tar(\.\w+)?|tgz|tbz2|txz)$/i.test(x));
          steps.push(step(remote ? `Downloads ${listWords(srcs)} ${destWords(dest)}` : `Copies ${sourcesWords(srcs)}${where} ${destWords(dest, f.from == null ? srcs : [])}${unpack ? ' (and unpacks it)' : ''}`));
          break;
        }
        case 'RUN': {
          const ex = execForm(rest);
          if (ins.heredoc) { steps.push(...shellSteps(ins.heredoc.body, ins.heredoc.line)); break; }
          const inner = shellSteps(ex.text, ins.line).map((st) => ({ ...st, code: st.code ?? code }));
          if (f.mount && /type=secret/.test(String(f.mount))) { const id = /id=([\w-]+)/.exec(String(f.mount))?.[1]; if (id) setting(id, 'secret', ins.line, true); inner.forEach((st) => { st.says += id ? ` (uses the secret ${id})` : ' (uses a secret)'; }); }
          steps.push(...inner);
          break;
        }
        case 'ENV': for (const p of pairs(ins.args)) {
          const secret = SECRET_NAME.test(p.key);
          const computed = hasVar(p.value ?? '');
          setting(p.key, computed ? 'computed' : 'literal', ins.line, secret);
          if (secret && p.value && !computed) fact('secret-in-plain-env', `ENV ${p.key} has its value written in the Dockerfile, where anyone with the image can read it.`, ins.line);
          steps.push(step(secret ? `Sets ${p.key} (its value is written here, not shown)` : `Sets ${p.key} to ${p.value ?? 'nothing'}${computed ? ` (${BUILT})` : ''}`, 'set'));
        } break;
        case 'ARG': for (const p of pairs(ins.args)) {
          setting(p.key, 'parameter', ins.line);
          if (p.value && SECRET_NAME.test(p.key) && !hasVar(p.value)) fact('secret-in-plain-env', `ARG ${p.key} has a default value written in the Dockerfile.`, ins.line);
          steps.push(step(`Takes the setting ${p.key}${p.value != null && !SECRET_NAME.test(p.key) ? ` (${p.value === '' ? 'empty' : p.value} unless told otherwise)` : ''}`, 'set'));
        } break;
        case 'EXPOSE': steps.push(step(`Opens ${portWords(rest.split(/\s+/).filter(Boolean))}`)); break;
        case 'USER': steps.push(step(`Runs as ${userWords(rest)}`)); break;
        case 'VOLUME': { const ex = execForm(rest); const v = ex.exec ? ex.parts : rest.split(/\s+/).filter(Boolean); steps.push(step(`Keeps ${listWords(v)} in a volume (saved outside the image)`)); break; }
        case 'HEALTHCHECK': {
          if (/^NONE$/i.test(rest)) { steps.push(step('Turns off health checks')); break; }
          const c = /^CMD\s+(.*)$/i.exec(rest);
          const how = c ? execForm(c[1]).text.replace(/\s*\|\|\s*exit\s+1\s*$/, '') : rest;
          steps.push(step(`Checks its health with ${how}${f.interval ? ` every ${f.interval}` : ''}`, 'check'));
          break;
        }
        case 'CMD': cmd = { ins, text: execForm(rest).text }; break;
        case 'ENTRYPOINT': entry = { ins, text: execForm(rest).text }; break;
        case 'LABEL': steps.push(step(`Labels the image with ${listWords(pairs(ins.args).map((p) => p.key))}`)); break;
        case 'SHELL': steps.push(step(`Uses ${execForm(rest).text} to run later commands`)); break;
        case 'STOPSIGNAL': steps.push(step(`Stops when it gets the signal ${rest}`)); break;
        case 'MAINTAINER': steps.push(step(`Names its maintainer: ${rest}`)); break;
        case 'ONBUILD': { const inner = /^(\w+)\s*(.*)$/.exec(rest); steps.push(step(`When another image is built from this one, it will ${inner ? lc(onbuildWords(inner[1], inner[2])) : rest}`)); break; }
        default: steps.push({ kind: 'other', says: code, code, line: ins.line });
      }
    }
    // How it starts is the last thing a stage says, wherever the line is.
    if (entry || cmd) {
      const says = entry && cmd ? `Starts with ${entry.text}, given ${cmd.text}` : `Starts with ${(entry ?? cmd).text}`;
      last.push({ kind: 'call', says, code: [entry, cmd].filter(Boolean).map((x) => `${x.ins.op} ${x.ins.args}`).join('\n'), line: (entry ?? cmd).ins.line });
    }
    steps.push(...last);
    const name = itemName(s, i);
    const end = Math.max(s.line, ...s.ins.map((x) => x.endLine));
    const readable = steps.filter((x) => x.kind !== 'other').length;
    items.push({
      id: `${name}:${s.line}`, name, label: stageLabel(s, i), title: `What ${single && !s.name ? 'the image build' : lc(stageLabel(s, i))} does`, line: s.line, endLine: end,
      inputs: [], returns: null, ...(s.doc ? { doc: s.doc } : {}), provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0,
      stepsReadable: steps.length ? Math.round((readable / steps.length) * 100) / 100 : 0,
      says: `${stageLabel(s, i)} starts from ${prev != null && prev < i ? `the ${words(stages[prev].name ?? `stage ${prev + 1}`)} stage` : s.from} and has ${steps.length} step${steps.length === 1 ? '' : 's'}.`,
      headline: `${stageLabel(s, i)}: starts from ${prev != null && prev < i ? `the ${words(stages[prev].name ?? `stage ${prev + 1}`)} stage` : s.from}.`, guards: [], unread: [],
    });
  });

  // The image this file makes: the last stage, with what it inherits from the stages it starts from.
  const things = [];
  if (stages.length) {
    const chain = [];
    for (let k = stages.length - 1; k != null;) { chain.unshift(k); const p = stageOf(stages[k].from); k = p != null && p < k ? p : null; }
    const base = stages[chain[0]];
    const knows = [];
    const know = (name, label, kind, line, extra = {}) => knows.push({ name, label, kind, start: null, line, ...extra });
    know('starts-from', 'Starts from', imageWords(base.from), base.line, hasVar(base.from) ? { computed: true } : {});
    let user = null, workdir = null, cmd = null, entry = null, health = null;
    const ports = [], env = new Map(), volumes = [];
    for (const k of chain) for (const ins of stages[k].ins) {
      const { rest } = flags(ins.args);
      if (ins.op === 'USER') user = { v: rest, line: ins.line };
      else if (ins.op === 'WORKDIR') workdir = { v: rest, line: ins.line };
      else if (ins.op === 'EXPOSE') for (const p of rest.split(/\s+/).filter(Boolean)) ports.push({ v: p, line: ins.line });
      else if (ins.op === 'CMD') cmd = { v: execForm(rest).text, line: ins.line };
      else if (ins.op === 'ENTRYPOINT') entry = { v: execForm(rest).text, line: ins.line };
      else if (ins.op === 'HEALTHCHECK') health = { v: rest, line: ins.line };
      else if (ins.op === 'VOLUME') volumes.push({ v: execForm(rest).exec ? execForm(rest).parts.join(', ') : rest, line: ins.line });
      else if (ins.op === 'ENV') for (const p of pairs(ins.args)) env.set(p.key, { v: p.value, line: ins.line });
    }
    if (workdir) know('works-in', 'Works in', workdir.v, workdir.line);
    if (ports.length) know('opens', ports.length === 1 ? 'Opens port' : 'Opens ports', listWords(ports.map((p) => p.v.replace(/\/tcp$/i, ''))), ports[0].line);
    know('runs-as', 'Runs as', user ? userWords(user.v) : 'root, the user that can do anything (it has no USER line)', user?.line ?? null);
    if (!user || /^(root|0)(:.*)?$/.test(user.v)) fact('runs-as-root', user ? `The image runs as ${user.v}, the user that can do anything.` : 'The image runs as root, the user that can do anything: its last stage has no USER line.', user?.line ?? stages.at(-1).line);
    if (entry || cmd) know('starts-with', 'Starts with', entry && cmd ? `${entry.v}, given ${cmd.v}` : (entry ?? cmd).v, (entry ?? cmd).line);
    if (health && !/^NONE$/i.test(health.v)) know('health', 'Checks its health with', (/^CMD\s+(.*)$/i.exec(health.v)?.[1] ?? health.v).replace(/\s*\|\|\s*exit\s+1\s*$/, ''), health.line);
    for (const v of volumes) know('volume', 'Keeps in a volume', v.v, v.line);
    for (const [k, v] of env) {
      const secret = SECRET_NAME.test(k);
      const computed = hasVar(v.v ?? '');
      know(k, k, secret ? 'a secret setting (its value is not shown)' : computed ? `a setting, ${BUILT}` : `a setting: ${v.v ?? 'nothing'}`, v.line, { setting: true, ...(computed ? { computed: true } : {}), ...(secret ? { secret: true } : {}) });
    }
    const path = String(file).replace(/\\/g, '/');
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')).split('/').pop() : '';
    things.push({ kind: 'resource', resourceType: 'docker-image', address: `image:${path}`, name: folder ? `${folder} image` : 'image', file, lines: [stages[0].line, Math.max(...all.map((x) => x.endLine))], knows, choices: [] });
  }
  return { items, things, settings, facts, links, permissions: [] };
}

function onbuildWords(op, args) {
  const u = op.toUpperCase();
  if (u === 'RUN') return shellSteps(args, 0)[0]?.says ?? `Run ${args}`;
  if (u === 'COPY' || u === 'ADD') return `Copy ${args}`;
  return cap(`${u.toLowerCase()} ${args}`);
}

export { commandSays };
