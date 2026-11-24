// Kubernetes in Thunder (spec section 12): resources and what they know, links (selectors, settings that name a
// Service, ConfigMaps and Secrets read), permissions (wide ones called wide), settings (secrets only named), facts,
// the order things are made, and Helm templates listed as not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile, readRepo } from '../src/read-repo.mjs';
import { readKubernetes, k8sAddress, isHelmTemplate } from '../src/infra-k8s.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';

const shop = readFileSync(new URL('./fixtures/infra/shop.yaml', import.meta.url), 'utf8');
const r = readKubernetes(shop, 'k8s/shop.yaml');
const thing = (address) => r.things.find((t) => t.address === address);
const knows = (t) => Object.fromEntries(t.knows.map((k) => [k.label, k.kind]));
const has = (from, kind, to) => assert.ok(r.links.some((l) => l.from === from && l.kind === kind && l.to === to), `${from} ${kind} ${to}`);

test('Kubernetes YAML is known by apiVersion and kind in its first lines, not by its name', () => {
  assert.equal(readableFile('deploy/api.yaml', 'apiVersion: apps/v1\nkind: Deployment\n'), 'kubernetes');
  assert.equal(readableFile('deploy/api.yaml', '# a comment\n---\napiVersion: v1\nkind: Service\n'), 'kubernetes');
  assert.equal(readableFile('deploy/values.yaml', 'replicas: 2\n'), null);
  assert.equal(readableFile('deploy/api.yaml'), null, 'without its first lines a YAML file is not claimed');
  assert.equal(readableFile('charts/web/Chart.yaml', 'apiVersion: v2\nname: web\n'), null);
  assert.equal(detectLanguage(shop), 'kubernetes');
  assert.equal(readCode(shop, { language: 'k8s', file: 'shop.yaml' }).language, 'kubernetes');
});

test('each resource is a Resource with its kind as written and a Kind/namespace/name address', () => {
  assert.equal(k8sAddress('Deployment', 'api'), 'Deployment/api');
  assert.equal(k8sAddress('Deployment', 'api', 'default'), 'Deployment/api');
  assert.equal(k8sAddress('ClusterRole', 'x', 'shop'), 'ClusterRole/x');
  assert.deepEqual(r.things.map((t) => t.address).slice(0, 5), ['Namespace/shop', 'ConfigMap/shop/api-config', 'Secret/shop/db-creds', 'ServiceAccount/shop/api', 'Deployment/shop/api']);
  const api = thing('Deployment/shop/api');
  assert.deepEqual([api.kind, api.resourceType, api.label, api.lines], ['resource', 'Deployment', 'Deployment api', [31, 86]]);
  assert.equal(api.doc, 'The web API: three copies behind the load balancer.');
});

test('a workload knows what it runs in words; a Secret value is only named', () => {
  const k = knows(thing('Deployment/shop/api'));
  assert.equal(k['How many'], '3 copies');
  assert.equal(k.Runs, 'ghcr.io/acme/api:1.4.2');
  assert.equal(k['Opens port'], '8080');
  assert.equal(k['Runs as the identity'], 'the service account api');
  assert.equal(k.DB_PASSWORD, 'the secret value password in the Secret db-creds (only its name is shown)');
  assert.equal(k.API_TOKEN, 'a secret-looking setting, written in the file (not shown)');
  assert.equal(k.DATABASE_URL, 'a setting: postgres://db:5432/shop');
  assert.equal(k['Takes every setting in'], 'the ConfigMap api-config');
  assert.equal(k['Asks for'], '0.1 CPU and 128 MiB of memory');
  assert.equal(k['Can use at most'], '0.5 CPU and 256 MiB of memory');
  assert.equal(k['Ready for traffic when'], 'a web request to /healthz on port 8080 succeeds (every 5 seconds)');
  assert.equal(k['Runs as'], 'the user 1000 (never root)');
  assert.equal(k['/data'], 'the storage claim uploads');
  assert.equal(knows(thing('CronJob/shop/nightly-report')).When, "every day at 02:00 (the cluster's time zone)");
  assert.equal(knows(thing('PersistentVolumeClaim/shop/uploads'))['Asks for'], '10 GiB of storage');
  assert.equal(knows(thing('HorizontalPodAutoscaler/shop/api')).Copies, 'between 3 and 10');
  assert.equal(knows(thing('NetworkPolicy/shop/db-only-from-api'))['Lets in'], 'from pods with app=api in its own namespace, on port 5432');
  assert.equal(knows(thing('Ingress/shop/web'))['shop.example.com/api'], 'the service api, port 80 (and everything under it)');
  // Secret values never appear anywhere in the reading.
  const all = JSON.stringify(r);
  for (const v of ['s3cret-value', 'tok_live_123', 'hunter2']) assert.ok(!all.includes(v), v);
});

