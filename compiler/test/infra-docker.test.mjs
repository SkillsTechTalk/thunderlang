// Dockerfiles in Thunder (spec section 12): each build stage as steps in words, and the image it makes as a Resource.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile, readRepo } from '../src/read-repo.mjs';
import { readDockerfile, dockerInstructions } from '../src/infra-docker.mjs';
import { commandSays } from '../src/infra-words.mjs';
import { thunderModel, readLevel, modelText } from '../src/model.mjs';
import { visualFor } from '../src/visual.mjs';

const fixture = readFileSync(new URL('./fixtures/infra/Dockerfile', import.meta.url), 'utf8');
const says = (steps) => steps.map((s) => s.says);

test('Dockerfile, Dockerfile.*, *.dockerfile, and Containerfile are read as Dockerfiles; other files are not', () => {
  for (const p of ['Dockerfile', 'api/Dockerfile', 'Dockerfile.prod', 'docker/web.dockerfile', 'Containerfile']) assert.equal(readableFile(p), 'dockerfile', p);
  for (const p of ['Dockerfile.md', 'docs/dockerfile-guide.txt', '.dockerignore', 'node_modules/x/Dockerfile']) assert.equal(readableFile(p), null, p);
  assert.equal(detectLanguage(fixture), 'dockerfile', 'pasted text');
  assert.equal(detectLanguage('', 'services/api/Dockerfile'), 'dockerfile');
});

test('a multi-stage Node build: one Steps card per stage, named after the stage, each step in words', () => {
  const r = readCode(fixture, { file: 'Dockerfile' });
  assert.equal(r.language, 'dockerfile');
  assert.deepEqual(r.items.map((i) => [i.name, i.label, i.line]), [['build', 'The build stage', 5], ['runtime', 'The runtime stage', 14]]);
  assert.deepEqual(says(r.items[0].steps), [
    'Starts from node:${NODE_VERSION}-slim (worked out when it is built)',
    'Works in /app',
    'Copies package.json and package-lock.json into the image',
    'Installs what it needs (npm ci)',
    'Copies the whole project folder into the image',
    'Builds it',
    'Removes packages it no longer needs (npm prune)',
  ]);
  assert.deepEqual(says(r.items[1].steps), [
    'Starts from node:22-slim',
    'Updates the list of packages it can install',
    'Installs curl and tini',
    'Cleans up after installing',
    'Works in /app',
    'Sets NODE_ENV to production',
    'Sets PORT to 3000',
    'Copies /app/dist from the build stage into ./dist',
    'Copies /app/node_modules from the build stage into ./node_modules',
    'Opens port 3000',
    'Runs as the user node',
    'Checks its health with curl -f http://localhost:3000/health every 30s',
    'Starts with tini --, given node dist/server.js',
  ]);
  // The `&&` chain on lines 10-11 is two steps, both on the line the command starts on.
  assert.deepEqual(r.items[0].steps.slice(-2).map((s) => s.line), [10, 10]);
  assert.equal(r.items[0].doc, 'Build the app with every dependency, including the ones only needed to build.');
  assert.equal(r.items[0].completeness.level, 'explained');
});

test('a single stage is "Image build"; FROM an earlier stage and CMD wherever it is written', () => {
  const r = readDockerfile('FROM python:3.12\nCMD ["python", "app.py"]\nWORKDIR /srv\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nEXPOSE 8000 9000/udp\n');
  assert.equal(r.items[0].label, 'Image build');
  assert.equal(r.items[0].title, 'What the image build does');
  assert.deepEqual(says(r.items[0].steps), ['Starts from python:3.12', 'Works in /srv', 'Copies requirements.txt into the image', 'Installs what requirements.txt lists', 'Opens ports 8000 and 9000 (UDP)', 'Starts with python app.py']);
  const s = readDockerfile('FROM golang:1.23 AS build\nRUN go build -o /app\nFROM build AS test\nRUN go test ./...\n');
  assert.equal(s.items[1].steps[0].says, 'Starts from the build stage');
  assert.deepEqual(s.links.map((l) => [l.from, l.to, l.kind]), [['test:3', 'build:1', 'uses']]);
});

test('RUN commands read in words; unknown commands are named, never dropped', () => {
  assert.equal(commandSays('npm ci').says, 'Installs what it needs (npm ci)');
  assert.equal(commandSays('apt-get install -y a b').says, 'Installs a and b');
  assert.equal(commandSays('pip install -r requirements.txt').says, 'Installs what requirements.txt lists');
  assert.equal(commandSays('./configure --prefix=/usr').says, 'Runs configure');
  assert.equal(commandSays('frobnicate --hard').says, 'Runs `frobnicate --hard`');
  const r = readDockerfile('FROM alpine\nRUN apk add --no-cache git && frobnicate --hard\n');
  assert.deepEqual(says(r.items[0].steps), ['Starts from alpine', 'Installs git', 'Runs `frobnicate --hard`']);
  assert.match(readCode('FROM alpine\nRUN frobnicate\n', { language: 'dockerfile' }).items[0].completeness.reasons.join(), /1 command only named/);
});

test('continuation lines, comments inside them, heredocs, and the escape directive', () => {
  const ins = dockerInstructions('# escape=`\nFROM mcr.microsoft.com/windows/servercore\nRUN dir `\n  # a comment inside\n  c:\\\n');
  assert.equal(ins[1].args.replace(/\s+/g, ' '), 'dir c:\\');
  const h = readDockerfile('FROM debian\nRUN <<EOF\napt-get update\napt-get install -y curl\nEOF\nCMD ["bash"]\n');
  assert.deepEqual(says(h.items[0].steps), ['Starts from debian', 'Updates the list of packages it can install', 'Installs curl', 'Starts with bash']);
  assert.deepEqual(h.items[0].steps.slice(1, 3).map((s) => s.line), [3, 4]);
});

