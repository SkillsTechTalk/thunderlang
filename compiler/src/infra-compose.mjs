// Docker Compose in Thunder (spec section 12): the services an app starts on one computer, and how they connect.
// Each service is a Resource that knows what it runs (an image, or the image built from a folder, linked to that
// folder's Dockerfile when it is in the repository), the ports it publishes and to whom, its settings (a secret-looking
// value is never shown; `${VAR}` is worked out when it starts), the files and volumes it keeps, what it waits for, and
// how its health is checked. Named volumes, networks, secrets, and configs are Resources too. The order things start,
// from depends_on, is one Steps card. Deterministic, browser-safe; reads the file, not what is running.
import { parseYamlDocs, get, entry, text, list, scalar } from './yaml.mjs';
import { listWords, orWords, cap } from './infra-words.mjs';
import { topoOrder } from './infra-cloud.mjs';
import { imageShort, imageWords, imageNotPinned, cpuWords, memWords, isSecretName, secretLiteral, servicesNamed, commandText, hasVar } from './infra-containers.mjs';

const STARTS = 'worked out when it starts';
const str = (n) => { const v = scalar(n); return v == null ? undefined : String(v); };
const lineOf = (n, key, fallback) => entry(n, key)?.line ?? fallback;
const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const varsIn = (s) => { const out = []; const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)|\$([A-Za-z_][A-Za-z0-9_]*)/g; let m; while ((m = re.exec(String(s)))) { const v = m[1] ?? m[2]; if (!out.includes(v)) out.push(v); } return out; };
const later = (s) => { const vs = varsIn(s); return `${STARTS}${vs.length && vs.length <= 2 ? `, from the variable${vs.length === 1 ? '' : 's'} ${listWords(vs)}` : ''}`; };

/** The last line a node covers. */
function lastLine(n) {
  if (!n) return 0;
  if (n.t === 'map') return Math.max(n.line, ...n.entries.map((e) => Math.max(e.line, lastLine(e.value))));
  if (n.t === 'seq') return Math.max(n.line, ...n.items.map(lastLine));
  if (n.block) return (n.valueLine ?? n.line) + Math.max(0, String(n.v).replace(/\n+$/, '').split('\n').length - 1);
  return n.line;
}