test('selectors, settings that name a Service, and what a workload reads become links with lines', () => {
  has('Service/shop/api', 'sends-to', 'Deployment/shop/api');
  has('Service/shop/db', 'sends-to', 'StatefulSet/shop/db');
  has('Ingress/shop/web', 'sends-to', 'Service/shop/api');
  has('Deployment/shop/api', 'sends-to', 'Service/shop/db');
  has('Deployment/shop/api', 'reads-from', 'Secret/shop/db-creds');
  has('Deployment/shop/api', 'reads-from', 'ConfigMap/shop/api-config');
  has('Deployment/shop/api', 'uses', 'ServiceAccount/shop/api');
  has('Deployment/shop/api', 'uses', 'PersistentVolumeClaim/shop/uploads');
  has('Deployment/shop/api', 'runs-in', 'Namespace/shop');
  has('HorizontalPodAutoscaler/shop/api', 'uses', 'Deployment/shop/api');
  has('RoleBinding/shop/api-reads-config', 'uses', 'Role/shop/config-reader');
  for (const l of r.links) { assert.equal(l.file, 'k8s/shop.yaml'); assert.ok(l.line > 0); }
});

test('RBAC rules and bindings are Permissions; cluster-admin is wide', () => {
  const says = r.permissions.map((p) => [p.says, p.wide]);
  assert.deepEqual(says, [
    ['Whoever is given the role config-reader can read (get, list, and watch) configmaps in the namespace shop', false],
    ['The service account shop/api can do what the role config-reader allows in the namespace shop', false],
    ['The service account ci/deployer can do anything (cluster-admin) in the whole cluster (wide)', true],
  ]);
  const star = readKubernetes('apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: god\nrules:\n  - apiGroups: ["*"]\n    resources: ["*"]\n    verbs: ["*"]\n');
  assert.equal(star.permissions[0].wide, true);
  assert.equal(star.permissions[0].why, 'it can do anything to anything');
  assert.ok(star.facts.some((f) => f.kind === 'wide-permission'));
});

test('facts: root, privileged, limits, unpinned images, public ingress, secrets written in the file', () => {
  const byKind = (k) => r.facts.filter((f) => f.kind === k).map((f) => f.line);
  assert.deepEqual(byKind('runs-as-root'), [118, 260]);
  assert.deepEqual(byKind('privileged-container'), [119]);
  assert.deepEqual(byKind('no-resource-limits'), [116, 256]);
  assert.deepEqual(byKind('image-not-pinned'), [52, 117], 'the digest-pinned CronJob image is not reported');
  assert.deepEqual(byKind('public-ingress'), [139, 156]);
  assert.deepEqual(byKind('secret-in-plain-env'), [63]);
  assert.deepEqual(byKind('secret-in-plain-config'), [13, 22]);
  assert.deepEqual(byKind('wide-permission'), [238]);
  assert.match(r.facts.find((f) => f.kind === 'public-ingress').says, /LoadBalancer: anyone on the internet can reach port 80/);
  // An internal load balancer is not public.
  const internal = readKubernetes('apiVersion: v1\nkind: Service\nmetadata:\n  name: x\n  annotations:\n    service.beta.kubernetes.io/azure-load-balancer-internal: "true"\nspec:\n  type: LoadBalancer\n  ports:\n    - port: 80\n');
  assert.equal(internal.facts.length, 0);
});

