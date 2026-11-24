// GitHub Actions workflows in Thunder (spec section 12): each job an Action with a "When" badge, steps in words,
// permissions as who-can-what, secrets named only, and facts a tool can weigh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readCode, detectLanguage } from '../src/read.mjs';
import { readableFile } from '../src/read-repo.mjs';
import { readWorkflow, triggerWords } from '../src/infra-gha.mjs';
import { cronWords, conditionQuestion, commandSays, shellSteps } from '../src/infra-words.mjs';
import { parseYaml } from '../src/yaml.mjs';
import { thunderModel, readLevel, modelText } from '../src/model.mjs';
import { visualFor, DOES, SYMBOLS } from '../src/visual.mjs';

const release = readFileSync(new URL('./fixtures/infra/release.yml', import.meta.url), 'utf8');
const ci = readFileSync(new URL('./fixtures/infra/ci.yml', import.meta.url), 'utf8');
const flat = (steps) => steps.flatMap((s) => [s, ...flat(s.children ?? []), ...flat(s.otherwise ?? [])]);
const says = (steps) => flat(steps).map((s) => s.says);
const when = (y) => triggerWords(parseYaml(`on:\n${y}`).entries[0].value).when;

test('only .github/workflows/*.yml|yaml are workflows; pasted workflows are detected', () => {
  assert.equal(readableFile('.github/workflows/ci.yml'), 'github-actions');
  assert.equal(readableFile('sub/.github/workflows/deploy.yaml'), 'github-actions');
  for (const p of ['.github/dependabot.yml', 'workflows/ci.yml', 'config.yml', '.github/workflows/README.md']) assert.equal(readableFile(p), null, p);
  assert.equal(detectLanguage(ci), 'github-actions');
  assert.equal(detectLanguage('', '.github/workflows/release.yml'), 'github-actions');
});

test('triggers in words, joined with "or"', () => {
  assert.equal(when('  push:\n    branches: [main]'), 'When someone pushes to main');
  assert.equal(when('  pull_request:\n    types: [opened]'), 'When a pull request is opened');
  assert.equal(when('  workflow_dispatch:'), 'When someone starts it by hand');
  assert.equal(when('  release:\n    types: [published]'), 'When a release is published');
  assert.equal(when("  schedule:\n    - cron: '0 2 * * *'"), 'On a schedule: every day at 02:00 UTC');
  assert.equal(when("  schedule:\n    - cron: '0 2 1-7 * *'"), 'On a schedule (cron 0 2 1-7 * *)');
  assert.equal(when('  push:\n    tags: [\'v*\']'), 'When someone pushes a tag like v*');
  assert.equal(when('  pull_request:\n  push:\n    branches: [main]'), 'When a pull request is opened or updated, or someone pushes to main');
  assert.equal(triggerWords(parseYaml('on: [push, workflow_dispatch]').entries[0].value).when, 'When someone pushes or someone starts it by hand');
  assert.equal(cronWords('30 6 * * 1-5'), 'every weekday (Monday to Friday) at 06:30 UTC');
  assert.equal(cronWords('0 9 * * 1'), 'every Monday at 09:00 UTC');
  assert.equal(cronWords('*/15 * * * *'), 'every 15 minutes');
  assert.equal(cronWords('0 0 1 * *'), 'on day 1 of every month at 00:00 UTC');
});