/** `a/b/../c` -> `a/c`; null when the path leaves the repository. */
function normPath(p) {
  const out = [];
  for (const seg of String(p).replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.join('/');
}

/** A published port, short or long syntax: { host, container, ip, proto, line }. */
function portOf(n) {
  if (n.t === 'map') return { container: str(get(n, 'target')), host: str(get(n, 'published')), ip: str(get(n, 'host_ip')), proto: str(get(n, 'protocol')), line: n.line };
  const s = String(scalar(n) ?? '');
  let rest = s, proto;
  const slash = rest.lastIndexOf('/');
  if (slash > 0) { proto = rest.slice(slash + 1); rest = rest.slice(0, slash); }
  let ip;
  if (rest.startsWith('[')) { const end = rest.indexOf(']'); ip = rest.slice(1, end); rest = rest.slice(end + 2); }
  const parts = rest.split(':');
  if (parts.length === 3) ip = parts.shift();
  const [a, b] = parts;
  return b != null ? { host: a, container: b, ip, proto, line: n.line } : { container: a, ip, proto, line: n.line };
}
const LOCAL = /^(127\.\d+\.\d+\.\d+|::1|localhost)$/;

/** Environment entries, map or `KEY=value` list: [{ key, value (undefined: taken from the computer), line }]. */
function envEntries(n) {
  if (n?.t === 'map') return n.entries.map((e) => ({ key: e.key, value: e.value?.t === 'str' ? (e.value.v == null ? undefined : String(scalar(e.value))) : undefined, line: e.line }));
  return list(n).map((x) => { const s = String(scalar(x) ?? ''); const i = s.indexOf('='); return i < 0 ? { key: s, value: undefined, line: x.line } : { key: s.slice(0, i), value: s.slice(i + 1), line: x.line }; });
}

/** A health check test in words: ["CMD", "curl", "-f", "http://localhost"] -> 'curl -f http://localhost'. */
function testWords(n) {
  if (n?.t === 'seq') {
    const xs = list(n).map(str);
    if (xs[0] === 'NONE') return null;
    return commandText(xs[0] === 'CMD' || xs[0] === 'CMD-SHELL' ? xs.slice(1) : xs);
  }
  return str(n) ?? '';
}

const RESTART = { no: 'never (it stays stopped)', always: 'always', 'unless-stopped': 'always, unless someone stops it', 'on-failure': 'when it fails', none: 'never (it stays stopped)', any: 'always' };

/**
 * Read a Compose file: services, named volumes, networks, secrets, and configs as Resources, their settings, facts,
 * and links, plus one Steps card with the order they start. `file` is the path, used to find a service's Dockerfile.
 */
export function readCompose(src, file = 'compose.yaml') {
  const docs = parseYamlDocs(src);
  const things = [], settings = [], facts = [], links = [], unknowns = [];
  for (const d of docs) if (d.error) unknowns.push({ file, line: d.error.line ?? d.line, why: `This part could not be read as YAML: ${d.error.message}` });
  const root = docs.find((d) => d.node?.t === 'map')?.node;
  if (!root) return { items: [], things, settings, facts, links, permissions: [], unknowns };
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
  const factIds = new Set();
  const fact = (kind, says, line) => {
    let id = `${file}#${kind}#${line}`;
    for (let i = 2; factIds.has(id); i++) id = `${file}#${kind}#${line}#${i}`;
    factIds.add(id);
    facts.push({ id, kind, says, file, line });
  };
  const setting = (x) => { if (!settings.some((s) => s.name === x.name && s.source === x.source && s.line === x.line)) settings.push({ file, ...x }); };
  const link = (from, to, kind, line) => {
    if (from === to) return;
    const same = links.find((l) => l.from === from && l.to === to);
    if (!same) links.push({ from, to, kind, file, line });
    else if (same.kind === 'uses' && kind !== 'uses') { same.kind = kind; same.line = line; }
  };

  const services = get(root, 'services');
  const serviceNames = new Set((services?.entries ?? []).map((e) => e.key));
  const top = (key) => new Map((get(root, key)?.entries ?? []).map((e) => [e.key, e]));
  const volumes = top('volumes'), networks = top('networks'), secrets = top('secrets'), configs = top('configs');

  // ── Named volumes, networks, secrets, configs ──
  const declared = [];
  for (const [key, type, word] of [['networks', 'compose-network', 'network'], ['volumes', 'compose-volume', 'volume'], ['secrets', 'compose-secret', 'secret'], ['configs', 'compose-config', 'config']]) {
    for (const [name, e] of top(key)) {
      const v = e.value;
      const knows = [];
      const know = (label, kindText, line, extra = {}) => knows.push({ name: label, label, kind: kindText, start: null, line: line ?? e.line, ...extra });
      const ext = get(v, 'external');
      const external = str(ext) === 'true' || ext?.t === 'map';
      const realName = str(get(v, 'name')) ?? str(get(ext, 'name'));
      if (external) know('Made', `elsewhere: Compose uses the existing ${word}${realName ? ` ${realName}` : ''}`, lineOf(v, 'external'));
      else if (realName) know('Named', realName, lineOf(v, 'name'));
      const driver = str(get(v, 'driver'));
      if (driver) know('Driver', driver, lineOf(v, 'driver'));
      if (key === 'networks' && str(get(v, 'internal')) === 'true') know('Reaches', 'only the services on it (no way out to the internet)', lineOf(v, 'internal'));
      if (key === 'secrets' || key === 'configs') {
        const f = str(get(v, 'file')), env = str(get(v, 'environment')), content = get(v, 'content');
        if (f) know('Read from', `the file ${f} on the computer it starts on`, lineOf(v, 'file'));
        if (env) know('Taken from', `the variable ${env} on the computer it starts on`, lineOf(v, 'environment'));
        if (content) know('Written here', key === 'secrets' ? 'yes (not shown)' : short(str(content) ?? ''), lineOf(v, 'content'));
        if (key === 'secrets') {
          setting({ name, source: 'secret', secret: true, line: e.line });
          if (content && !hasVar(str(content))) fact('secret-in-plain-config', `The secret ${name} has its value written in the Compose file.`, lineOf(v, 'content'));
        }
      }
      const address = `${key}.${name}`;
      things.push({ kind: 'resource', name: address, label: `${cap(word)} ${name}`, resourceType: type, address, file, lines: [e.line, Math.max(e.line, lastLine(v))], knows, choices: [], ...(external ? { existing: true } : {}) });
      declared.push({ address, kind: key, name, line: e.line, external });
    }
  }

  // ── Services ──
  const starts = new Map();
  for (const e of services?.entries ?? []) {
    const name = e.key, s = e.value;
    const address = `services.${name}`;
    const where = `The service ${name}`;
    const knows = [];
    const know = (label, kindText, line, extra = {}) => knows.push({ name: extra.name ?? label, label, kind: kindText, start: null, line: line ?? e.line, ...extra });
    const image = str(get(s, 'image'));
    const build = get(s, 'build');
    const info = { image, build: null, after: [], profiles: list(get(s, 'profiles')).map(str) };
    if (build) {
      const ctx = build.t === 'map' ? str(get(build, 'context')) ?? '.' : str(build) ?? '.';
      const df = build.t === 'map' ? str(get(build, 'dockerfile')) : undefined;
      const target = build.t === 'map' ? str(get(build, 'target')) : undefined;
      const remote = /^(https?|git|ssh):\/\/|^git@|\.git(#|$)/.test(ctx);
      info.build = ctx;
      know('Built from', `${remote ? `the repository ${ctx}` : ctx === '.' ? 'this folder' : `the folder ${ctx}`}${df ? `, with ${df}` : ''}${target ? `, the ${target} stage` : ''}`, build.t === 'map' ? lineOf(build, 'context', lineOf(s, 'build')) : lineOf(s, 'build'), { name: 'build' });
      if (!remote && !hasVar(ctx) && !(df && (hasVar(df) || df.startsWith('/')))) {
        const path = normPath(`${dir ? `${dir}/` : ''}${ctx}/${df ?? 'Dockerfile'}`);
        if (path) link(address, `image:${path}`, 'uses', lineOf(s, 'build'));
      }
      for (const a of envEntries(build.t === 'map' ? get(build, 'args') : null)) {
        const secret = isSecretName(a.key);
        if (secretLiteral(a.key, a.value)) fact('secret-in-plain-env', `${where} passes ${a.key} to its build with the value written in the file.`, a.line);
        setting({ name: a.key, source: a.value == null || hasVar(a.value) ? 'computed' : 'parameter', secret, line: a.line, ...(a.value == null || hasVar(a.value) ? { computed: true } : {}), ...(!secret && a.value != null && !hasVar(a.value) ? { default: a.value } : {}) });
      }
      if (image) know('Names the image', image, lineOf(s, 'image'));
    } else if (image) {
      know('Runs', imageWords(image, later(image)), lineOf(s, 'image'), { name: 'image', ...(hasVar(image) ? { computed: true } : {}) });
      const says = imageNotPinned(image, where);
      if (says) fact('image-not-pinned', says, lineOf(s, 'image'));
    } else if (get(s, 'extends')) {
      const ex = get(s, 'extends');
      know('Builds on', `the service ${str(get(ex, 'service')) ?? str(ex)}${str(get(ex, 'file')) ? ` in ${str(get(ex, 'file'))}` : ''}`, lineOf(s, 'extends'));
    }
    const ent = get(s, 'entrypoint'), cmd = get(s, 'command');
    const cmdText = (n) => (n?.t === 'seq' ? commandText(list(n).map(str)) : str(n));
    if (ent || cmd) know('Starts with', short([cmdText(ent), cmdText(cmd)].filter(Boolean).join(' '), 120), lineOf(s, ent ? 'entrypoint' : 'command'));
    const deploy = get(s, 'deploy');
    const replicas = str(get(deploy, 'replicas')) ?? str(get(s, 'scale'));
    if (replicas) know('How many', `${replicas} cop${replicas === '1' ? 'y' : 'ies'}`, lineOf(deploy, 'replicas', lineOf(s, 'scale')));

    // Ports: published on every network address unless a local address is named.
    const ports = list(get(s, 'ports')).map(portOf);
    for (const p of ports) {
      const local = p.ip && LOCAL.test(p.ip);
      const anyIp = !p.ip || p.ip === '0.0.0.0' || p.ip === '::' || p.ip === '[::]';
      const hostPart = p.host ? `port ${p.host}` : 'a port Docker picks';
      know('Publishes', `port ${p.container}${p.proto && p.proto !== 'tcp' ? ` (${p.proto.toUpperCase()})` : ''} as ${hostPart}, ${local ? 'on this computer only' : anyIp ? 'on every network the computer is on' : `on the address ${p.ip}`}`, p.line);
      if (!local && anyIp) fact('public-ingress', `${where} publishes ${p.host ? `port ${p.host}` : `port ${p.container} on a port Docker picks`} on every network address of the computer it runs on, so anyone who can reach that computer can reach it.`, p.line);
    }
    const expose = list(get(s, 'expose')).map(str);
    if (expose.length) know('Open to the other services on', `port${expose.length === 1 ? '' : 's'} ${listWords(expose)}`, lineOf(s, 'expose'));
    const nm = str(get(s, 'network_mode'));
    if (nm === 'host') know('Network', "the computer's own network: every port it opens is open on the computer", lineOf(s, 'network_mode'));
    else if (nm?.startsWith('service:')) { const other = nm.slice(8); know('Network', `shares the network of the service ${other}`, lineOf(s, 'network_mode')); link(address, `services.${other}`, 'runs-in', lineOf(s, 'network_mode')); }

    // Settings.
    for (const x of envEntries(get(s, 'environment'))) {
      const secret = isSecretName(x.key);
      const fromHost = x.value === undefined;
      const computed = !fromHost && hasVar(x.value);
      if (secretLiteral(x.key, x.value)) fact('secret-in-plain-env', `${where} has ${x.key} written in the Compose file, where anyone who can read it sees the value.`, x.line);
      const says = fromHost ? `taken from the computer it starts on (${STARTS})` : secret ? (computed ? `a secret, ${later(x.value)} (not shown)` : 'a secret-looking setting, written in the file (not shown)') : computed ? `${short(x.value)} (${later(x.value)})` : `a setting: ${x.value === '' ? '(empty)' : short(x.value)}`;
      know(x.key, says, x.line, { setting: true, ...(secret ? { secret: true } : {}), ...(fromHost || computed ? { computed: true } : {}) });
      setting({ name: x.key, source: fromHost ? 'variable' : computed ? 'computed' : 'literal', secret, line: x.line, ...(computed || fromHost ? { computed: true } : {}), ...(!secret && !computed && !fromHost ? { default: x.value === '' ? '(empty)' : short(x.value) } : {}) });
      if (x.value) for (const other of servicesNamed(x.key, x.value, serviceNames)) link(address, `services.${other}`, 'sends-to', x.line);
    }
    const envFiles = get(s, 'env_file');
    for (const f of list(envFiles)) {
      const p = f.t === 'map' ? str(get(f, 'path')) : str(f);
      const optional = f.t === 'map' && str(get(f, 'required')) === 'false';
      know('Reads settings from', `the file ${p}${optional ? ' (if it exists)' : ''}`, f.line);
    }
    for (const sec of list(get(s, 'secrets'))) {
      const sn = sec.t === 'map' ? str(get(sec, 'source')) : str(sec);
      const target = sec.t === 'map' ? str(get(sec, 'target')) : undefined;
      know('Reads the secret', `${sn} (at ${target?.startsWith('/') ? target : `/run/secrets/${target ?? sn}`}, only its name is shown)`, sec.line, { secret: true });
      link(address, `secrets.${sn}`, 'reads-from', sec.line);
    }
    for (const c of list(get(s, 'configs'))) {
      const cn = c.t === 'map' ? str(get(c, 'source')) : str(c);
      const target = c.t === 'map' ? str(get(c, 'target')) : undefined;
      know('Reads the config', `${cn}${target ? ` (at ${target})` : ''}`, c.line);
      link(address, `configs.${cn}`, 'reads-from', c.line);
    }

    // Files and volumes.
    for (const v of list(get(s, 'volumes'))) {
      let source, target, ro = false, type;
      if (v.t === 'map') { source = str(get(v, 'source')); target = str(get(v, 'target')); ro = str(get(v, 'read_only')) === 'true'; type = str(get(v, 'type')); }
      else {
        const parts = String(scalar(v) ?? '').split(':');
        if (parts.length === 1) target = parts[0];
        else { source = parts[0]; target = parts[1]; ro = /(^|,)ro(,|$)/.test(parts[2] ?? ''); }
        // A Windows drive letter (C:\x) is part of the source.
        if (/^[A-Za-z]$/.test(parts[0]) && parts.length >= 3) { source = `${parts[0]}:${parts[1]}`; target = parts[2]; ro = /(^|,)ro(,|$)/.test(parts[3] ?? ''); }
      }
      const isNamed = source && !/^[./~$]|^[A-Za-z]:/.test(source) && type !== 'bind';
      let says;
      if (!source) says = type === 'tmpfs' ? 'a scratch folder in memory' : 'a volume of its own (no name: Docker makes one)';
      else if (isNamed) { says = `the volume ${source}`; link(address, `volumes.${source}`, 'uses', v.line); }
      else says = `the folder ${source} from the computer it runs on`;
      know(`Keeps ${target}`, `in ${says}${ro ? ' (read-only)' : ''}`, v.line);
      if (source && /docker\.sock$/.test(source)) fact('privileged-container', `${where} can reach the Docker socket (${source}), which lets it control every container on the computer.`, v.line);
    }

    // What it waits for.
    const dep = get(s, 'depends_on');
    const deps = dep?.t === 'map' ? dep.entries.map((x) => ({ name: x.key, cond: str(get(x.value, 'condition')), line: x.line })) : list(dep).map((x) => ({ name: str(x), cond: undefined, line: x.line }));
    for (const x of deps) {
      info.after.push(x);
      link(address, `services.${x.name}`, 'uses', x.line);
    }
    if (deps.length) know('Starts after', listWords(deps.map((x) => `${x.name}${x.cond === 'service_healthy' ? ' (once it is healthy)' : x.cond === 'service_completed_successfully' ? ' (once it has finished successfully)' : ''}`)), lineOf(s, 'depends_on'));
    for (const nx of list(get(s, 'networks')).length ? list(get(s, 'networks')) : get(s, 'networks')?.entries?.map((x) => ({ t: 'str', v: x.key, line: x.line })) ?? []) {
      const nn = str(nx);
      if (nn) { know('On the network', nn, nx.line); if (networks.has(nn)) link(address, `networks.${nn}`, 'runs-in', nx.line); }
    }

    // Health, restarts, and who it runs as.
    const hc = get(s, 'healthcheck');
    if (hc) {
      const t = testWords(get(hc, 'test'));
      if (str(get(hc, 'disable')) === 'true' || t === null) know('Health check', 'turned off', lineOf(s, 'healthcheck'));
      else know('Checks its health with', `${short(t ?? '', 100)}${str(get(hc, 'interval')) ? `, every ${str(get(hc, 'interval'))}` : ''}`, lineOf(s, 'healthcheck'));
    }
    const restart = str(get(s, 'restart')) ?? str(get(get(deploy, 'restart_policy'), 'condition'));
    if (restart) know('Restarts', RESTART[restart.split(':')[0]] ?? restart, lineOf(s, 'restart', lineOf(deploy, 'restart_policy')));
    const user = str(get(s, 'user'));
    if (user) {
      const root = /^(root|0)(:.*)?$/.test(user);
      know('Runs as', root ? 'root, the user that can do anything' : `the user ${user}`, lineOf(s, 'user'));
      if (root) fact('runs-as-root', `${where} runs as root (user: ${user}).`, lineOf(s, 'user'));
    }
    if (str(get(s, 'privileged')) === 'true') { know('Privileged', 'yes: it can do almost anything on the computer', lineOf(s, 'privileged')); fact('privileged-container', `${where} is privileged (privileged: true), so it can do almost anything on the computer it runs on.`, lineOf(s, 'privileged')); }
    const caps = list(get(s, 'cap_add')).map(str);
    if (caps.some((c) => /^(ALL|SYS_ADMIN|CAP_SYS_ADMIN)$/i.test(c))) fact('privileged-container', `${where} adds the ${caps.filter((c) => /ALL|SYS_ADMIN/i.test(c)).join(' and ')} capabilit${caps.length === 1 ? 'y' : 'ies'}, which gives it nearly the power of the computer itself.`, lineOf(s, 'cap_add'));
    if (str(get(s, 'pid')) === 'host') fact('privileged-container', `${where} shares every process on the computer (pid: host).`, lineOf(s, 'pid'));
    const lim = get(get(deploy, 'resources'), 'limits'), res = get(get(deploy, 'resources'), 'reservations');
    const amount = (m) => listWords([str(get(m, 'cpus')) && cpuWords(str(get(m, 'cpus'))), str(get(m, 'memory')) && `${memWords(str(get(m, 'memory')))} of memory`].filter(Boolean));
    if (res && amount(res)) know('Asks for', amount(res), lineOf(get(deploy, 'resources'), 'reservations'));
    if (lim && amount(lim)) know('Can use at most', amount(lim), lineOf(get(deploy, 'resources'), 'limits'));
    else if (str(get(s, 'mem_limit')) || str(get(s, 'cpus'))) know('Can use at most', listWords([str(get(s, 'cpus')) && cpuWords(str(get(s, 'cpus'))), str(get(s, 'mem_limit')) && `${memWords(str(get(s, 'mem_limit')))} of memory`].filter(Boolean)), lineOf(s, 'mem_limit', lineOf(s, 'cpus')));
    if (info.profiles.length) know('Only starts with', `the profile${info.profiles.length === 1 ? '' : 's'} ${orWords(info.profiles)}`, lineOf(s, 'profiles'));

    things.push({ kind: 'resource', name: address, label: `Service ${name}`, resourceType: 'compose-service', address, file, lines: [e.line, Math.max(e.line, lastLine(s))], knows, choices: [] });
    starts.set(address, { name, line: e.line, info });
  }

  // ── The order things start: one Steps card ──
  const steps = [];
  for (const d of declared.filter((x) => x.kind === 'networks' || x.kind === 'volumes')) {
    steps.push({ kind: 'call', says: d.external ? `Uses the existing ${d.kind.slice(0, -1)} ${d.name} (made elsewhere)` : `Creates the ${d.kind.slice(0, -1)} ${d.name}`, code: `${d.kind}:\n  ${d.name}`, line: d.line });
  }
  const ids = [...starts.keys()];
  // depends_on decides the order; network_mode: service:x also needs x running first.
  const edges = [...starts].flatMap(([a, x]) => x.info.after.map((d) => [a, `services.${d.name}`]));
  for (const l of links) if (l.kind === 'runs-in' && starts.has(l.from) && starts.has(l.to)) edges.push([l.from, l.to]);
  for (const a of topoOrder(ids, edges)) {
    const { name, line, info } = starts.get(a);
    const what = info.build ? `Builds and starts ${name} (from ${info.build === '.' ? 'this folder' : info.build})` : `Starts ${name}${info.image ? ` (${imageShort(info.image)})` : ''}`;
    const after = info.after.filter((x) => starts.has(`services.${x.name}`)).map((x) => `${x.name} ${x.cond === 'service_healthy' ? 'is healthy' : x.cond === 'service_completed_successfully' ? 'has finished successfully' : 'has started'}`);
    let step = { kind: 'call', says: `${what}${after.length ? `, once ${listWords(after)}` : ''}`, code: `services:\n  ${name}:`, line };
    if (info.profiles.length) step = { kind: 'branch', says: `Is the profile ${orWords(info.profiles)} turned on?`, code: `profiles: [${info.profiles.join(', ')}]`, line, children: [step] };
    steps.push(step);
  }
  const base = file.slice(file.lastIndexOf('/') + 1);
  const items = [];
  if (starts.size) {
    const first = Math.min(...steps.map((x) => x.line)), last = Math.max(...things.map((t) => t.lines[1]));
    items.push({
      id: `up:${first}`, name: 'up', label: `Starting ${base}`, title: `What starting ${base} does, in order`, line: first, endLine: last,
      inputs: [], returns: null, provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0, stepsReadable: 1,
      says: `Starting ${base} runs ${starts.size} service${starts.size === 1 ? '' : 's'}, each after the ones it waits for.`,
      headline: `Starting ${base}: ${starts.size} service${starts.size === 1 ? '' : 's'}.`, guards: [], unread: [],
    });
  }
  const nameNode = get(root, 'name');
  return { items, things, settings, facts, links, permissions: [], unknowns, purpose: text(nameNode) ?? null };
}
