// Bicep in Thunder (spec section 12): what a deployment makes in Azure, where, and who can do what. Each `resource`
// is a Resource (its type as written, 'Microsoft.Storage/storageAccounts', and its symbolic name as its address) that
// knows its properties in words; an `existing` resource is looked up, not made; a `module` is a group of its own;
// `param` (a `@secure()` one only named), `var`, and `output` are Settings. Symbolic references (`storage.id`),
// `parent`, and `dependsOn` are links with their lines; `for` and `if` read "for each …" and "only when …"; the order
// things are created is one Steps card. Role assignments are Permissions, with well-known role ids named (Owner,
// Storage Blob Data Reader, …) and called wide when they can change everything; the same Facts as Terraform.
// Deterministic, browser-safe; reads the file, not what is deployed.
import { parseBicep } from './bicep.mjs';
import { refsIn, isLiteral, entryOf } from './infra-expr.mjs';
import {
  APPLIED, words, typeWords, resourceLabel, roleCan, roleIn, WIDE_ROLES, linkKind, valueText, conditionWords,
  keyFacts, isSecretKey, literalEntries, fromAnywhere, portsOpen, topoOrder, addLink, question, leaves, normKey,
} from './infra-cloud.mjs';
import { listWords, cap } from './infra-words.mjs';

const SCOPES = { resourceGroup: 'a resource group', subscription: 'a subscription', managementGroup: 'a management group', tenant: 'the whole tenant' };
const FN_WORDS = { resourceGroup: "the resource group's", subscription: "the subscription's", deployment: "the deployment's", tenant: "the tenant's", managementGroup: "the management group's", environment: "the Azure cloud's", deployer: "whoever deploys it's" };

/** The object a resource or module is written as, and the `for` or `if` around it. */
function unwrap(v) {
  let loop = null, cond = null, obj = v;
  if (obj?.t === 'for') { loop = obj; obj = obj.value; }
  if (obj?.t === 'if') { cond = obj.test; obj = obj.body; }
  return { obj: obj?.t === 'obj' ? obj : null, loop, cond };
}