test("ThunderLang's own release.yml: two jobs, each an Action with a When badge, read step by step", () => {
  const r = readCode(release, { file: '.github/workflows/release.yml' });
  assert.equal(r.language, 'github-actions');
  assert.equal(r.purpose, 'Release');
  assert.deepEqual(r.items.map((i) => [i.name, i.label]), [['npm', 'npm (@skillstech/thunderlang)'], ['vscode', 'VS Code Marketplace (openthunder.thunderlang)']]);
  const npm = r.items[0];
  assert.equal(npm.when, 'When someone pushes to main and changes compiler/package.json or editors/vscode/package.json, or someone starts it by hand');
  assert.deepEqual(npm.route, { method: 'When', path: npm.when.slice(5) });
  assert.equal(visualFor(npm).badge.kind, 'when');
  assert.equal(visualFor(npm).title, npm.when);
  assert.deepEqual(says(npm.steps), [
    'Runs on ubuntu-latest',
    'Gets the code',
    'Sets up Node 24, ready to publish to npm',
    'Is this version already on npm?:',
    'Works out V: reads the version from package.json',
    'Saves version for later steps',
    'Does this work: looks up @skillstech/thunderlang@$V on npm?',
    'Saves publish for later steps',
    'Writes a note in the log: "@skillstech/thunderlang $V is already on npm. Nothing to publish."',
    'Saves publish for later steps',
    "Is the check step's publish true?",
    'Installs what it needs (npm ci)',
    'Publish (builds and runs the full test suite first):',
    'Installs npm@^11.5.1 for the whole computer',
    'Publishes the package to npm',
    'Writes a note in the log: "Published @skillstech/thunderlang (worked out when it runs) to npm."',
  ]);
  // Each command points at its own line in the run block.
  const lines = release.split('\n');
  for (const s of flat(npm.steps).filter((x) => /^(Works out V|Publishes the package)/.test(x.says))) assert.match(lines[s.line - 1], /V=|npm publish/);
  // Two steps that share `if:` share one question.
  const q = npm.steps.find((s) => s.kind === 'branch');
  assert.equal(q.children.length, 2);
  assert.deepEqual(r.items[1].steps.at(-1).children.map((c) => c.says), ['Installs what it needs (npm ci)', 'Publish:']);
  assert.deepEqual(flat(r.items[1].steps).find((s) => /^Publishes the extension/.test(s.says)).says, 'Publishes the extension to the VS Code Marketplace');
});

test('release.yml permissions read as who can do what; nothing there is wide', () => {
  const r = readWorkflow(release, 'release.yml');
  assert.deepEqual(r.permissions.map((p) => [p.who, p.can, p.on, p.wide]), [
    ['This workflow', 'read', 'the code', false],
    ['This workflow', 'ask for', 'an identity token (to sign in to other services without a stored password)', false],
  ]);
  assert.equal(r.permissions[0].says, 'This workflow can read the code');
  assert.ok(r.permissions.every((p) => p.id && p.file === 'release.yml' && p.line));
  assert.deepEqual(r.facts.map((f) => f.kind), ['action-pinned-by-tag', 'action-pinned-by-tag', 'action-pinned-by-tag', 'action-pinned-by-tag']);
  assert.ok(r.facts.every((f) => f.firstParty === true));
});

test('a CI workflow: matrix as a repeat, needs as order, job if as a question, environment, continue-on-error, exit 1 as a Stop', () => {
  const r = readWorkflow(ci, '.github/workflows/ci.yml');
  const [testJob, image, deploy] = r.items;
  assert.equal(testJob.label, 'Test', 'a name worked out when it runs gives way to the job id');
  assert.equal(testJob.steps[0].kind, 'loop');
  assert.equal(testJob.steps[0].says, 'For each combination of node (20 and 22) and os (ubuntu-latest and windows-latest)');
  assert.deepEqual(says(testJob.steps[0].children), ['Runs on the os for this run', 'Gets the code', 'Sets up Node (the node for this run), reusing saved downloads', 'Installs what it needs (npm ci)', 'Runs the tests', 'Checks the code style (npm run lint) (a failure here does not stop the job)']);
  assert.equal(image.steps[0].says, 'After the Test job finishes');
  assert.match(says(image.steps).join('\n'), /Signs in to \(worked out when it runs\) \(uses the secret GITHUB_TOKEN\)/);
  assert.match(says(image.steps).join('\n'), /Builds and pushes the image ghcr\.io\/example\/shop:latest/);
  assert.equal(deploy.steps[0].says, 'After the Test job and the Image job finish');
  const gate = deploy.steps[1];
  assert.equal(gate.kind, 'branch');
  assert.equal(gate.says, 'Is the branch main, and was it started by a push?');
  assert.equal(gate.children[0].says, "Deploys to the production environment (it may need someone's approval first)");
  const all = flat(deploy.steps);
  assert.ok(all.some((s) => s.kind === 'fail' && s.line === 81), 'exit 1 is a Stop');
  assert.ok(all.some((s) => s.kind === 'branch' && s.says === 'Is APP_URL empty?'));
  assert.ok(all.some((s) => s.says === 'Did an earlier step fail?'));
  assert.ok(all.some((s) => s.says === 'Uses some-org/notify-action (uses the secret SLACK_WEBHOOK) (even if an earlier step failed)'));
  assert.deepEqual(r.links.map((l) => [l.from, l.to]), [['image:43', 'test:24'], ['deploy:62', 'test:24'], ['deploy:62', 'image:43']]);
});

