// Kubernetes in Thunder (spec section 12): what a cluster is told to run, who can reach it, and who can do what in
// it. Each resource in a YAML file (several documents per file are fine) is a Resource with its kind as written and
// an address (`Deployment/api`, `Service/shop/web` in a namespace). A workload knows what it runs in words: the image,
// how many copies, ports, settings (a Secret's value is only named), CPU and memory, its health checks, and the user
// it runs as. A Service sends to the workloads its selector picks; an Ingress sends web addresses to Services; RBAC
// roles and bindings are Permissions (wide when they allow everything or give cluster-admin). The order things are
// made is one Steps card per file. Helm templates are not read (they are not Kubernetes until Helm fills them in).
// Deterministic, browser-safe; reads the file, not the cluster.
import { parseYamlDocs, get, entry, list, scalar } from './yaml.mjs';
import { cronWords, listWords, cap } from './infra-words.mjs';
import { topoOrder } from './infra-cloud.mjs';
import { parseImage, imageShort, imageWords, imageNotPinned, cpuWords, memWords, isSecretName, secretLiteral, servicesNamed, commandText, hasVar } from './infra-containers.mjs';

const STARTS = 'worked out when it starts';

/** Kinds in words, for labels and steps. Kinds Thunder does not know keep their name. */
const KIND_WORDS = {
  Deployment: 'deployment', StatefulSet: 'stateful set', DaemonSet: 'daemon set', ReplicaSet: 'replica set', ReplicationController: 'replication controller',
  Job: 'job', CronJob: 'scheduled job', Pod: 'pod', Service: 'service', Ingress: 'ingress', ConfigMap: 'ConfigMap', Secret: 'Secret',
  PersistentVolumeClaim: 'storage claim', PersistentVolume: 'storage volume', StorageClass: 'storage class', ServiceAccount: 'service account',
  Role: 'role', ClusterRole: 'cluster role', RoleBinding: 'role binding', ClusterRoleBinding: 'cluster role binding', NetworkPolicy: 'network policy',
  HorizontalPodAutoscaler: 'autoscaler', Namespace: 'namespace', PodDisruptionBudget: 'disruption budget', IngressClass: 'ingress class',
  LimitRange: 'limit range', ResourceQuota: 'resource quota', CustomResourceDefinition: 'custom resource definition',
};
const CLUSTER_SCOPED = new Set(['Namespace', 'ClusterRole', 'ClusterRoleBinding', 'PersistentVolume', 'StorageClass', 'IngressClass', 'CustomResourceDefinition', 'Node', 'PriorityClass', 'MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration', 'APIService']);
const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'ReplicationController', 'Job', 'CronJob', 'Pod']);
export const kindWords = (k) => KIND_WORDS[k] ?? k;

/** A stable address: `Kind/name`, or `Kind/namespace/name` outside the default namespace. */
export function k8sAddress(kind, name, ns) {
  return CLUSTER_SCOPED.has(kind) || !ns || ns === 'default' ? `${kind}/${name}` : `${kind}/${ns}/${name}`;
}