/** Read a Bicep file. Returns { items, things, settings, facts, links, permissions, unknowns, purpose }. */
export function readBicep(src, file = 'main.bicep') {
  const parsed = parseBicep(src);
  const { decls } = parsed;
  const text = parsed.src;
  const things = [], settings = [], facts = [], links = [], permissions = [];
  const unknowns = parsed.errors.map((e) => ({ file, line: e.line, why: `Not read yet: ${e.why}.` }));
  const factIds = new Set();
  const fact = (kind, says, line) => { const id = `${file}#${kind}#${line}`; if (!factIds.has(id)) { factIds.add(id); facts.push({ id, kind, says, file, line }); } };
  const scopeDecl = decls.find((d) => d.kind === 'targetScope');
  const targetScope = scopeDecl?.value?.t === 'str' ? scopeDecl.value.v : 'resourceGroup';

  // Every resource and module, nested resources included (`parent` is the one they sit in).
  const declared = [];
  const visit = (d, parent) => {
    const { obj } = unwrap(d.value);
    let type = d.type ?? 'module';
    if (parent && d.kind === 'resource' && !type.includes('/') && !/^Microsoft\./i.test(type)) type = `${parent.type}/${type}`;
    // Nested resources under different parents may share a name; the second is addressed by its parent (parent::child).
    const address = declared.some((x) => x.address === d.name) && parent ? `${parent.address}::${d.name}` : d.name;
    const entry = { d, kind: d.kind, type, name: d.name, address, parent: parent?.address ?? null, existing: !!d.existing };
    declared.push(entry);
    for (const e of obj?.entries ?? []) if (e.nested) visit(e.nested, entry);
  };
  for (const d of decls) if (d.kind === 'resource' || d.kind === 'module') visit(d, null);
  const bySym = new Map(declared.map((x) => [x.address, x]));
  const params = new Map(decls.filter((d) => d.kind === 'param').map((d) => [d.name, d]));
  const vars = new Map(decls.filter((d) => d.kind === 'var').map((d) => [d.name, d]));
  const loopVars = new Set();
  const collectLoops = (n) => { if (!n || typeof n !== 'object') return; if (n.t === 'for' || n.t === 'lambda') for (const v of n.vars) loopVars.add(v); for (const k of Object.values(n)) if (k && typeof k === 'object') { if (Array.isArray(k)) k.forEach(collectLoops); else if (k.t) collectLoops(k); else if (k.value) collectLoops(k.value); } };
  for (const d of decls) collectLoops(d.value);

  /** A reference in words: location -> "the setting location"; storage.id -> "the id of the storage account storage". */
  const refWords = (n) => {
    if (n.t === 'get' && n.obj.t === 'call') { const f = n.obj.name.replace(/^az\./, ''); return FN_WORDS[f] ? `${FN_WORDS[f]} ${words(n.path.filter((x) => !x.startsWith('[')).join(' '))}`.replace("deploys it's", "deploys it: its") : null; }
    if (n.t !== 'ref') return null;
    const [root, ...rest] = n.path;
    const attr = rest.filter((x) => x !== 'properties' && x !== '*' && !x.startsWith('[')).map(words).join(' ');
    if (params.has(root)) return `the setting ${root}${attr ? `'s ${attr}` : ''}`;
    if (vars.has(root)) return `the value ${root}${attr ? `'s ${attr}` : ''}`;
    if (loopVars.has(root)) return attr ? `each item's ${attr}` : 'each item';
    const child = rest[0] && bySym.get(rest[0])?.parent === root ? rest[0] : null;
    if (child) return refWords({ t: 'ref', path: n.path.slice(1) });
    const r = bySym.get(root);
    if (r) {
      if (r.kind === 'module') return rest[0] === 'outputs' && rest[1] ? `the ${words(rest[1])} from the module ${root}` : `the module ${root}`;
      return `${attr ? `the ${attr} of ` : ''}the ${r.existing ? 'existing ' : ''}${typeWords(r.type)} ${root}`;
    }
    return null;
  };
  // What each var refers to, so a resource that uses a var is linked to what the var names.
  const targetsOf = (node) => {
    const out = [];
    const seen = new Set();
    const walk = (refs, depth) => {
      for (const r of refs) {
        const root = r.path[0];
        if (vars.has(root) && depth < 3 && !seen.has(root)) { seen.add(root); walk(refsIn(vars.get(root).value), depth + 1); continue; }
        if (bySym.has(root)) out.push({ to: bySym.get(r.path[1])?.parent === root ? r.path[1] : root, ref: r });
      }
    };
    walk(refsIn(node), 0);
    return out;
  };

  for (const x of declared) {
    const { d, type, name, address } = x;
    const { obj, loop, cond } = unwrap(d.value);
    const where = x.kind === 'module' ? `The module ${name}` : `The ${typeWords(type)} ${name}`;
    const knows = [];
    const know = (k) => knows.push({ start: null, ...k });
    if (x.existing) know({ name: 'existing', label: 'Looks up', kind: `an existing ${typeWords(type)}, made elsewhere (this file only reads it)`, line: d.line });
    if (x.kind === 'module') know({ name: 'path', label: 'Uses the module', kind: d.path, line: d.line });
    if (loop) know({ name: 'for', label: 'One for each', kind: `item in ${valueText(loop.coll, refWords).from?.[0] ?? (isLiteral(loop.coll) ? valueText(loop.coll, refWords).text : `a list ${APPLIED}`)}`, line: loop.line, computed: true });
    if (cond) know({ name: 'if', label: 'Only when', kind: conditionWords(cond, refWords), line: cond.line, computed: true });
    for (const e of obj?.entries ?? []) {
      if (e.nested || e.spread) continue;
      if (e.key === 'properties' && e.value.t === 'obj') {
        for (const pe of e.value.entries) if (!pe.spread) know(entryKnow(pe, refWords));
        continue;
      }
      if (x.kind === 'module' && e.key === 'params' && e.value.t === 'obj') { for (const pe of e.value.entries) if (!pe.spread) know(entryKnow(pe, refWords, 'Given ')); continue; }
      if (e.key === 'dependsOn') {
        const ts = targetsOf(e.value);
        for (const t of ts) addLink(links, file, address, t.to, 'uses', e.line);
        know({ name: 'dependsOn', label: 'Waits for', kind: listWords([...new Set(ts.map((t) => refWords({ t: 'ref', path: [t.to] }) ?? t.to))]) || valueText(e.value, refWords).text, line: e.line });
        continue;
      }
      if (e.key === 'parent') { know({ name: 'parent', label: 'Inside', kind: refWords(e.value) ?? valueText(e.value, refWords).text, line: e.line }); continue; }
      if (e.key === 'scope') { know({ name: 'scope', label: x.kind === 'module' ? 'Deploys into' : 'On', kind: scopeOf(e.value, refWords, targetScope).on, line: e.line }); continue; }
      know(entryKnow(e, refWords));
    }
    if (d.apiVersion) know({ name: 'apiVersion', label: 'API version', kind: d.apiVersion, line: d.line });
    if (x.parent) addLink(links, file, address, x.parent, 'runs-in', d.line);
    // Links: every symbolic reference, under the key it sits in.
    if (obj) for (const lf of leaves(obj, '', d.line)) {
      if (lf.key === 'dependsOn') continue;
      for (const t of targetsOf(lf.value)) addLink(links, file, address, t.to, lf.key === 'parent' ? 'runs-in' : linkKind(lf.key, { toLookup: bySym.get(t.to)?.existing, fromType: type }), lf.line);
    }
    for (const n of [loop?.coll, cond].filter(Boolean)) for (const t of targetsOf(n)) addLink(links, file, address, t.to, 'uses', n.line);
    // Facts.
    if (obj) {
      for (const e of literalEntries(obj)) keyFacts(e.key, e.value, (kind, says) => fact(kind, says, e.line), where);
      ingressFacts(obj, where, fact, type);
    }
    const perms = permissionsOf(x, obj, { file, refWords, targetScope, bySym, vars, params, text });
    for (const p of perms) { const k = p.role && knows.find((kn) => normKey(kn.name) === 'roledefinitionid'); if (k) { k.kind = `${p.role} (a built-in role)`; delete k.computed; } }
    permissions.push(...perms);
    things.push({
      kind: 'resource', name: address, label: x.kind === 'module' ? `Module ${name}` : resourceLabel(type, name), resourceType: type, address, file,
      lines: [d.line, d.endLine], knows, choices: [], ...(d.doc ? { doc: d.doc } : {}), ...(x.existing ? { existing: true } : {}),
    });
  }
  for (const p of permissions) if (p.wide) fact('wide-permission', `${cap(p.who)} can ${p.can} on ${p.on}: ${p.why}.`, p.line);

  // ── Settings ──
  const deco = (d, n) => d.decorators?.find((x) => x.name === n);
  for (const d of decls) {
    const desc = deco(d, 'description')?.args[0];
    const doc = desc?.t === 'str' && desc.v ? { doc: desc.v.trim() } : {};
    if (d.kind === 'param') {
      const secure = !!deco(d, 'secure');
      const secret = secure || (isSecretKey(d.name) && /^string\b/.test(d.typeRaw ?? ''));
      if (secret && d.value?.t === 'str' && !d.value.template && d.value.v) fact('secret-in-plain-config', `The setting ${d.name} is a secret, but its default value is written in the file.`, d.value.line);
      const allowed = deco(d, 'allowed')?.args[0];
      settings.push({ name: d.name, source: 'parameter', secret, file, line: d.line, ...(d.typeRaw ? { type: d.typeRaw } : {}),
        ...(d.value && !secret ? { default: valueText(d.value, refWords).text.replace(` (${APPLIED})`, '') } : {}), ...(allowed?.t === 'list' && isLiteral(allowed) ? { allowed: allowed.items.map((i) => String(i.v)) } : {}), ...doc });
    } else if (d.kind === 'var') {
      const lit = isLiteral(d.value);
      const secret = isSecretKey(d.name) && d.value?.t === 'str';
      if (secret && lit && d.value.v) fact('secret-in-plain-config', `The value ${d.name} looks like a secret and is written in the file.`, d.line);
      settings.push({ name: d.name, source: lit ? 'literal' : 'computed', secret, file, line: d.line, ...(lit ? {} : { computed: true }), ...(lit && !secret ? { default: valueText(d.value, refWords).text } : {}), ...doc });
    } else if (d.kind === 'output') {
      const from = valueText(d.value, refWords);
      settings.push({ name: d.name, source: 'computed', secret: !!deco(d, 'secure') || (isSecretKey(d.name) && /^string\b/.test(d.typeRaw ?? '')), computed: true, output: true, file, line: d.line, ...(from.from?.length ? { from: from.from.slice(0, 3) } : {}), ...doc });
    }
  }

  // ── The order things are created ──
  const steps = [];
  if (scopeDecl) steps.push({ kind: 'call', says: `Deploys to ${SCOPES[targetScope] ?? targetScope}`, code: `targetScope = ${text.slice(scopeDecl.value.s, scopeDecl.value.e)}`, line: scopeDecl.line });
  const order = topoOrder(declared.map((x) => x.address), links.filter((l) => bySym.has(l.to)).map((l) => [l.from, l.to]));
  for (const addr of order) {
    const x = bySym.get(addr);
    const { d, type, name } = x;
    const { loop, cond } = unwrap(d.value);
    const inLink = links.find((l) => l.from === addr && l.kind === 'runs-in' && bySym.has(l.to));
    const inWords = inLink ? ` in the ${bySym.get(inLink.to).existing ? 'existing ' : ''}${typeWords(bySym.get(inLink.to).type)} ${inLink.to}` : '';
    const head = x.kind === 'module' ? `module ${name} '${d.path}'` : `resource ${name} '${d.type}${d.apiVersion ? `@${d.apiVersion}` : ''}'${x.existing ? ' existing' : ''}`;
    const says = x.kind === 'module' ? `Uses the module ${name} (${d.path})${inWords}` : x.existing ? `Looks up the existing ${typeWords(type)} ${name}${inWords}` : `Creates the ${typeWords(type)} ${name}${inWords}`;
    let step = { kind: 'call', says, code: head, line: d.line };
    if (cond) step = { kind: 'branch', says: question(conditionWords(cond, refWords)), code: `if (${text.slice(cond.s, cond.e)})`, line: cond.line, children: [step] };
    if (loop) step = { kind: 'loop', says: `For each ${valueText(loop.coll, refWords).from?.length === 1 ? `item in ${valueText(loop.coll, refWords).from[0]}` : 'item in a list'}`, code: `for ${loop.vars.join(', ')} in ${text.slice(loop.coll.s, loop.coll.e)}`, line: loop.line, children: [step] };
    steps.push(step);
  }
  const base = file.slice(file.lastIndexOf('/') + 1);
  const items = [];
  if (declared.length) {
    const made = declared.filter((x) => x.kind === 'resource' && !x.existing).length;
    const first = Math.min(...steps.map((s) => s.line)), last = Math.max(...declared.map((x) => x.d.endLine));
    items.push({
      id: `deploy:${first}`, name: 'deploy', label: `Deploying ${base}`, title: `What deploying ${base} makes, in order`, line: first, endLine: last,
      inputs: [], returns: null, provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0, stepsReadable: 1,
      says: `Deploying ${base} makes ${made} resource${made === 1 ? '' : 's'}, in the order they rely on each other.`,
      headline: `Deploying ${base}: ${steps.length} step${steps.length === 1 ? '' : 's'}.`, guards: [], unread: [],
    });
  }
  const meta = decls.find((d) => d.kind === 'metadata' && d.name === 'description') ?? decls.find((d) => d.kind === 'metadata' && d.name === 'name');
  return { items, things, settings, facts, links, permissions, unknowns, purpose: meta?.value?.t === 'str' && meta.value.v ? meta.value.v.trim() : null };
}