test('the image is a Resource: what it starts from, its port, user, start command, and settings (never a secret value)', () => {
  const r = readDockerfile(fixture, 'services/web/Dockerfile');
  const [img] = r.things;
  assert.equal(img.kind, 'resource');
  assert.equal(img.resourceType, 'docker-image');
  assert.equal(img.address, 'image:services/web/Dockerfile');
  assert.equal(img.name, 'web image');
  const knows = Object.fromEntries(img.knows.map((k) => [k.label, k.kind]));
  assert.equal(knows['Starts from'], 'node:22-slim');
  assert.equal(knows['Opens port'], '3000');
  assert.equal(knows['Runs as'], 'the user node');
  assert.equal(knows['Starts with'], 'tini --, given node dist/server.js');
  assert.equal(knows.NODE_ENV, 'a setting: production');
  const s = readDockerfile('FROM node:22\nARG BUILD_TOKEN\nENV API_KEY=abc123 HOME_DIR=$HOME/app\nRUN --mount=type=secret,id=npm npm ci\n');
  const k = Object.fromEntries(s.things[0].knows.map((x) => [x.label, x]));
  assert.equal(k.API_KEY.kind, 'a secret setting (its value is not shown)');
  assert.ok(!JSON.stringify(s).includes('abc123') || s.items[0].steps.every((x) => !x.says.includes('abc123')));
  assert.ok(!JSON.stringify(s.things).includes('abc123'), 'a secret value is never in what the image knows');
  assert.equal(k.HOME_DIR.computed, true);
  assert.deepEqual(s.settings.map((x) => [x.name, x.source, x.secret]), [['BUILD_TOKEN', 'parameter', true], ['API_KEY', 'literal', true], ['HOME_DIR', 'computed', false], ['npm', 'secret', true]]);
  assert.match(says(s.items[0].steps).join('\n'), /Sets API_KEY \(its value is written here, not shown\)/);
  assert.match(says(s.items[0].steps).join('\n'), /Installs what it needs \(npm ci\) \(uses the secret npm\)/);
});

test('facts: images without a digest, running as root, and secrets written into ENV', () => {
  const r = readDockerfile('FROM node:22@sha256:' + 'a'.repeat(64) + ' AS a\nFROM ubuntu:24.04\nENV DB_PASSWORD=swordfish\nCMD ["./run"]\n', 'Dockerfile');
  assert.deepEqual(r.facts.map((f) => [f.kind, f.line]), [['image-not-pinned', 2], ['secret-in-plain-env', 3], ['runs-as-root', 2]]);
  assert.ok(r.facts.every((f) => f.id && f.says && f.file === 'Dockerfile'));
  assert.ok(!r.facts.some((f) => f.says.includes('swordfish')));
  assert.equal(readDockerfile('FROM node\nUSER root\n').facts.find((f) => f.kind === 'runs-as-root').line, 2);
  assert.ok(!readDockerfile(fixture).facts.some((f) => f.kind === 'runs-as-root'));
});

test('in the model: an image-build member, a resource with an address, the infrastructure category, and Big Picture resources', () => {
  const model = thunderModel([{ path: 'services/web/Dockerfile', source: fixture }], { name: 'shop' });
  assert.deepEqual(model.files, [{ path: 'services/web/Dockerfile', language: 'dockerfile', category: 'infrastructure' }]);
  assert.deepEqual(model.members.map((m) => [m.kind, m.label]), [['image-build', 'The build stage'], ['image-build', 'The runtime stage']]);
  assert.equal(model.things[0].kind, 'resource');
  assert.deepEqual(model.things[0].can, [], 'stages are not abilities of the image');
  assert.deepEqual(model.links.map((l) => [l.kind, l.line]), [['uses', 19], ['uses', 20]]);
  const bp = readLevel(model, 'big-picture');
  assert.equal(bp.resources.length, 1);
  assert.equal(bp.resources[0].symbol, 'resource');
  assert.equal(bp.resources[0].address, 'image:services/web/Dockerfile');
  assert.ok(bp.data.every((d) => d.symbol !== 'resource'));
  assert.deepEqual(bp.loose.map((x) => x.symbol), ['steps', 'steps']);
  assert.ok(bp.facts.some((f) => f.kind === 'image-not-pinned'));
  assert.ok(bp.settings.some((s) => s.name === 'NODE_VERSION' && s.source === 'parameter'));
  const text = modelText(model, model.things[0].id);
  assert.match(text, /^Resource Web image \(docker-image\)\n {2}It knows\n {4}Starts from: node:22-slim/);
  assert.equal(readLevel(model, 'big-picture', model.things[0].id).resources.length, 1);
  assert.equal(visualFor(readCode(fixture, { file: 'Dockerfile' }).items[0]).title, 'What the build stage does');
});

test('a folder of files: Dockerfiles are listed with what they read, and an unreadable file is skipped with a reason', () => {
  const idx = readRepo([{ path: 'Dockerfile', source: fixture }, { path: '.github/workflows/bad.yml', source: 'jobs:\n  a:\n    b: "unclosed\n' }]);
  assert.equal(idx.languages.dockerfile, 1);
  assert.equal(idx.skipped.length, 1);
  assert.match(idx.skipped[0].reason, /not closed/);
});