test('permissions at workflow and job level; write-all is called wide', () => {
  const r = readWorkflow(ci, 'ci.yml');
  assert.deepEqual(r.permissions.map((p) => p.says), ['This workflow can read the code', 'The Image job can read the code', 'The Image job can write packages', 'The Deploy job can change everything in the repository (wide)']);
  const wide = r.permissions.find((p) => p.wide);
  assert.ok(wide.why);
  assert.equal(r.facts.find((f) => f.kind === 'write-all-permissions').line, wide.line);
  const all = readWorkflow('on: push\npermissions: write-all\njobs:\n  a:\n    runs-on: x\n    permissions: {}\n    steps: [{ run: ls }]\n', 'w.yml');
  assert.deepEqual(all.permissions.map((p) => [p.says, p.wide]), [['This workflow can change everything in the repository (wide)', true], ['The A job cannot use anything in the repository', false]]);
});

test('secrets are named and never shown; settings say where each value comes from', () => {
  const r = readWorkflow(ci, 'ci.yml');
  assert.deepEqual(r.settings.map((s) => [s.name, s.source, s.secret]), [
    ['dry_run', 'parameter', false], ['GITHUB_TOKEN', 'secret', true], ['AZURE_CREDENTIALS', 'secret', true], ['SLACK_WEBHOOK', 'secret', true],
    ['REGISTRY', 'literal', false], ['IMAGE_NAME', 'computed', false], ['API_TOKEN', 'literal', true],
  ]);
  assert.equal(r.settings.find((s) => s.name === 'IMAGE_NAME').computed, true);
  const out = JSON.stringify(r);
  assert.ok(!out.includes('hunter2'), 'a secret-looking literal is never repeated');
  assert.deepEqual(r.facts.filter((f) => f.kind === 'secret-in-plain-env').map((f) => f.line), [76]);
});