/** One property as something a Resource knows. */
function entryKnow(e, refWords, prefix = '') {
  const v = e.value;
  const secret = isSecretKey(e.key) && (v.t === 'str' || !isLiteral(v));
  if (v.t === 'obj' && !isLiteral(v)) {
    const parts = v.entries.filter((x) => !x.nested).map((x) => (x.spread ? `everything in ${valueText(x.value.x ?? x.value, refWords).text}` : `${words(x.key)}: ${isSecretKey(x.key) && !isLiteral(x.value) ? 'a secret (not shown)' : isSecretKey(x.key) && x.value.t === 'str' ? 'a secret written in the file (not shown)' : valueText(x.value, refWords).text}`));
    return { name: e.key, label: cap(`${prefix}${words(e.key)}`.trim()), kind: parts.length ? `${parts.slice(0, 4).join('; ')}${parts.length > 4 ? `; and ${parts.length - 4} more` : ''}` : 'none', line: e.line, computed: true };
  }
  if (secret) return { name: e.key, label: cap(`${prefix}${words(e.key)}`.trim()), kind: v.t === 'str' && !v.template ? 'a secret written in the file (its value is not shown)' : `a secret${valueText(v, refWords).from?.length ? ` from ${listWords(valueText(v, refWords).from)}` : ''} (its value is not shown)`, line: e.line, secret: true, ...(isLiteral(v) ? {} : { computed: true }) };
  const t = valueText(v, refWords);
  return { name: e.key, label: cap(`${prefix}${words(e.key)}`.trim()), kind: t.text, line: e.line, ...(t.computed ? { computed: true } : {}) };
}

