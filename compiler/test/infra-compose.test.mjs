// Docker Compose in Thunder (spec section 12): services and named volumes, networks, and secrets as Resources, what
// a service knows in words, links (depends_on, networks, secrets, settings that name a service, and the Dockerfile a
// service builds), the order things start, and facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile } from '../src/read-repo.mjs';
import { readCompose } from '../src/infra-compose.mjs';
import { thunderModel, readLevel } from '../src/model.mjs';

const src = readFileSync(new URL('./fixtures/infra/compose.yaml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('./fixtures/infra/Dockerfile', import.meta.url), 'utf8');
const r = readCompose(src, 'compose.yaml');
const thing = (address) => r.things.find((t) => t.address === address);
const knows = (t) => t.knows.map((k) => `${k.label}: ${k.kind}`);
const has = (from, kind, to) => assert.ok(r.links.some((l) => l.from === from && l.kind === kind && l.to === to), `${from} ${kind} ${to}`);

test('Compose files are known by their names', () => {
  for (const p of ['docker-compose.yml', 'compose.yaml', 'deploy/docker-compose.prod.yml', 'app.compose.yml', 'compose.override.yaml']) assert.equal(readableFile(p), 'docker-compose', p);
  assert.equal(readableFile('composer.yaml'), null);
  assert.equal(detectLanguage(src), 'docker-compose');
  assert.equal(readCode(src, { language: 'compose' }).language, 'docker-compose');
  assert.equal(readCode(src, { file: 'compose.yaml' }).purpose, 'shop');
});

test('each service, named volume, network, and secret is a Resource with a stable address', () => {
  assert.deepEqual(r.things.map((t) => [t.address, t.resourceType, t.label]), [
    ['networks.front', 'compose-network', 'Network front'], ['networks.back', 'compose-network', 'Network back'],
    ['volumes.db-data', 'compose-volume', 'Volume db-data'], ['secrets.stripe_key', 'compose-secret', 'Secret stripe_key'],
    ['services.web', 'compose-service', 'Service web'], ['services.api', 'compose-service', 'Service api'], ['services.db', 'compose-service', 'Service db'],
    ['services.cache', 'compose-service', 'Service cache'], ['services.agent', 'compose-service', 'Service agent'],
  ]);
});

test('a service knows what it runs, publishes, is given, keeps, and waits for, in words', () => {
  assert.deepEqual(knows(thing('services.web')), [
    'Built from: the folder ./web, the runtime stage', 'Names the image: acme/web:dev',
    'Publishes: port 3000 as port 3000, on every network the computer is on', 'Publishes: port 9229 as port 9229, on this computer only',
    'API_URL: a setting: http://api:8080', 'NODE_ENV: a setting: production', 'Starts after: api', 'On the network: front',
  ]);
  const api = knows(thing('services.api'));
  assert.ok(api.includes('DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/shop (worked out when it starts, from the variable DB_PASSWORD)'));
  assert.ok(api.includes('JWT_SECRET: a secret-looking setting, written in the file (not shown)'));
  assert.ok(api.includes('LOG_LEVEL: taken from the computer it starts on (worked out when it starts)'));
  assert.ok(api.includes('Starts after: db (once it is healthy) and cache'));
  assert.ok(api.includes('Can use at most: 0.5 CPU and 512 MB of memory'));
  assert.ok(api.includes('Reads the secret: stripe_key (at /run/secrets/stripe_key, only its name is shown)'));
  assert.ok(knows(thing('services.db')).includes('Keeps /var/lib/postgresql/data: in the volume db-data'));
  assert.ok(knows(thing('services.db')).includes('Checks its health with: "pg_isready -U postgres", every 5s'));
  assert.ok(knows(thing('services.agent')).includes('Only starts with: the profile monitoring'));
  assert.ok(!JSON.stringify(r).includes('dev-secret-123'), 'a secret-looking value is never shown');
  const s = (n) => r.settings.find((x) => x.name === n);
  assert.deepEqual([s('DATABASE_URL').source, s('DATABASE_URL').computed], ['computed', true]);
  assert.deepEqual([s('JWT_SECRET').secret, s('JWT_SECRET').default], [true, undefined]);
  assert.equal(s('NODE_ENV').default, 'production');
  assert.equal(s('stripe_key').source, 'secret');
});

test('depends_on, networks, secrets, volumes, and settings that name a service are links with lines', () => {
  has('services.web', 'sends-to', 'services.api');
  has('services.api', 'sends-to', 'services.db');
  has('services.api', 'sends-to', 'services.cache');
  has('services.api', 'reads-from', 'secrets.stripe_key');
  has('services.api', 'runs-in', 'networks.back');
  has('services.db', 'uses', 'volumes.db-data');
  has('services.web', 'uses', 'image:web/Dockerfile');
  has('services.api', 'uses', 'image:api/Dockerfile');
  for (const l of r.links) { assert.equal(l.file, 'compose.yaml'); assert.ok(l.line > 0); }
});

test('the flow is the order things start, with a question for a profile', () => {
  const says = (steps) => steps.map((s) => (s.children ? [s.says, says(s.children)] : s.says));
  assert.equal(r.items[0].title, 'What starting compose.yaml does, in order');
  assert.deepEqual(says(r.items[0].steps), [
    'Creates the network front', 'Creates the network back', 'Creates the volume db-data',
    'Starts db (postgres:16, pinned)', 'Starts cache (redis)',
    'Builds and starts api (from ./api), once db is healthy and cache has started',
    'Builds and starts web (from ./web), once api has started',
    ['Is the profile monitoring turned on?', ['Starts agent (acme/agent:1.2)']],
  ]);
});

test('facts: published ports, unpinned images, secrets in settings, root, the Docker socket, privileged', () => {
  const byKind = (k) => r.facts.filter((f) => f.kind === k).map((f) => f.line);
  assert.deepEqual(byKind('public-ingress'), [14], 'the port bound to 127.0.0.1 is not public');
  assert.deepEqual(byKind('image-not-pinned'), [59, 64], 'the image pinned by digest is not reported');
  assert.deepEqual(byKind('secret-in-plain-env'), [29]);
  assert.deepEqual(byKind('runs-as-root'), [60]);
  assert.deepEqual(byKind('privileged-container').sort((a, b) => a - b), [66, 68]);
});

test('at app scope a service is linked to the Dockerfile it builds, by exact path only', () => {
  const m = thunderModel([{ path: 'compose.yaml', source: src }, { path: 'web/Dockerfile', source: dockerfile }, { path: 'other/Dockerfile', source: dockerfile }]);
  const label = (id) => m.things.find((t) => t.id === id)?.label;
  const links = m.links.map((l) => `${label(l.from)} ${l.kind} ${label(l.to)}`);
  assert.ok(links.includes('Service web uses Web image'));
  assert.ok(!links.some((l) => /Other image/.test(l)));
  assert.equal(m.files[0].category, 'infrastructure');
  assert.match(readLevel(m, 'text').text, /Starting compose\.yaml\n  - Creates the network front/);
});

test('a build context outside the repository, a remote one, or a variable is not linked', () => {
  const x = readCompose('services:\n  a:\n    build: ../../elsewhere\n  b:\n    build: https://github.com/acme/b.git\n  c:\n    build: ${CTX}\n', 'compose.yaml');
  assert.equal(x.links.length, 0);
});