test('facts: tags instead of commits (GitHub-made actions marked), and untrusted triggers that use secrets', () => {
  const r = readWorkflow(ci, 'ci.yml');
  const pins = r.facts.filter((f) => f.kind === 'action-pinned-by-tag');
  assert.deepEqual(pins.map((f) => [f.line, f.firstParty]), [[32, true], [33, true], [51, false], [56, false], [71, false], [87, false]]);
  assert.ok(!pins.some((f) => f.line === 50), 'a 40-character commit is pinned');
  const prt = readWorkflow(`on: pull_request_target
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: npm test
        env:
          TOKEN: \${{ secrets.DEPLOY_TOKEN }}
`, 'prt.yml');
  const f = prt.facts.find((x) => x.kind === 'untrusted-trigger-with-secrets');
  assert.equal(f.line, 1);
  assert.match(f.says, /pull_request_target/);
  assert.match(f.says, /pull request's own code/);
  assert.match(f.says, /DEPLOY_TOKEN/);
  assert.ok(!readWorkflow('on: pull_request\njobs:\n  a:\n    runs-on: x\n    steps: [{ run: "echo ${{ secrets.X }}" }]\n').facts.some((x) => x.kind === 'untrusted-trigger-with-secrets'));
});

test('if: conditions as questions; always() is not a question', () => {
  assert.equal(conditionQuestion("github.ref == 'refs/heads/main'").question, 'Is the branch main?');
  assert.equal(conditionQuestion("${{ github.event_name != 'pull_request' }}").question, 'Was it not started by a pull request?');
  assert.equal(conditionQuestion('failure()').question, 'Did an earlier step fail?');
  assert.equal(conditionQuestion('always()').always, true);
  assert.equal(conditionQuestion("contains(github.event.head_commit.message, '[skip]')").question, "Does the event's head commit message contain [skip]?");
  assert.equal(conditionQuestion("startsWith(github.ref, 'refs/tags/')").question, 'Is it a tag?');
  assert.equal(conditionQuestion("matrix.os == 'ubuntu-latest' && !cancelled()").evenAfterFailure, true);
  const odd = conditionQuestion('github.event.x ~= 3');
  assert.equal(odd.known, false);
  assert.match(odd.question, /`github\.event\.x ~= 3`/);
});

test('well-known actions and commands in words; others kept as they are', () => {
  const r = readWorkflow(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - uses: actions/setup-java@v4
        with: { java-version: 21, distribution: temurin }
      - uses: actions/cache@v4
        with: { path: ~/.npm, key: x }
      - uses: actions/upload-artifact@v4
        with: { name: site, path: dist }
      - uses: docker/build-push-action@v6
      - uses: acme/custom-thing@v1
      - uses: ./.github/actions/local
      - run: |
          docker build -t shop .
          docker push shop
          kubectl apply -f k8s/
          helm upgrade --install shop ./chart
          az webapp deploy --name shop
          aws s3 sync dist s3://bucket
          terraform apply -auto-approve
          ./scripts/release.sh
          mystery-tool --go
`);
  assert.deepEqual(says(r.items[0].steps).slice(1), [
    'Sets up Python 3.12', 'Sets up Java 21 (temurin)', 'Reuses saved files (~/.npm)', 'Saves dist as "site" for later jobs and people to download', 'Builds the image',
    'Uses acme/custom-thing', 'Uses the action in .github/actions/local',
    'Builds the image shop', 'Pushes the image shop to its registry', 'Applies k8s/ to the Kubernetes cluster', 'Installs or upgrades the Helm release shop',
    'Deploys the app to Azure', 'Copies files to or from Amazon S3', 'Applies the Terraform changes', 'Runs scripts/release.sh', 'Runs `mystery-tool --go`',
  ]);
  assert.equal(commandSays('npm run build').says, 'Builds it');
  assert.equal(commandSays('npm test').says, 'Runs the tests');
  assert.equal(commandSays('npm publish --access public').says, 'Publishes the package to npm');
});

test('a reusable workflow job, a job-level if, and a file that is not a workflow', () => {
  const r = readWorkflow('on: workflow_call\njobs:\n  call:\n    if: github.repository == \'a/b\'\n    uses: ./.github/workflows/build.yml\n    secrets: inherit\n', 'w.yml');
  assert.equal(r.items[0].when, 'When another workflow calls it');
  assert.equal(r.items[0].steps[0].says, 'Is the repository a/b?');
  assert.equal(r.items[0].steps[0].children[0].says, "Runs the workflow ./.github/workflows/build.yml (and gives it all of this workflow's secrets)");
  assert.throws(() => readWorkflow('name: x\nfoo: 1\n'), /no jobs/);
});

test('in the model: pipeline members with when, delivery category, permissions and settings in Big Picture and Text', () => {
  const model = thunderModel([{ path: '.github/workflows/release.yml', source: release }, { path: '.github/workflows/ci.yml', source: ci }], { name: 'thunderlang' });
  assert.deepEqual(model.files.map((f) => [f.path, f.category, f.purpose]), [['.github/workflows/release.yml', 'delivery', 'Release'], ['.github/workflows/ci.yml', 'delivery', 'CI and deploy']]);
  const p = model.members.filter((m) => m.kind === 'pipeline');
  assert.equal(p.length, 5);
  assert.ok(p.every((m) => m.when && m.route === m.when));
  assert.equal(p[0].flow.nodes[0].does, 'when');
  assert.ok(DOES.when.mark);
  assert.ok(SYMBOLS.resource.paths.length && SYMBOLS.permission.paths.length);
  assert.ok(model.links.some((l) => l.kind === 'uses' && l.file === '.github/workflows/ci.yml' && l.line === 63));
  const bp = readLevel(model, 'big-picture');
  assert.equal(bp.permissions.length, 6);
  assert.ok(bp.settings.length > 3);
  assert.ok(bp.loose.every((x) => x.symbol === 'action' && x.route));
  const deploy = p.find((m) => m.name === 'deploy');
  const details = readLevel(model, 'details', deploy.id);
  assert.deepEqual(details.stops.map((s) => [s.error, s.line]), [['Fails: the step stops with exit code 1', 81]]);
  const text = modelText(model, p[0].id);
  assert.match(text, /^npm \(@skillstech\/thunderlang\)\n {2}When someone pushes to main/);
  assert.doesNotMatch(text, /\?\?/);
  const all = readLevel(model, 'text').text;
  assert.match(all, /\nPermissions\n {2}This workflow can read the code {2}\(line 24\)/);
  assert.match(all, /Setting GITHUB_TOKEN: a secret \(only its name is shown\)/);
});

test('a workflow Thunder cannot read is listed as not read, with the reason, in the model', () => {
  const model = thunderModel([{ path: '.github/workflows/bad.yml', source: 'on: push\njobs:\n  a:\n    steps:\n      - run: "oops\n' }]);
  assert.equal(model.files[0].category, 'delivery');
  assert.match(model.files[0].skipped, /not closed/);
  assert.match(model.unknowns[0].why, /Could not read this file/);
});

test('shell shapes in run blocks: heredocs, quotes across lines, groups, case, functions, tests with && and ||', () => {
  const st = shellSteps(`cat >> "$GITHUB_STEP_SUMMARY" <<EOF
Open the report
1. Follow the link
EOF
python -c '
import sys
print(sys.argv)
'
jq -r .x file || { echo "bad json"; exit 1; }
[ -f out.txt ] && rm out.txt
case "$MODE" in
  fast) make quick ;;
  *) make all ;;
esac
retry() {
  echo "trying"
}
for f in a b; do
  [ "$f" = b ] && continue
done
V=$(printf '%s' \\
  "x")
npm --prefix compiler test
sudo apt-get -y install jq`, 10);
  assert.deepEqual(st.map((s) => [s.kind, s.says, s.line]), [
    ['call', "Adds text to the run's summary", 10],
    ['call', 'Runs a small Python script', 14],
    ['branch', 'Does this fail: runs `jq -r .x file`?', 18],
    ['branch', 'Does the file out.txt exist?', 19],
    ['call', 'Chooses what to do by MODE', 20],
    ['call', 'Defines the command retry, for later lines to use', 24],
    ['loop', 'For each f in a b', 27],
    ['set', 'Works out V: the text "%s x"', 30],
    ['call', 'Runs the tests', 32],
    ['call', 'Installs jq', 33],
  ]);
  assert.deepEqual(st[2].children.map((c) => c.kind), ['call', 'fail']);
  assert.equal(st[3].children[0].says, 'Removes out.txt');
  assert.ok(!flat(st).some((s) => /Open the report|Follow the link|print\(sys/.test(s.says)), 'heredoc and script bodies are text, not commands');
  assert.equal(st[6].children[0].says, 'Is f b?');
  assert.equal(st[6].children[0].children[0].says, 'Skips to the next one');
});

test('conditions that compare a yes-or-no value read as a plain question', () => {
  assert.equal(conditionQuestion('github.event.pull_request.draft == false').question, 'Is the pull request not a draft?');
  assert.equal(conditionQuestion("github.base_ref == 'main' || github.ref_name == 'main'").question, 'Is the branch it will be merged into main, or is the branch or tag name main?');
});