function scopeOf(n, refWords, targetScope) {
  if (!n) {
    if (targetScope === 'subscription') return { on: 'the whole subscription', wide: true };
    if (targetScope === 'managementGroup') return { on: 'the management group (every subscription in it)', wide: true };
    if (targetScope === 'tenant') return { on: 'the whole tenant', wide: true };
    return { on: 'the resource group it is deployed to' };
  }
  if (n.t === 'call') {
    const f = n.name.replace(/^az\./, '');
    if (f === 'subscription') return { on: n.args.length ? `the subscription ${valueText(n.args[0], refWords).text}` : 'the whole subscription', wide: true };
    if (f === 'managementGroup') return { on: 'a management group (every subscription in it)', wide: true };
    if (f === 'tenant') return { on: 'the whole tenant', wide: true };
    if (f === 'resourceGroup') return { on: n.args.length ? `the resource group ${valueText(n.args.at(-1), refWords).text}` : 'the resource group it is deployed to' };
  }
  const w = refWords(n);
  return { on: w ? w.replace(/^the id of /, '') : valueText(n, refWords).text };
}

function principalOf(n, ctx) {
  if (!n) return 'someone';
  if (n.t === 'get' && n.obj.t === 'call' && /deployer$/.test(n.obj.name)) return 'whoever deploys it';
  if (n.t === 'ref') {
    const [root, ...rest] = n.path;
    const r = ctx.bySym.get(root);
    if (r) {
      if (rest.includes('identity')) return `the ${typeWords(r.type)} ${root} (its own identity)`;
      if (/userAssignedIdentities$/i.test(r.type)) return `the managed identity ${root}`;
      return `the ${typeWords(r.type)} ${root}`;
    }
    if (ctx.params.has(root)) return `the identity given in the setting ${root}`;
  }
  const w = ctx.refWords(n);
  return w ?? `an identity ${APPLIED}`;
}