/** True when the file is a Helm template (or another template), not Kubernetes YAML yet. */
export function isHelmTemplate(src) {
  const s = String(src ?? '');
  if (!s.includes('{{')) return false;
  return /\{\{-?\s*(?:\.Values|\.Release|\.Chart|\.Capabilities|\.Files|include\s|template\s|toYaml\b|tpl\s)/.test(s) || /^\s*\{\{-?\s*(?:if|end|range|with|define|else)\b/m.test(s);
}

const str = (n) => { const v = scalar(n); return v == null ? undefined : String(v); };
const num = (n) => { const v = scalar(n); return typeof v === 'number' ? v : v != null && /^\d+$/.test(String(v)) ? Number(v) : undefined; };
const bool = (n) => { const v = scalar(n); return typeof v === 'boolean' ? v : undefined; };
const at = (n, ...keys) => { let cur = n; for (const k of keys) cur = get(cur, k); return cur; };
const lineOf = (n, key, fallback) => entry(n, key)?.line ?? fallback;
const labelsOf = (n) => (n?.t === 'map' ? Object.fromEntries(n.entries.map((e) => [e.key, str(e.value) ?? ''])) : {});
const selectorWords = (labels) => listWords(Object.entries(labels).map(([k, v]) => `${k}=${v}`));
/** A label selector (matchLabels, or a plain map), with matchExpressions in words. */
function selectorOf(n) {
  if (!n || n.t !== 'map') return { labels: {}, says: 'every pod' };
  const ml = get(n, 'matchLabels'), me = get(n, 'matchExpressions');
  const labels = ml || me ? labelsOf(ml) : labelsOf(n);
  const parts = Object.entries(labels).map(([k, v]) => `${k}=${v}`);
  for (const x of list(me)) {
    const vals = list(get(x, 'values')).map(str);
    const op = str(get(x, 'operator'));
    parts.push(op === 'In' ? `${str(get(x, 'key'))} is ${vals.join(' or ')}` : op === 'NotIn' ? `${str(get(x, 'key'))} is not ${vals.join(' or ')}` : op === 'Exists' ? `${str(get(x, 'key'))} is set` : `${str(get(x, 'key'))} is not set`);
  }
  return { labels, exprs: !!me, says: parts.length ? `pods with ${listWords(parts)}` : 'every pod' };
}
const matches = (sel, labels) => Object.keys(sel).length > 0 && Object.entries(sel).every(([k, v]) => labels?.[k] === v);

const short = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const seconds = (n) => (n === 1 ? '1 second' : `${n} seconds`);

/** A health check in words: "a web request to /_healthz on port 8080, every 10 seconds". */
function probeWords(p, verb = 'succeeds') {
  let how;
  const h = get(p, 'httpGet'), t = get(p, 'tcpSocket'), e = get(p, 'exec'), g = get(p, 'grpc');
  if (h) how = `a web request to ${str(get(h, 'path')) ?? '/'} on port ${str(get(h, 'port')) ?? '?'}${/^https$/i.test(str(get(h, 'scheme')) ?? '') ? ' (HTTPS)' : ''}`;
  else if (t) how = `a connection to port ${str(get(t, 'port')) ?? '?'}`;
  else if (e) how = `running ${short(commandText(list(get(e, 'command')).map(str)))}`;
  else if (g) how = `a gRPC health check on port ${str(get(g, 'port')) ?? '?'}`;
  else how = 'a check the file does not spell out';
  const extra = [];
  const d = num(get(p, 'initialDelaySeconds')), every = num(get(p, 'periodSeconds')), fails = num(get(p, 'failureThreshold'));
  if (d) extra.push(`starting after ${seconds(d)}`);
  if (every) extra.push(`every ${seconds(every)}`);
  if (fails) extra.push(`giving up after ${fails} failure${fails === 1 ? '' : 's'}`);
  return `${how} ${verb}${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

const ACCESS = { ReadWriteOnce: 'read and written by one node at a time', ReadOnlyMany: 'read by many nodes', ReadWriteMany: 'read and written by many nodes', ReadWriteOncePod: 'read and written by one pod at a time' };
const VERB_WORDS = { get: 'read', list: 'list', watch: 'watch', create: 'create', update: 'change', patch: 'change', delete: 'delete', deletecollection: 'delete', impersonate: 'act as', bind: 'give out', escalate: 'raise', use: 'use', approve: 'approve', sign: 'sign' };
/** RBAC verbs in words: get/list/watch -> "read (get, list, watch)"; "*" -> "do anything to". */
function verbsWords(verbs) {
  if (verbs.includes('*')) return 'do anything to';
  const read = ['get', 'list', 'watch'];
  if (verbs.every((v) => read.includes(v))) return `read (${listWords(verbs)})`;
  return listWords([...new Set(verbs.map((v) => VERB_WORDS[v] ?? v))]);
}
const BUILTIN_ROLES = {
  'cluster-admin': 'do anything (cluster-admin)', admin: 'do almost anything, including give others access (admin)',
  edit: 'read and change most things, but not roles or access (edit)', view: 'read most things, but not Secrets (view)',
};

// ── One resource ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Read a Kubernetes YAML file: every resource as a Resource, its settings, facts, links, and permissions, plus one
 * Steps card with the order they are made. `file` is the path shown in links and facts.
 */
export function readKubernetes(src, file = 'k8s.yaml') {
  const source = String(src ?? '');
  if (isHelmTemplate(source)) throw new Error('This is a Helm template: {{ … }} is filled in by Helm before Kubernetes sees it. Thunder reads plain Kubernetes YAML, not templates yet.');
  const docs = parseYamlDocs(source);
  // Other templates ({{cell}}, {{ config_data }}) are not YAML until they are filled in either.
  if (source.includes('{{') && docs.some((d) => d.error)) throw new Error('This is a template: {{ … }} is filled in before Kubernetes sees it. Thunder reads plain Kubernetes YAML, not templates yet.');
  const srcLines = source.split('\n');
  const things = [], settings = [], facts = [], links = [], permissions = [], unknowns = [], declared = [];
  const factIds = new Set();
  const fact = (kind, says, line) => {
    let id = `${file}#${kind}#${line}`;
    for (let i = 2; factIds.has(id); i++) id = `${file}#${kind}#${line}#${i}`;
    factIds.add(id);
    facts.push({ id, kind, says, file, line });
  };
  const setting = (x) => { if (!settings.some((s) => s.name === x.name && s.source === x.source && s.line === x.line)) settings.push({ file, ...x }); };
  const link = (from, to, kind, line, extra = {}) => {
    if (from === to) return;
    if (links.some((l) => l.from === from && l.to === to && l.kind === kind && !extra.selector)) return;
    links.push({ from, to, kind, file, line, ...extra });
  };

  // Resources, with `kind: List` opened up.
  const resources = [];
  for (const d of docs) {
    if (d.error) { unknowns.push({ file, line: d.error.line ?? d.line, why: `This document could not be read as YAML: ${d.error.message}` }); continue; }
    const n = d.node;
    if (!n || n.t !== 'map') continue;
    if (str(get(n, 'kind')) === 'List' || (str(get(n, 'kind')) ?? '').endsWith('List') && get(n, 'items')) {
      for (const it of list(get(n, 'items'))) if (it.t === 'map') resources.push({ n: it, line: it.line, endLine: lastLine(it) });
    } else resources.push({ n, line: d.line, endLine: d.endLine });
  }

  for (const r of resources) {
    const kind = str(get(r.n, 'kind'));
    const apiVersion = str(get(r.n, 'apiVersion'));
    const meta = get(r.n, 'metadata');
    const name = str(get(meta, 'name')) ?? str(get(meta, 'generateName')) ?? (kind === 'Kustomization' || kind === 'Component' ? 'kustomization' : '(no name)');
    if (!kind) { unknowns.push({ file, line: r.line, why: 'This document has no kind:, so Thunder cannot tell what it makes.' }); continue; }
    const ns = CLUSTER_SCOPED.has(kind) ? undefined : str(get(meta, 'namespace'));
    const address = k8sAddress(kind, name, ns);
    const addr = (k, nm) => k8sAddress(k, nm, CLUSTER_SCOPED.has(k) ? undefined : ns);
    declared.push({ address, kind, name, line: r.line, n: r.n });
    const knows = [];
    const know = (label, kindText, line, extra = {}) => knows.push({ name: extra.name ?? label, label, kind: kindText, start: null, line: line ?? r.line, ...extra });
    const where = `The ${kindWords(kind)} ${name}`;
    const thing = { kind: 'resource', name: address, label: `${cap(kindWords(kind))} ${name}`, resourceType: kind, address, file, lines: [r.line, r.endLine], knows, choices: [] };
    const doc = commentAbove(srcLines, r.line);
    if (doc) thing.doc = doc;
    if (ns) { know('Namespace', ns, lineOf(meta, 'namespace')); link(address, `Namespace/${ns}`, 'runs-in', lineOf(meta, 'namespace')); }
    const spec = get(r.n, 'spec');

    if (WORKLOADS.has(kind)) {
      readWorkload({ kind, name, spec, n: r.n, address, ns, where, know, fact, setting, link, addr, thing, line: r.line });
    } else if (kind === 'Service') {
      const type = str(get(spec, 'type')) ?? 'ClusterIP';
      const typeLine = lineOf(spec, 'type', r.line);
      const ann = labelsOf(get(meta, 'annotations'));
      const internal = Object.entries(ann).some(([k, v]) => (/load-balancer-internal$/.test(k) && /^(true|0\.0\.0\.0\/0)$/i.test(v)) || (/load-balancer-(type|scheme)$/.test(k) && /^internal$/i.test(v)));
      const ranges = list(get(spec, 'loadBalancerSourceRanges')).map(str);
      const ports = list(get(spec, 'ports'));
      const portList = ports.map((p) => {
        const port = str(get(p, 'port')), target = str(get(p, 'targetPort')), node = str(get(p, 'nodePort'));
        return `${port}${target && target !== port ? ` (to ${target} on the pods)` : ''}${node ? ` (and ${node} on every node)` : ''}${/^udp$/i.test(str(get(p, 'protocol')) ?? '') ? ' (UDP)' : ''}`;
      });
      if (type === 'ExternalName') {
        know('Sends to', `the outside address ${str(get(spec, 'externalName')) ?? '?'}`, lineOf(spec, 'externalName'));
      } else {
        const reach = type === 'LoadBalancer' ? (internal ? 'inside the private network only (an internal load balancer)' : ranges.length && !ranges.includes('0.0.0.0/0') ? `outside the cluster, only from ${listWords(ranges)}` : 'the internet, through a load balancer')
          : type === 'NodePort' ? 'outside the cluster, on a port of every node' : str(get(spec, 'clusterIP')) === 'None' ? 'inside the cluster, each pod by its own name (no shared address)' : 'inside the cluster only';
        know('Reachable from', reach, typeLine);
        if ((type === 'LoadBalancer' && !internal && (!ranges.length || ranges.includes('0.0.0.0/0'))) || type === 'NodePort') {
          fact('public-ingress', type === 'NodePort'
            ? `${where} is a NodePort: anyone who can reach a node can reach ${portList.length ? `port${ports.length === 1 ? '' : 's'} ${listWords(ports.map((p) => str(get(p, 'nodePort')) ?? '(picked by Kubernetes)'))}` : 'it'}.`
            : `${where} is a LoadBalancer: anyone on the internet can reach ${portList.length ? `port${ports.length === 1 ? '' : 's'} ${listWords(ports.map((p) => str(get(p, 'port'))))}` : 'it'}.`, typeLine);
        }
      }
      if (portList.length) know(ports.length === 1 ? 'Port' : 'Ports', listWords(portList), lineOf(spec, 'ports'));
      const sel = get(spec, 'selector');
      if (sel) {
        const s = selectorOf(sel);
        know('Sends to', s.says, lineOf(spec, 'selector'));
        thing.selects = { labels: s.labels, ns, line: lineOf(spec, 'selector') };
      } else if (type !== 'ExternalName') know('Sends to', 'addresses listed elsewhere (no selector)', typeLine);
    } else if (kind === 'Ingress') {
      readIngress({ spec, meta, where, know, fact, link, address, addr, line: r.line });
    } else if (kind === 'ConfigMap') {
      for (const key of ['data', 'binaryData']) for (const e of get(r.n, key)?.entries ?? []) {
        const v = str(e.value) ?? '';
        const secret = isSecretName(e.key);
        const multi = v.includes('\n');
        if (secretLiteral(e.key, v)) fact('secret-in-plain-config', `The ConfigMap ${name} has ${e.key} written in the file, and ConfigMaps are not kept secret.`, e.line);
        const shown = key === 'binaryData' ? 'binary data' : secret ? 'a secret-looking value (not shown)' : multi ? `a file (${v.replace(/\n$/, '').split('\n').length} lines)` : v === '' ? '(empty)' : short(v);
        know(e.key, shown, e.line, { setting: true, ...(secret ? { secret: true } : {}) });
        setting({ name: e.key, source: 'literal', secret, line: e.line, ...(!secret && !multi && key === 'data' ? { default: short(v) } : {}) });
      }
    } else if (kind === 'Secret') {
      const type = str(get(r.n, 'type')) ?? 'Opaque';
      know('Holds', { 'kubernetes.io/tls': 'a TLS certificate and its key', 'kubernetes.io/dockerconfigjson': 'a sign-in for a container registry', 'kubernetes.io/dockercfg': 'a sign-in for a container registry', 'kubernetes.io/service-account-token': 'a service account token', 'kubernetes.io/basic-auth': 'a user name and password', 'kubernetes.io/ssh-auth': 'an SSH key' }[type] ?? `secret values (${type})`, lineOf(r.n, 'type'));
      let written = null;
      for (const key of ['data', 'stringData']) for (const e of get(r.n, key)?.entries ?? []) {
        know(e.key, 'a secret value (only its name is shown)', e.line, { setting: true, secret: true });
        setting({ name: e.key, source: 'secret', secret: true, line: e.line });
        if (!written && (str(e.value) ?? '') !== '' && !hasVar(str(e.value))) written = e.line;
      }
      if (written) fact('secret-in-plain-config', `The Secret ${name} has its values written in this file: ${get(r.n, 'data') ? 'values under data: are only base64-encoded, not encrypted, so ' : ''}anyone who can read the file can read them.`, written);
    } else if (kind === 'PersistentVolumeClaim') {
      const size = str(at(spec, 'resources', 'requests', 'storage'));
      if (size) know('Asks for', `${memWords(size)} of storage`, lineOf(spec, 'resources'));
      const modes = list(get(spec, 'accessModes')).map(str);
      if (modes.length) know('Can be', listWords(modes.map((m) => ACCESS[m] ?? m)), lineOf(spec, 'accessModes'));
      const sc = str(get(spec, 'storageClassName'));
      if (sc != null) know('Storage class', sc === '' ? 'none (only a volume made by hand)' : sc, lineOf(spec, 'storageClassName'));
      const vol = str(get(spec, 'volumeName'));
      if (vol) { know('Uses the volume', vol, lineOf(spec, 'volumeName')); link(address, `PersistentVolume/${vol}`, 'uses', lineOf(spec, 'volumeName')); }
    } else if (kind === 'PersistentVolume') {
      const size = str(at(spec, 'capacity', 'storage'));
      if (size) know('Holds', `${memWords(size)} of storage`, lineOf(spec, 'capacity'));
      const hp = str(at(spec, 'hostPath', 'path'));
      if (hp) know('Kept in', `the node's own folder ${hp}`, lineOf(spec, 'hostPath'));
      const policy = str(get(spec, 'persistentVolumeReclaimPolicy'));
      if (policy) know('When released', { Retain: 'kept until someone removes it', Delete: 'deleted', Recycle: 'emptied and reused' }[policy] ?? policy, lineOf(spec, 'persistentVolumeReclaimPolicy'));
    } else if (kind === 'ServiceAccount') {
      const auto = bool(get(r.n, 'automountServiceAccountToken'));
      know('Its token', auto === false ? 'not handed to its pods unless they ask' : 'handed to every pod that runs as it (the default)', lineOf(r.n, 'automountServiceAccountToken'));
      for (const s of list(get(r.n, 'imagePullSecrets'))) { const sn = str(get(s, 'name')); if (sn) { know('Signs in to pull images with', `the Secret ${sn}`, s.line); link(address, addr('Secret', sn), 'reads-from', s.line); } }
    } else if (kind === 'Role' || kind === 'ClusterRole') {
      readRole({ kind, name, n: r.n, ns, know, permissions, file });
    } else if (kind === 'RoleBinding' || kind === 'ClusterRoleBinding') {
      readBinding({ kind, name, n: r.n, ns, know, permissions, file, address, link, addr });
    } else if (kind === 'NetworkPolicy') {
      readNetworkPolicy({ spec, know });
    } else if (kind === 'HorizontalPodAutoscaler') {
      const target = get(spec, 'scaleTargetRef');
      const tk = str(get(target, 'kind')), tn = str(get(target, 'name'));
      if (tk && tn) { know('Scales', `the ${kindWords(tk)} ${tn}`, lineOf(spec, 'scaleTargetRef')); link(address, addr(tk, tn), 'uses', lineOf(spec, 'scaleTargetRef')); }
      const min = num(get(spec, 'minReplicas')) ?? 1, max = num(get(spec, 'maxReplicas'));
      know('Copies', `between ${min} and ${max ?? '?'}`, lineOf(spec, 'maxReplicas'));
      const aims = [];
      const v1 = num(get(spec, 'targetCPUUtilizationPercentage'));
      if (v1) aims.push(`${v1}% of the CPU it asks for`);
      for (const m of list(get(spec, 'metrics'))) {
        const res = get(m, 'resource');
        if (res) {
          const util = num(at(res, 'target', 'averageUtilization')) ?? num(get(res, 'targetAverageUtilization'));
          aims.push(util != null ? `${util}% of the ${str(get(res, 'name')) === 'memory' ? 'memory' : 'CPU'} it asks for` : `a ${str(get(res, 'name')) ?? 'resource'} target`);
        } else aims.push(`a ${str(get(m, 'type'))?.toLowerCase() ?? 'custom'} measure`);
      }
      if (aims.length) know('Aims for', listWords(aims), lineOf(spec, v1 ? 'targetCPUUtilizationPercentage' : 'metrics'));
    } else if (kind === 'Namespace') {
      know('Is', 'a named space that keeps the resources in it apart from others', r.line);
    } else if ((kind === 'Kustomization' || kind === 'Component') && /kustomize/.test(apiVersion ?? '')) {
      // A kustomization is not a resource in the cluster: it says which files to combine and how to change them.
      const files = [...list(get(r.n, 'resources')), ...list(get(r.n, 'components')), ...list(get(r.n, 'bases'))].map(str).filter(Boolean);
      know('Combines', files.length ? short(listWords(files), 160) : 'nothing listed', lineOf(r.n, 'resources', lineOf(r.n, 'components')));
      const patches = list(get(r.n, 'patches')).length + list(get(r.n, 'patchesStrategicMerge')).length + list(get(r.n, 'patchesJson6902')).length;
      if (patches) know('Changes them with', `${patches} patch${patches === 1 ? '' : 'es'}`, lineOf(r.n, 'patches', lineOf(r.n, 'patchesStrategicMerge')));
      const nsSet = str(get(r.n, 'namespace'));
      if (nsSet) know('Puts everything in the namespace', nsSet, lineOf(r.n, 'namespace'));
      for (const im of list(get(r.n, 'images'))) know(`Image ${str(get(im, 'name'))}`, `becomes ${[str(get(im, 'newName')) ?? str(get(im, 'name')), str(get(im, 'newTag')) ?? str(get(im, 'digest'))].filter(Boolean).join(':')}`, im.line);
      thing.label = `Kustomization ${kind === 'Component' ? 'component ' : ''}(${file.slice(file.lastIndexOf('/') + 1)})`;
    } else if (kind === 'PodDisruptionBudget') {
      const min = str(get(spec, 'minAvailable')), max = str(get(spec, 'maxUnavailable'));
      know('Keeps running', min != null ? `at least ${min} of ${selectorOf(get(spec, 'selector')).says}` : `all but ${max ?? '?'} of ${selectorOf(get(spec, 'selector')).says}`, lineOf(spec, min != null ? 'minAvailable' : 'maxUnavailable'));
    } else {
      // A kind Thunder does not read in detail is still drawn, with its type as written.
      const keys = (spec?.t === 'map' ? spec.entries : r.n.entries.filter((e) => !['apiVersion', 'kind', 'metadata'].includes(e.key))).map((e) => e.key);
      know('Kind', `${kind}${apiVersion ? ` (${apiVersion})` : ''}: Thunder draws it but does not read its settings yet`, r.line);
      if (keys.length) know('Says', `${listWords(keys.slice(0, 6))}${keys.length > 6 ? `, and ${keys.length - 6} more` : ''}`, r.line);
    }
    things.push(thing);
  }

  // Services send to the workloads their selector picks, in this file; the rest are matched across files.
  const workloads = things.filter((t) => t.podLabels);
  for (const t of things) {
    if (!t.selects) continue;
    const hits = workloads.filter((w) => (w.podLabels.ns ?? '') === (t.selects.ns ?? '') && matches(t.selects.labels, w.podLabels.labels));
    for (const w of hits) link(t.address, w.address, 'sends-to', t.selects.line);
    if (!hits.length && Object.keys(t.selects.labels).length) links.push({ from: t.address, to: null, kind: 'sends-to', file, line: t.selects.line, selector: t.selects.labels, namespace: t.selects.ns ?? null });
  }
  // A setting whose value names a Service (`redis:6379`, `http://api:8080`, `db.shop.svc.cluster.local`) sends to it.
  // Only exact names: the link is drawn when a Service with that address is read, in this file or another.
  for (const t of things) for (const k of t.knows) if (k.setting && k.value != null) {
    const ns = t.address.split('/').length === 3 ? t.address.split('/')[1] : undefined;
    for (const host of servicesNamed(k.name, k.value, null)) {
      const m = /^([a-z0-9-]+)\.([a-z0-9-]+)\.svc(\.cluster\.local)?$/.exec(host);
      if (m) link(t.address, k8sAddress('Service', m[1], m[2]), 'sends-to', k.line);
      else if (/^[a-z0-9-]+$/.test(host)) link(t.address, k8sAddress('Service', host, ns), 'sends-to', k.line);
    }
    delete k.value;
  }

  for (const p of permissions) if (p.wide) fact('wide-permission', `${cap(p.who)} can ${p.can} ${p.on}: ${p.why}.`, p.line);

  // ── The order things are made: one Steps card ──
  const byAddress = new Map(declared.map((d) => [d.address, d]));
  const edges = links.filter((l) => l.to && byAddress.has(l.to) && l.kind !== 'sends-to').map((l) => [l.from, l.to]);
  const order = topoOrder(declared.map((d) => d.address), edges);
  const steps = [];
  const seen = new Set();
  for (const a of order) {
    if (seen.has(a)) continue;
    seen.add(a);
    const d = byAddress.get(a);
    const t = things.find((x) => x.address === a);
    steps.push({ kind: 'call', says: stepWords(d, t, links, byAddress), code: `kind: ${d.kind}\nname: ${d.name}`, line: d.line });
  }
  const base = file.slice(file.lastIndexOf('/') + 1);
  const items = [];
  if (steps.length) {
    const first = Math.min(...steps.map((s) => s.line)), last = Math.max(...resources.map((r) => r.endLine));
    const n = declared.length;
    items.push({
      id: `apply:${first}`, name: 'apply', label: `Applying ${base}`, title: `What applying ${base} makes, in order`, line: first, endLine: last,
      inputs: [], returns: null, provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0, stepsReadable: 1,
      says: `Applying ${base} makes ${n} Kubernetes resource${n === 1 ? '' : 's'}, in the order they rely on each other.`,
      headline: `Applying ${base}: ${n} resource${n === 1 ? '' : 's'}.`, guards: [], unread: [],
    });
  }
  return { items, things, settings, facts, links, permissions, unknowns };
}

/** The last line a node covers. */
function lastLine(n) {
  if (!n) return 0;
  if (n.t === 'map') return Math.max(n.line, ...n.entries.map((e) => Math.max(e.line, lastLine(e.value))));
  if (n.t === 'seq') return Math.max(n.line, ...n.items.map(lastLine));
  if (n.block) return (n.valueLine ?? n.line) + Math.max(0, String(n.v).replace(/\n+$/, '').split('\n').length - 1);
  return n.line;
}

/** The comment written right above a resource, unless it is a license header. */
function commentAbove(lines, line) {
  const out = [];
  for (let i = line - 2; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t.startsWith('#')) break;
    out.unshift(t.replace(/^#+\s?/, ''));
  }
  const text = out.filter(Boolean).join(' ').trim();
  if (!text || /copyright|licen[sc]e|SPDX|^Source: /i.test(text) || text.length > 300) return null;
  return text;
}

/** What one step of "applying" says: "Creates the deployment api (2 copies of api:1.4)". */
function stepWords(d, t, links, byAddress) {
  const w = `the ${kindWords(d.kind)} ${d.name}`;
  const k = (label) => t?.knows.find((x) => x.label === label)?.kind;
  const sends = links.filter((l) => l.from === d.address && l.kind === 'sends-to' && l.to && byAddress.has(l.to)).map((l) => `the ${kindWords(byAddress.get(l.to).kind)} ${byAddress.get(l.to).name}`);
  if (WORKLOADS.has(d.kind)) {
    const image = t?.knows.find((x) => x.name === 'image')?.kind;
    const copies = k('How many')?.replace(/ \(.*$/, '');
    const img = image ? imageShort(image.replace(/ \(.*$/, '')) : null;
    if (d.kind === 'CronJob') return `Creates ${w}, which runs ${k('When') ?? 'on a schedule'}${img ? ` (${img})` : ''}`;
    if (d.kind === 'Job') return `Creates ${w}, which runs once until it succeeds${img ? ` (${img})` : ''}`;
    if (d.kind === 'DaemonSet') return `Creates ${w}${img ? `, which runs ${img}` : ''} on every node`;
    if (d.kind === 'Pod') return `Creates ${w}${img ? `, which runs ${img}` : ''}`;
    return `Creates ${w}${copies || img ? ` (${[copies, img].filter(Boolean).join(' of ')})` : ''}`;
  }
  if (d.kind === 'Service' || d.kind === 'Ingress') return `Creates ${w}${sends.length ? `, which sends to ${listWords([...new Set(sends)])}` : ''}`;
  if (d.kind === 'RoleBinding' || d.kind === 'ClusterRoleBinding') return `Creates ${w}, which ${t?.knows.find((x) => x.label === 'Gives')?.kind ? `gives ${t.knows.find((x) => x.label === 'Gives').kind}` : 'gives a role'}`;
  return `Creates ${w}`;
}

// ── Workloads ─────────────────────────────────────────────────────────────────────────────────────────────

function readWorkload(c) {
  const { kind, name, spec, n, address, ns, where, know, fact, setting, link, addr, thing } = c;
  let tmpl, podSpec, podMeta;
  if (kind === 'Pod') { podSpec = spec; podMeta = get(n, 'metadata'); }
  else if (kind === 'CronJob') { tmpl = at(spec, 'jobTemplate', 'spec', 'template'); podSpec = get(tmpl, 'spec'); podMeta = get(tmpl, 'metadata'); }
  else { tmpl = get(spec, 'template'); podSpec = get(tmpl, 'spec'); podMeta = get(tmpl, 'metadata'); }
  thing.podLabels = { labels: labelsOf(get(podMeta, 'labels')), ns: ns ?? null };

  if (kind === 'CronJob') {
    const sched = str(get(spec, 'schedule'));
    const tz = str(get(spec, 'timeZone'));
    const w = sched ? cronWords(sched) : null;
    know('When', w ? (tz ? w.replace(/ UTC$/, ` (${tz} time)`) : w.replace(/ UTC$/, " (the cluster's time zone)")) : `on the schedule ${sched ?? '?'} (cron)`, lineOf(spec, 'schedule'));
    if (bool(get(spec, 'suspend'))) know('Paused', 'yes: it does not run until someone turns it back on', lineOf(spec, 'suspend'));
    const cp = str(get(spec, 'concurrencyPolicy'));
    if (cp) know('If the last run is still going', { Allow: 'runs again anyway', Forbid: 'skips this run', Replace: 'stops the last run and starts again' }[cp] ?? cp, lineOf(spec, 'concurrencyPolicy'));
  } else if (kind === 'Job') {
    const back = num(get(spec, 'backoffLimit'));
    const comp = num(get(spec, 'completions'));
    know('How many', `runs ${comp && comp > 1 ? `until it succeeds ${comp} times` : 'once until it succeeds'}, trying up to ${back ?? 6} more times`, lineOf(spec, 'backoffLimit'));
  } else if (kind === 'DaemonSet') {
    know('How many', 'one copy on every node', c.line);
  } else if (kind !== 'Pod') {
    const repl = get(spec, 'replicas');
    const rn = num(repl);
    know('How many', repl ? (rn != null ? `${rn} cop${rn === 1 ? 'y' : 'ies'}` : `${str(repl)} copies`) : '1 copy (the default; an autoscaler may change it)', lineOf(spec, 'replicas'));
  }
  if (kind === 'StatefulSet') {
    const svc = str(get(spec, 'serviceName'));
    if (svc) { know('Named through', `the service ${svc}`, lineOf(spec, 'serviceName')); link(address, addr('Service', svc), 'uses', lineOf(spec, 'serviceName')); }
    for (const vct of list(get(spec, 'volumeClaimTemplates'))) {
      const size = str(at(vct, 'spec', 'resources', 'requests', 'storage'));
      know(`Each copy keeps ${str(at(vct, 'metadata', 'name')) ?? 'storage'}`, size ? `its own ${memWords(size)} of storage` : 'its own storage', vct.line);
    }
  }
  if (!podSpec) return;

  const sa = str(get(podSpec, 'serviceAccountName')) ?? str(get(podSpec, 'serviceAccount'));
  if (sa) { know('Runs as the identity', `the service account ${sa}`, lineOf(podSpec, sa === str(get(podSpec, 'serviceAccountName')) ? 'serviceAccountName' : 'serviceAccount')); link(address, addr('ServiceAccount', sa), 'uses', lineOf(podSpec, 'serviceAccountName', lineOf(podSpec, 'serviceAccount'))); }
  for (const h of ['hostNetwork', 'hostPID', 'hostIPC']) if (bool(get(podSpec, h))) {
    const what = { hostNetwork: "the node's own network", hostPID: "every process on the node", hostIPC: "the node's shared memory" }[h];
    know('Shares', what, lineOf(podSpec, h));
    fact('privileged-container', `${where} shares ${what} (${h}: true), so it can see or reach far more than its own containers.`, lineOf(podSpec, h));
  }
  const nodeSel = labelsOf(get(podSpec, 'nodeSelector'));
  if (Object.keys(nodeSel).length) know('Runs only on nodes with', selectorWords(nodeSel), lineOf(podSpec, 'nodeSelector'));
  for (const s of list(get(podSpec, 'imagePullSecrets'))) { const sn = str(get(s, 'name')); if (sn) link(address, addr('Secret', sn), 'reads-from', s.line); }

  // Volumes: what each name is, so a mount can say where its files come from.
  const volumes = new Map();
  for (const v of list(get(podSpec, 'volumes'))) {
    const vn = str(get(v, 'name'));
    let says = 'a volume', target = null, linkKind = 'uses';
    const cm = get(v, 'configMap'), sec = get(v, 'secret'), pvc = get(v, 'persistentVolumeClaim'), hp = get(v, 'hostPath'), ed = get(v, 'emptyDir');
    if (cm) { const x = str(get(cm, 'name')); says = `the files in the ConfigMap ${x}`; target = addr('ConfigMap', x); linkKind = 'reads-from'; }
    else if (sec) { const x = str(get(sec, 'secretName')); says = `the Secret ${x}`; target = addr('Secret', x); linkKind = 'reads-from'; }
    else if (pvc) { const x = str(get(pvc, 'claimName')); says = `the storage claim ${x}`; target = addr('PersistentVolumeClaim', x); }
    else if (hp) {
      const p = str(get(hp, 'path'));
      says = `the node's own folder ${p}`;
      if (/^\/(var\/run\/docker\.sock|run\/containerd|var\/run\/crio|proc|sys)?$|docker\.sock$/.test(p ?? '')) fact('privileged-container', `${where} mounts the node's ${p === '/' ? 'whole disk' : p}, which gives it control over the node.`, v.line);
    } else if (ed) says = `a scratch folder${str(get(ed, 'medium')) === 'Memory' ? ' in memory' : ''} (emptied when the pod goes away)`;
    else if (get(v, 'projected')) says = 'files gathered from several places';
    if (vn) volumes.set(vn, { says, target, linkKind, line: v.line });
  }

  const pod = get(podSpec, 'securityContext');
  const containers = [...list(get(podSpec, 'initContainers')).map((x) => ({ n: x, init: true })), ...list(get(podSpec, 'containers')).map((x) => ({ n: x, init: false }))];
  const many = containers.length > 1;
  for (const { n: ct, init } of containers) {
    const cn = str(get(ct, 'name')) ?? 'container';
    const pre = many ? `${init ? 'Before it starts, ' : ''}${cn}: ` : '';
    const cwhere = many ? `The container ${cn} in ${where.replace(/^The /, 'the ')}` : where;
    const image = str(get(ct, 'image'));
    if (image) {
      know(`${pre}Runs`, imageWords(image, STARTS), lineOf(ct, 'image'), { name: 'image', ...(hasVar(image) ? { computed: true } : {}) });
      const says = imageNotPinned(image, cwhere);
      if (says) fact('image-not-pinned', says, lineOf(ct, 'image'));
      thing.images = [...(thing.images ?? []), { name: parseImage(image).name, ref: image, line: lineOf(ct, 'image') }];
    }
    const cmd = list(get(ct, 'command')).map(str), args = list(get(ct, 'args')).map(str);
    if (cmd.length || args.length) know(`${pre}Starts with`, short(commandText([...cmd, ...args]), 120), lineOf(ct, cmd.length ? 'command' : 'args'));
    const ports = list(get(ct, 'ports'));
    if (ports.length) know(`${pre}${ports.length === 1 ? 'Opens port' : 'Opens ports'}`, listWords(ports.map((p) => `${str(get(p, 'containerPort'))}${str(get(p, 'name')) ? ` (${str(get(p, 'name'))})` : ''}${/^udp$/i.test(str(get(p, 'protocol')) ?? '') ? ' (UDP)' : ''}`)), lineOf(ct, 'ports'));
    // Settings: a literal value is shown unless the name looks secret; a Secret's value is only named.
    for (const e of list(get(ct, 'env'))) {
      const en = str(get(e, 'name'));
      if (!en) continue;
      const vf = get(e, 'valueFrom');
      const line = e.line;
      if (vf) {
        const sk = get(vf, 'secretKeyRef'), ck = get(vf, 'configMapKeyRef'), fr = get(vf, 'fieldRef'), rr = get(vf, 'resourceFieldRef');
        if (sk) {
          const sn = str(get(sk, 'name')), key = str(get(sk, 'key'));
          know(`${pre}${en}`, `the secret value ${key} in the Secret ${sn} (only its name is shown)`, line, { name: en, setting: true, secret: true });
          setting({ name: en, source: 'secret', secret: true, line });
          link(address, addr('Secret', sn), 'reads-from', line);
        } else if (ck) {
          const cmn = str(get(ck, 'name')), key = str(get(ck, 'key'));
          know(`${pre}${en}`, `the value ${key} in the ConfigMap ${cmn}`, line, { name: en, setting: true });
          setting({ name: en, source: 'variable', secret: false, line });
          link(address, addr('ConfigMap', cmn), 'reads-from', line);
        } else if (fr || rr) {
          const what = fr ? `its own ${str(get(fr, 'fieldPath')) ?? 'details'}` : `its own ${str(get(rr, 'resource')) ?? 'resource'} amount`;
          know(`${pre}${en}`, `${what} (${STARTS})`, line, { name: en, setting: true, computed: true });
          setting({ name: en, source: 'computed', secret: false, computed: true, line });
        }
        continue;
      }
      const v = str(get(e, 'value')) ?? '';
      const secret = isSecretName(en);
      const computed = /\$\([A-Za-z_]/.test(v);
      if (secretLiteral(en, v)) fact('secret-in-plain-env', `${cwhere} has ${en} written in the file, where anyone who can read it sees the value.`, line);
      know(`${pre}${en}`, secret ? 'a secret-looking setting, written in the file (not shown)' : computed ? `${short(v)} (${STARTS})` : `a setting: ${v === '' ? '(empty)' : short(v)}`, line, { name: en, setting: true, ...(secret ? { secret: true } : {}), ...(computed ? { computed: true } : {}), ...(!secret ? { value: v } : {}) });
      setting({ name: en, source: computed ? 'computed' : 'literal', secret, line, ...(computed ? { computed: true } : {}), ...(!secret && !computed ? { default: v === '' ? '(empty)' : short(v) } : {}) });
    }
    for (const ef of list(get(ct, 'envFrom'))) {
      const cmr = get(ef, 'configMapRef'), sr = get(ef, 'secretRef');
      const pfx = str(get(ef, 'prefix'));
      if (cmr) { const x = str(get(cmr, 'name')); know(`${pre}Takes every setting in`, `the ConfigMap ${x}${pfx ? ` (named with ${pfx} in front)` : ''}`, ef.line); link(address, addr('ConfigMap', x), 'reads-from', ef.line); }
      if (sr) { const x = str(get(sr, 'name')); know(`${pre}Takes every secret in`, `the Secret ${x} (only its name is shown)`, ef.line, { secret: true }); link(address, addr('Secret', x), 'reads-from', ef.line); }
    }
    // CPU and memory.
    const res = get(ct, 'resources');
    const req = get(res, 'requests'), lim = get(res, 'limits');
    const amount = (m) => listWords([str(get(m, 'cpu')) && cpuWords(str(get(m, 'cpu'))), str(get(m, 'memory')) && `${memWords(str(get(m, 'memory')))} of memory`].filter(Boolean));
    if (req && amount(req)) know(`${pre}Asks for`, amount(req), lineOf(res, 'requests'));
    if (lim && amount(lim)) know(`${pre}Can use at most`, amount(lim), lineOf(res, 'limits'));
    if (!init && (!lim || !lim.entries?.length)) fact('no-resource-limits', `${cwhere} has no resource limits, so it can use as much CPU and memory as the node has.`, lineOf(ct, 'resources', lineOf(ct, 'name', ct.line)));
    // Health checks.
    for (const [key, label] of [['startupProbe', 'Has started when'], ['readinessProbe', 'Ready for traffic when'], ['livenessProbe', 'Restarted when']]) {
      const p = get(ct, key);
      if (p) know(`${pre}${label}`, probeWords(p, key === 'livenessProbe' ? 'fails' : 'succeeds'), lineOf(ct, key));
    }
    // Who it runs as.
    const sc = get(ct, 'securityContext');
    const pick = (k) => { const a = get(sc, k); return a ? { v: scalar(a), line: lineOf(sc, k) } : get(pod, k) ? { v: scalar(get(pod, k)), line: lineOf(pod, k) } : null; };
    const user = pick('runAsUser'), nonRoot = pick('runAsNonRoot');
    const privileged = bool(get(sc, 'privileged'));
    const adds = list(at(sc, 'capabilities', 'add')).map(str);
    const scLine = lineOf(ct, 'securityContext', lineOf(ct, 'name', ct.line));
    if (privileged) { know(`${pre}Privileged`, 'yes: it can do almost anything on the node', lineOf(sc, 'privileged')); fact('privileged-container', `${cwhere} is privileged (privileged: true), so it can do almost anything on the node.`, lineOf(sc, 'privileged')); }
    if (adds.some((a) => /^(ALL|SYS_ADMIN|CAP_SYS_ADMIN)$/i.test(a))) fact('privileged-container', `${cwhere} adds the ${adds.filter((a) => /ALL|SYS_ADMIN/i.test(a)).join(' and ')} capabilit${adds.length === 1 ? 'y' : 'ies'}, which gives it nearly the power of the node itself.`, lineOf(sc, 'capabilities'));
    if (user && Number(user.v) === 0) {
      know(`${pre}Runs as`, 'root (user 0), the user that can do anything', user.line);
      fact('runs-as-root', `${cwhere} runs as root (runAsUser: 0).`, user.line);
    } else if (user && user.v != null) {
      know(`${pre}Runs as`, `the user ${user.v}${nonRoot?.v === true ? ' (never root)' : ''}`, user.line);
    } else if (nonRoot?.v === true) {
      know(`${pre}Runs as`, 'a user that is not root (Kubernetes refuses to start it as root)', nonRoot.line);
    } else {
      know(`${pre}Runs as`, "the image's own user (the file does not say; it may be root)", scLine);
      fact('runs-as-root', `${cwhere} may run as root: nothing in the file stops it (no runAsNonRoot: true and no runAsUser).`, scLine);
    }
    if (bool(get(sc, 'readOnlyRootFilesystem'))) know(`${pre}Its own files`, 'read-only (it cannot change its image)', lineOf(sc, 'readOnlyRootFilesystem'));
    // Where its volumes are mounted.
    for (const m of list(get(ct, 'volumeMounts'))) {
      const v = volumes.get(str(get(m, 'name')));
      const ro = bool(get(m, 'readOnly'));
      know(`${pre}${str(get(m, 'mountPath'))}`, `${v?.says ?? `the volume ${str(get(m, 'name'))}`}${ro ? ' (read-only)' : ''}`, m.line);
      if (v?.target) link(address, v.target, v.linkKind, m.line);
    }
  }
  // Volumes no container mounts still point at what they name.
  for (const v of volumes.values()) if (v.target) link(address, v.target, v.linkKind, v.line);
}

// ── Ingress ───────────────────────────────────────────────────────────────────────────────────────────────

function readIngress({ spec, meta, where, know, fact, link, address, addr, line }) {
  const cls = str(get(spec, 'ingressClassName')) ?? labelsOf(get(meta, 'annotations'))['kubernetes.io/ingress.class'];
  if (cls) know('Handled by', `the ${cls} ingress controller`, lineOf(spec, 'ingressClassName', line));
  const backend = (b) => {
    if (!b) return null;
    const svc = get(b, 'service');
    const sn = str(get(svc, 'name')) ?? str(get(b, 'serviceName'));
    const port = str(at(svc, 'port', 'number')) ?? str(at(svc, 'port', 'name')) ?? str(get(b, 'servicePort'));
    if (!sn) { const r = get(b, 'resource'); return r ? { says: `the ${kindWords(str(get(r, 'kind')))} ${str(get(r, 'name'))}` } : null; }
    return { sn, says: `the service ${sn}${port ? `, port ${port}` : ''}` };
  };
  const hosts = [];
  const def = backend(get(spec, 'defaultBackend') ?? get(spec, 'backend'));
  if (def) { know('Everything else goes to', def.says, lineOf(spec, 'defaultBackend', lineOf(spec, 'backend'))); if (def.sn) link(address, addr('Service', def.sn), 'sends-to', lineOf(spec, 'defaultBackend', lineOf(spec, 'backend'))); }
  for (const rule of list(get(spec, 'rules'))) {
    const host = str(get(rule, 'host'));
    if (host) hosts.push(host);
    for (const p of list(at(rule, 'http', 'paths'))) {
      const b = backend(get(p, 'backend'));
      const path = str(get(p, 'path')) ?? '/';
      const type = str(get(p, 'pathType'));
      know(`${host ?? '(any address)'}${path}`, `${b?.says ?? 'nowhere the file names'}${type === 'Exact' ? ' (this exact path only)' : type === 'Prefix' ? ' (and everything under it)' : ''}`, p.line);
      if (b?.sn) link(address, addr('Service', b.sn), 'sends-to', p.line);
    }
  }
  for (const t of list(get(spec, 'tls'))) {
    const sn = str(get(t, 'secretName'));
    const th = list(get(t, 'hosts')).map(str);
    know('Uses HTTPS for', `${th.length ? listWords(th) : 'its addresses'}${sn ? `, with the certificate in the Secret ${sn}` : ''}`, t.line);
    if (sn) link(address, addr('Secret', sn), 'reads-from', t.line);
  }
  fact('public-ingress', `${where} lets requests from outside the cluster reach ${hosts.length ? listWords([...new Set(hosts)]) : 'its paths'} (wherever its ingress controller listens).`, lineOf(spec, 'rules', line));
}

// ── RBAC ──────────────────────────────────────────────────────────────────────────────────────────────────

function readRole({ kind, name, n, ns, know, permissions, file }) {
  const scope = kind === 'ClusterRole' ? 'wherever it is given (one namespace, or the whole cluster)' : `in the namespace ${ns ?? 'it is made in'}`;
  const who = `whoever is given the ${kindWords(kind)} ${name}`;
  for (const rule of list(get(n, 'rules'))) {
    const verbs = list(get(rule, 'verbs')).map(str);
    const res = list(get(rule, 'resources')).map(str);
    const groups = list(get(rule, 'apiGroups')).map(str);
    const names = list(get(rule, 'resourceNames')).map(str);
    const urls = list(get(rule, 'nonResourceURLs')).map(str);
    const on = urls.length ? `the addresses ${listWords(urls)}` : res.includes('*') ? `every kind of resource${groups.includes('*') ? '' : groups.length && groups.some((g) => g) ? ` in ${listWords(groups.filter(Boolean))}` : ''}` : `${names.length ? `the ${listWords(res)} named ${listWords(names)}` : listWords(res)}`;
    const can = verbsWords(verbs);
    const wide = verbs.includes('*') || res.includes('*');
    const touchesSecrets = res.includes('secrets') && verbs.some((v) => ['get', 'list', 'watch', '*'].includes(v));
    know(cap(can), `${on}${urls.length ? '' : ` ${scope}`}`, rule.line);
    permissions.push({
      id: `${file}#permission#${rule.line}#${permissions.length}`, who, can, on: `${on}${urls.length ? '' : ` ${scope}`}`, wide, ...(wide ? { why: verbs.includes('*') && res.includes('*') && (groups.includes('*') || !groups.length) ? 'it can do anything to anything' : verbs.includes('*') ? `it can do anything to ${on}` : `it can ${can} every kind of resource` } : {}),
      role: name, file, line: rule.line, says: `${cap(who)} can ${can} ${on}${urls.length ? '' : ` ${scope}`}${wide ? ' (wide)' : touchesSecrets ? ' (including Secret values)' : ''}`,
    });
  }
  const agg = get(n, 'aggregationRule');
  if (agg) know('Gathers', `the rules of every cluster role with ${listWords(list(get(agg, 'clusterRoleSelectors')).map((s) => selectorOf(s).says.replace(/^pods with /, '')))}`, lineOf(n, 'aggregationRule'));
}

function subjectWords(s) {
  const k = str(get(s, 'kind')), n = str(get(s, 'name')), ns = str(get(s, 'namespace'));
  if (k === 'Group' && n === 'system:unauthenticated') return 'anyone, even without signing in';
  if (k === 'Group' && n === 'system:authenticated') return 'everyone who is signed in to the cluster';
  if (k === 'User' && n === 'system:anonymous') return 'anyone, even without signing in';
  if (k === 'Group' && n === 'system:serviceaccounts') return 'every service account in the cluster';
  if (k === 'ServiceAccount') return `the service account ${ns ? `${ns}/` : ''}${n}`;
  return `the ${String(k ?? 'subject').toLowerCase()} ${n}`;
}

function readBinding({ kind, name, n, ns, know, permissions, file, address, link, addr }) {
  const ref = get(n, 'roleRef');
  const rk = str(get(ref, 'kind')) ?? 'Role', rn = str(get(ref, 'name')) ?? '?';
  const subs = list(get(n, 'subjects'));
  const who = subs.length ? listWords(subs.map(subjectWords)) : 'no one (it has no subjects)';
  const scope = kind === 'ClusterRoleBinding' ? 'in the whole cluster' : `in the namespace ${ns ?? 'it is made in'}`;
  const builtin = rk === 'ClusterRole' ? BUILTIN_ROLES[rn] : null;
  const can = builtin ?? `do what the ${kindWords(rk)} ${rn} allows`;
  const anyone = subs.some((s) => /^system:(unauthenticated|anonymous|authenticated)$/.test(str(get(s, 'name')) ?? ''));
  const wide = rn === 'cluster-admin' || (kind === 'ClusterRoleBinding' && (rn === 'admin' || rn === 'edit')) || (anyone && rn !== 'system:public-info-viewer' && rn !== 'system:discovery' && rn !== 'system:basic-user');
  know('Gives', `${who} the ${kindWords(rk)} ${rn}`, lineOf(n, 'roleRef'));
  know('Where', scope, lineOf(n, 'roleRef'));
  permissions.push({
    id: `${file}#permission#${lineOf(n, 'roleRef', n.line)}#${permissions.length}`, who, can, on: scope, wide, role: rn,
    ...(wide ? { why: rn === 'cluster-admin' ? `cluster-admin lets ${anyone ? 'them' : 'it'} do anything in the whole cluster` : anyone ? `it gives ${rn} to ${who}` : `${rn} ${scope} lets it change almost everything` } : {}),
    file, line: lineOf(n, 'roleRef', n.line), says: `${cap(who)} can ${can} ${scope}${wide ? ' (wide)' : ''}`,
  });
  link(address, addr(rk, rn), 'uses', lineOf(n, 'roleRef'));
  for (const s of subs) if (str(get(s, 'kind')) === 'ServiceAccount') link(address, k8sAddress('ServiceAccount', str(get(s, 'name')), str(get(s, 'namespace')) ?? ns), 'uses', s.line);
}

// ── Network policies, in words ────────────────────────────────────────────────────────────────────────────

function peerWords(p) {
  const parts = [];
  const pod = get(p, 'podSelector'), nsSel = get(p, 'namespaceSelector'), ip = get(p, 'ipBlock');
  if (ip) { const ex = list(get(ip, 'except')).map(str); parts.push(`${str(get(ip, 'cidr')) === '0.0.0.0/0' ? 'any address' : `addresses in ${str(get(ip, 'cidr'))}`}${ex.length ? ` except ${listWords(ex)}` : ''}`); }
  if (pod || nsSel) {
    const pw = pod ? selectorOf(pod).says : 'every pod';
    const nw = nsSel ? (Object.keys(selectorOf(nsSel).labels).length ? `namespaces with ${selectorWords(selectorOf(nsSel).labels)}` : 'every namespace') : 'its own namespace';
    parts.push(`${pw} in ${nw}`);
  }
  return parts.join(' and ') || 'anywhere';
}

function readNetworkPolicy({ spec, know }) {
  know('Applies to', `${selectorOf(get(spec, 'podSelector')).says} in its namespace`, lineOf(spec, 'podSelector'));
  const types = list(get(spec, 'policyTypes')).map(str);
  const has = (k) => types.includes(k) || (!types.length && (k === 'Ingress' || get(spec, 'egress')));
  for (const [key, type, label, dir] of [['ingress', 'Ingress', 'Lets in', 'from'], ['egress', 'Egress', 'Lets out', 'to']]) {
    if (!has(type)) continue;
    const rules = list(get(spec, key));
    if (!rules.length) { know(label, `nothing: every ${key === 'ingress' ? 'incoming' : 'outgoing'} connection is blocked`, lineOf(spec, key, lineOf(spec, 'policyTypes'))); continue; }
    for (const r of rules) {
      const peers = list(get(r, dir));
      const ports = list(get(r, 'ports')).map((p) => `${str(get(p, 'port')) ?? 'any port'}${/^udp$/i.test(str(get(p, 'protocol')) ?? '') ? ' (UDP)' : ''}`);
      know(label, `${peers.length ? `${dir} ${listWords(peers.map(peerWords))}` : `${dir} anywhere`}${ports.length ? `, on port${ports.length === 1 ? '' : 's'} ${listWords(ports)}` : ''}`, r.line);
    }
  }
}