test('the flow is the order things are made, one step per resource', () => {
  assert.equal(r.items.length, 1);
  const it = r.items[0];
  assert.equal(it.title, 'What applying shop.yaml makes, in order');
  const says = it.steps.map((s) => s.says);
  assert.equal(says[0], 'Creates the namespace shop');
  assert.ok(says.includes('Creates the deployment api (3 copies of ghcr.io/acme/api:1.4.2)'));
  assert.ok(says.includes('Creates the service api, which sends to the deployment api'));
  assert.ok(says.indexOf('Creates the Secret db-creds') < says.indexOf('Creates the deployment api (3 copies of ghcr.io/acme/api:1.4.2)'), 'what a workload reads is made first');
  assert.ok(says.indexOf('Creates the service db') < says.indexOf('Creates the stateful set db (1 copy of postgres:latest)'), 'a StatefulSet names its Service, which is made first');
});

test('Helm and other templates are listed as skipped with the reason; one bad document does not hide the rest', () => {
  const helm = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Release.Name }}\n';
  assert.ok(isHelmTemplate(helm));
  assert.ok(!isHelmTemplate('apiVersion: v1\nkind: ConfigMap\ndata:\n  alert: |\n    {{ $labels.instance }} is down\n'));
  const idx = readRepo([{ path: 'charts/web/templates/deploy.yaml', source: helm }]);
  assert.match(idx.skipped[0].reason, /Helm template/);
  const two = readKubernetes('apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: a\n  bad: [\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: b\n');
  assert.deepEqual(two.things.map((t) => t.address), ['ConfigMap/b']);
  assert.equal(two.unknowns.length, 1);
  // kind: List is opened up.
  const lst = readKubernetes('apiVersion: v1\nkind: List\nitems:\n  - apiVersion: v1\n    kind: Service\n    metadata:\n      name: s\n');
  assert.deepEqual(lst.things.map((t) => t.address), ['Service/s']);
});

test('across files: a Service finds its workload, a setting its Service, and a workload the Dockerfile with its exact name', () => {
  const files = [
    { path: 'k8s/cart.yaml', source: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: cart\nspec:\n  template:\n    metadata:\n      labels:\n        app: cart\n    spec:\n      containers:\n        - name: cart\n          image: gcr.io/shop/cart:1.2\n          env:\n            - name: REDIS_ADDR\n              value: redis:6379\n' },
    { path: 'k8s/cart-svc.yaml', source: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: cart\nspec:\n  selector:\n    app: cart\n  ports:\n    - port: 80\n' },
    { path: 'k8s/redis.yaml', source: 'apiVersion: v1\nkind: Service\nmetadata:\n  name: redis\nspec:\n  selector:\n    app: redis\n  ports:\n    - port: 6379\n' },
    { path: 'src/cart/Dockerfile', source: 'FROM node:22-slim\nCMD ["node", "server.js"]\n' },
    { path: 'src/other/Dockerfile', source: 'FROM node:22-slim\nCMD ["node", "x.js"]\n' },
  ];
  const m = thunderModel(files);
  const label = (id) => m.things.find((t) => t.id === id)?.label;
  const links = m.links.map((l) => `${label(l.from)} ${l.kind} ${label(l.to)}`);
  assert.ok(links.includes('Service cart sends-to Deployment cart'));
  assert.ok(links.includes('Deployment cart sends-to Service redis'));
  assert.ok(links.includes('Deployment cart uses Cart image'));
  assert.ok(!links.some((l) => l.includes('Other image')), 'never a guess beyond the exact name');
  assert.deepEqual(m.files.map((f) => f.category), ['infrastructure', 'infrastructure', 'infrastructure', 'infrastructure', 'infrastructure']);
  for (const t of m.things) for (const k of ['podLabels', 'selects', 'images']) assert.equal(t[k], undefined, `${k} is only used while the model is made`);
  const text = readLevel(m, 'text').text;
  assert.match(text, /Resource Deployment cart \(Deployment\)/);
  assert.match(text, /Applying cart\.yaml/);
});