/** The role a roleDefinitionId names, following a var or a param's default one step. */
function roleOfNode(n, ctx) {
  if (!n) return null;
  const slice = (x) => ctx.text.slice(x.s, x.e);
  let r = roleIn(slice(n));
  if (r) return r;
  for (const ref of refsIn(n)) {
    const v = ctx.vars.get(ref.path[0])?.value ?? ctx.params.get(ref.path[0])?.value;
    if (!v) continue;
    // A var that maps role names to ids (`roles.contributor`) names the role by the key it uses.
    if (v.t === 'obj' && ref.path[1]) { const e = entryOf(v, ref.path[1]); if (e) { r = roleIn(slice(e.value)); if (r) return r; } }
    r = roleIn(slice(v));
    if (r && v.t !== 'obj') return r;
  }
  return null;
}

function permissionsOf(x, obj, ctx) {
  const out = [];
  if (!obj) return out;
  const add = (who, can, on, line, wide = false, why, role) => out.push({ id: `${ctx.file}#permission#${line}#${out.length}`, who, can, on, wide: !!wide, ...(wide && why ? { why } : {}), ...(role ? { role } : {}), file: ctx.file, line, says: `${cap(who)} can ${can} on ${on}` });
  const props = entryOf(obj, 'properties')?.value;
  if (/^Microsoft\.Authorization\/roleAssignments$/i.test(x.type) && !x.existing) {
    const roleNode = entryOf(props, 'roleDefinitionId')?.value;
    const role = roleOfNode(roleNode, ctx);
    const scope = scopeOf(entryOf(obj, 'scope')?.value, ctx.refWords, ctx.targetScope);
    const wide = role && WIDE_ROLES.has(role) && scope.wide;
    const can = role ? roleCan(role) : `act in the role ${roleNode ? valueText(roleNode, ctx.refWords).text : 'it is given'}`;
    add(principalOf(entryOf(props, 'principalId')?.value, ctx), can, scope.on, x.d.line, wide, wide ? `${role} of ${scope.on}` : undefined, role);
  } else if (/^Microsoft\.KeyVault\/vaults(\/accessPolicies)?$/i.test(x.type)) {
    const pols = entryOf(props, 'accessPolicies')?.value;
    for (const p of pols?.t === 'list' ? pols.items : []) {
      if (p.t !== 'obj') continue;
      const perms = entryOf(p, 'permissions')?.value;
      const kinds = (perms?.entries ?? []).filter((e) => e.value.t === 'list' && e.value.items.length).map((e) => `${listWords(e.value.items.map((i) => String(i.v ?? '…').toLowerCase()))} ${e.key}`);
      if (!kinds.length) continue;
      const all = kinds.some((k) => /\b(all|purge)\b/.test(k));
      add(principalOf(entryOf(p, 'objectId')?.value, ctx), listWords(kinds), `the key vault ${x.name}`, p.line, all, all ? 'it can purge or do everything to them' : undefined);
    }
  }
  return out;
}

/** NSG rules (inline or as their own resource) that let anyone on the internet in, beyond web ports. */
function ingressFacts(obj, where, fact, type) {
  const rules = [];
  const visit = (n) => {
    if (!n) return;
    if (n.t === 'obj') {
      if (entryOf(n, 'direction') && entryOf(n, 'access')) rules.push(n);
      for (const e of n.entries) if (!e.nested) visit(e.value);
    } else if (n.t === 'list') n.items.forEach(visit);
  };
  if (/networkSecurityGroups/i.test(type)) visit(obj);
  const str = (n) => (n?.t === 'str' && !n.template ? n.v : null);
  const strs = (n) => (n?.t === 'list' ? n.items.map(str).filter((v) => v != null) : str(n) != null ? [str(n)] : []);
  for (const r of rules) {
    if (String(str(entryOf(r, 'direction')?.value) ?? '').toLowerCase() !== 'inbound' || String(str(entryOf(r, 'access')?.value) ?? '').toLowerCase() !== 'allow') continue;
    if (!fromAnywhere([...strs(entryOf(r, 'sourceAddressPrefix')?.value), ...strs(entryOf(r, 'sourceAddressPrefixes')?.value)])) continue;
    const ports = [...strs(entryOf(r, 'destinationPortRange')?.value), ...strs(entryOf(r, 'destinationPortRanges')?.value)];
    for (const p of ports.length ? ports : ['*']) {
      const o = p === '*' ? { says: 'every port', beyondWeb: true } : portsOpen(p, null, str(entryOf(r, 'protocol')?.value));
      if (o.beyondWeb) fact('public-ingress', `${where} lets anyone on the internet reach ${o.says}.`, r.line);
    }
  }
}
