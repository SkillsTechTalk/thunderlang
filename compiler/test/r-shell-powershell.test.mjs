// R, Bash/POSIX shell, and PowerShell: each reads into the same items as every other language (functions with
// steps, decisions with rules, Things, errors, tests), in plain words, and never claims more than the code says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode, detectLanguage, READ_LANGUAGES } from '../src/read.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { languageForFile } from '../src/lift.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

const item = (r, name) => r.items.find((i) => i.name === name);
const flat = (steps) => (steps || []).flatMap((s) => [s, ...flat(s.children), ...flat(s.otherwise), ...(s.handlers || []).flatMap((h) => flat(h.steps)), ...flat(s.always?.steps)]);
const says = (it) => flat(it.steps).map((s) => s.says);

test('the three languages are read, by file name, by shebang, and from pasted text', () => {
  for (const l of ['r', 'shell', 'powershell']) assert.ok(READ_LANGUAGES.includes(l), l);
  assert.equal(languageForFile('analysis.R'), 'r');
  assert.equal(languageForFile('deploy.sh'), 'shell');
  assert.equal(languageForFile('profile.zsh'), 'shell');
  assert.equal(languageForFile('Build.ps1'), 'powershell');
  assert.equal(languageForFile('Tools.psm1'), 'powershell');
  assert.equal(readableLanguage('scripts/release.bash'), 'shell');
  assert.equal(readableLanguage('bin2/deploy', '#!/usr/bin/env bash\necho hi\n'), 'shell', 'no extension, shell shebang');
  assert.equal(readableLanguage('bin2/deploy', '#!/usr/bin/env python3\nprint(1)\n'), null, 'a Python shebang is not shell');
  assert.equal(readableLanguage('bin2/deploy'), null, 'without the source, an extensionless file is not guessed');
  assert.equal(detectLanguage('#!/bin/sh\nset -e\nmake\n'), 'shell');
  assert.equal(detectLanguage('x <- function(a) {\n  a + 1\n}\n'), 'r');
  assert.equal(detectLanguage('function Get-Thing {\n  param([string]$Name)\n  Write-Host $Name\n}\n'), 'powershell');
  assert.equal(detectLanguage('deploy', 'deploy'), 'typescript', 'an extensionless name with no shebang falls back as before');
  assert.equal(readCode('#!/bin/bash\necho hi\n', { file: 'deploy' }).language, 'shell');
  assert.equal(readCode('echo hi', { language: 'bash' }).language, 'shell');
  assert.equal(readCode('Write-Host hi', { language: 'pwsh' }).language, 'powershell');
});

const SH = `#!/usr/bin/env bash
# Rolls the web app out.
set -euo pipefail
trap cleanup EXIT

cleanup() { rm -rf "$TMP_DIR"; }

deploy() {
  local env="\${1:-staging}"
  if [[ -z "$env" ]]; then
    echo "No environment given" >&2
    exit 2
  elif [[ "$env" == "prod" && ! -f "$HOME/.kube/prod" ]]; then
    echo "missing prod config" >&2
    return 1
  elif [ "$COUNT" -ge 3 ]; then
    echo "too many"
  else
    echo "Deploying to $env"
  fi
  case "$env" in
    prod|production) kubectl apply -f k8s/prod.yaml -n web ;;
    *) helm upgrade --install web ./chart -n "$env" ;;
  esac
  for f in config/*.yaml; do cp "$f" /tmp/; done
  while read -r host; do ssh "$host" uptime; done < hosts.txt
}

command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
az group create --name my-rg --location eastus
VERSION=$(git describe --tags)
export IMAGE="registry.example.com/web:$VERSION"
docker build -t "$IMAGE" . && docker push "$IMAGE"
curl -fsSL -X POST https://hooks.example.com/deployed -d '{}'
cat > notes.txt <<EOF
it's done (really)
EOF
deploy "$@"
`;

test('shell: tests read as sentences, exits as Stops with the message echoed before them', () => {
  const r = readCode(SH, { file: 'deploy.sh' });
  assert.equal(r.language, 'shell');
  const d = item(r, 'deploy');
  assert.deepEqual(d.inputs.map((p) => p.name), ['env']);
  const s = says(d);
  assert.ok(s.includes('Takes env from the first input ("staging" when it is empty or not given)'));
  assert.ok(s.includes('If env is empty'));
  assert.ok(s.includes('Fails with exit code 2: "No environment given"'), 'the echo >&2 is the Stop\'s message');
  assert.ok(s.includes('If env is "prod" and there is no file "«HOME»/.kube/prod"'));
  assert.ok(s.includes('Fails with return code 1: "missing prod config"'));
  assert.ok(s.includes('If the count setting is at least 3') || s.includes('If count is at least 3'), s.join('\n'));
  assert.ok(s.includes('Chooses by env'));
  assert.ok(s.includes('When it is "prod" or "production"'));
  assert.ok(s.includes('Otherwise'));
  assert.ok(s.includes('Applies the Kubernetes settings in "k8s/prod.yaml" in the namespace "web"'));
  assert.ok(s.includes('Installs or upgrades the Helm release "web" from the chart "./chart" in the namespace env'));
  assert.ok(s.includes('For each f in the files matching config/*.yaml'));
  assert.ok(s.includes('For each line (as host) in "hosts.txt"'));
  assert.equal(d.completeness.level, 'explained', JSON.stringify(d.completeness));
  // The elif chain is one question with its other sides, not separate ifs.
  const q = d.steps.find((x) => x.kind === 'branch');
  assert.ok(q.otherwise[0].elseIf && q.otherwise[0].otherwise[0].elseIf && q.otherwise[0].otherwise[0].otherwise.length);
});

test('shell: the script itself is one item named after the file, with set -e, trap, and well-known tools', () => {
  const r = readCode(SH, { file: 'deploy.sh' });
  const top = item(r, 'deploy.sh');
  assert.ok(top.topLevel);
  assert.equal(top.headline, 'Runs deploy.sh, from top to bottom.');
  assert.equal(top.doc, 'Rolls the web app out.');
  assert.equal(top.anchor.coverage, 1, JSON.stringify(top.anchor));
  const s = says(top);
  for (const want of [
    'Stops at the first command that fails, treats a missing setting as a mistake, and counts a failure anywhere in a pipe as a failure',
    'At the end, even if something fails, runs cleanup',
    'If "docker" is not installed',
    'Fails with exit code 1: "docker is required"',
    'Creates the Azure resource group "my-rg" in "eastus"',
    'Sets version to the output of looking up the latest version tag',
    'Sets image to "registry.example.com/web:«VERSION»" and shares it with the programs it runs',
    'If building the Docker image image works',
    'Uploads the Docker image image',
    'Sends a POST request to "https://hooks.example.com/deployed"',
    'Writes the text written below (1 line) to "notes.txt"',
    'Runs deploy with all the inputs',
  ]) assert.ok(s.includes(want), `${want}\n--- got:\n${s.join('\n')}`);
  // The trap's command is a function in this file: the flow links to it.
  const m = thunderModel([{ path: 'deploy.sh', source: SH }]);
  assert.equal(m.things.length, 0, 'shell has no classes');
  assert.equal(m.unknowns.length, 0, JSON.stringify(m.unknowns));
  const script = m.members.find((x) => x.name === 'deploy.sh');
  assert.ok(m.links.some((l) => l.from === script.id && l.to === m.members.find((x) => x.name === 'deploy').id), 'the script uses deploy');
  assert.ok(r.items.some((i) => i.kind === 'error' && i.name === 'docker is required'));
});

test('shell: an unknown command keeps its code; a helper that always exits makes each call a Stop', () => {
  const r = readCode('die() { echo "$*" >&2; exit 3; }\nfoo() {\n  frobnicate --hard\n  die "cannot frob"\n}\nbar() { :; }\n', { language: 'shell' });
  const s = says(item(r, 'foo'));
  assert.deepEqual(s, ['Runs frobnicate', 'Fails with exit code 3: "cannot frob"']);
  assert.equal(flat(item(r, 'foo').steps)[0].code, 'frobnicate --hard');
  assert.deepEqual(says(item(r, 'bar')), ['Does nothing']);
});

const PS = `$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
Chooses which ring a release goes to first.
#>
function Get-ReleaseRing {
    param([int]$Users, [bool]$Pilot)
    if ($Users -ge 1000 -and -not $Pilot) { 'Broad' }
    elseif ($Users -ge 100) { 'Early' }
    else { 'Canary' }
}

function Get-Size([string]$Kind) {
    switch ($Kind) {
        'small' { 'S' }
        'large' { 'L' }
        default { 'M' }
    }
}

function Publish-Release {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Version,
        [int]$Retries = 3
    )
    if (-not (Test-Path ".\\release\\$Version")) {
        throw "No build for version $Version"
    }
    $groups = Get-AzResourceGroup
    New-Item -ItemType Directory -Path ".\\out" -Force | Out-Null
    foreach ($file in $files) {
        Write-Host "Copying $($file.Name)"
    }
    Get-ChildItem .\\logs -Filter *.log | Where-Object { $_.Length -gt 1MB } | Remove-Item
    try {
        Invoke-RestMethod -Method Post -Uri 'https://deploy.example.com/releases' -Body @{ version = $Version }
    } catch [System.Net.WebException] {
        Write-Error "Could not reach the server"
    } finally {
        Remove-Item -Path ".\\tmp" -Recurse -Force
    }
    if ($Retries -lt 1 -or $Version -like '0.*') { return }
    git tag "v$Version"
}

class Library {
    [int]$MaxBooks = 3
    [string[]]$Overflow = @()
    [int] LateFee([int]$daysLate) {
        if ($daysLate -le 7) { return 1 }
        return 5
    }
}

enum Status { OnShelf; Borrowed }

Describe 'release' {
    It 'picks Broad for big audiences' { Get-ReleaseRing -Users 5000 | Should -Be 'Broad' }
}
`;

test('PowerShell: decisions from if/elseif/else and switch, with param() inputs', () => {
  const r = readCode(PS, { file: 'Release.ps1' });
  assert.equal(r.language, 'powershell');
  const ring = item(r, 'Get-ReleaseRing');
  assert.equal(ring.kind, 'decision');
  assert.equal(ring.doc, 'Chooses which ring a release goes to first.');
  assert.deepEqual(ring.inputs.map((p) => [p.name, p.type]), [['Users', 'number'], ['Pilot', 'boolean']]);
  assert.deepEqual(ring.rules.map((x) => [x.when, x.result]), [['Users >= 1000 and not Pilot', 'Broad'], ['Users >= 100', 'Early']]);
  assert.equal(ring.otherwise.result, 'Canary');
  const size = item(r, 'Get-Size');
  assert.equal(size.kind, 'decision');
  assert.deepEqual(size.rules.map((x) => [x.when, x.result]), [['Kind == "small"', 'S'], ['Kind == "large"', 'L']]);
  assert.equal(size.otherwise.result, 'M');
  assert.equal(item(r, 'LateFee').kind, 'decision');
  assert.ok(r.items.some((i) => i.kind === 'test' && i.name === 'picks Broad for big audiences'));
});

test('PowerShell: cmdlets by Verb-Noun, operators in words, throw and Write-Error as Stops, try/catch/finally', () => {
  const r = readCode(PS, { file: 'Release.ps1' });
  const p = item(r, 'Publish-Release');
  assert.deepEqual(p.inputs.map((x) => [x.name, x.type]), [['Version', 'string'], ['Retries', 'number']]);
  const s = says(p);
  for (const want of [
    'If not: ".\\release\\«Version»" exists',
    'Fails with an error: "No build for version «Version»"',
    'Gets the Azure resource groups, keeping the result as groups',
    'Makes a folder ".\\out"',
    'For each file in files',
    'Shows a message: "Copying «$($file.Name)»"',
    'Gets the files and folders in ".\\logs" matching "*.log", keeps only those where length is more than 1MB, then removes them',
    'Sends a POST request to "https://deploy.example.com/releases" with a table of version',
    'Fails with an error: "Could not reach the server"',
    'Removes ".\\tmp" and everything in it',
    'If retries is less than 1 or version matches "0.*"',
    'Tags this version as "v«Version»"',
  ]) assert.ok(s.includes(want), `${want}\n--- got:\n${s.join('\n')}`);
  const t = flat(p.steps).find((x) => x.kind === 'try');
  assert.equal(t.handlers[0].says, 'If WebException goes wrong');
  assert.ok(t.always.steps.length === 1);
  assert.equal(p.completeness.level, 'explained', JSON.stringify(p.completeness));
});

test('PowerShell: Write-Error only stops when errors are set to stop', () => {
  const r = readCode('function F { Write-Error "bad thing" }\n', { language: 'powershell' });
  assert.deepEqual(says(item(r, 'F')), ['Reports an error: "bad thing" and carries on']);
  const r2 = readCode('function F { Write-Error "bad thing" -ErrorAction Stop }\n', { language: 'powershell' });
  assert.deepEqual(says(item(r2, 'F')), ['Fails with an error: "bad thing"']);
});

test('PowerShell: classes are Things with typed properties and defaults; enums are Choices', () => {
  const m = thunderModel([{ path: 'Release.ps1', source: PS }]);
  const lib = m.things.find((t) => t.name === 'Library');
  assert.equal(lib.kind, 'thing');
  assert.deepEqual(lib.knows.map((k) => [k.label, k.kind, k.start]), [['max books', 'a number', '3 at first'], ['overflow', 'a list of words', 'empty at first']]);
  assert.deepEqual(m.things.find((t) => t.name === 'Status').choices, ['on shelf', 'borrowed']);
  assert.equal(m.unknowns.length, 0, JSON.stringify(m.unknowns));
});

const R = `library(dplyr)

#' Decide how fast an order ships.
shipping_speed <- function(total, member = FALSE) {
  if (total >= 100 && member) {
    "Express"
  } else if (total >= 50) {
    "Standard"
  } else {
    "Economy"
  }
}

size_label = function(n) {
  switch(n, small = "S", medium = , large = "L", "M")
}

late_fee <- function(days) {
  if (days <= 7) return("Small")
  "Big"
}

region_sales <- function(path) {
  if (!file.exists(path)) {
    stop("No orders file at ", path)
  }
  orders <- read.csv(path)
  big <- orders |>
    filter(total > 100, status == "paid") |>
    group_by(region) |>
    summarise(n = n(), revenue = sum(total)) |>
    arrange(desc(revenue))
  for (i in seq_len(nrow(big))) {
    message("Region ", big$region[i])
  }
  saved <- tryCatch({
    write.csv(big, "big.csv")
    TRUE
  }, error = function(e) {
    warning("Could not save: ", conditionMessage(e))
    FALSE
  }, finally = {
    message("done")
  })
  big
}

#* Return the open orders
#* @get /orders
function(status = "open") {
  orders <- region_sales("orders.csv")
  orders[orders$status == status, ]
}

test_that("members get express", {
  expect_equal(shipping_speed(200, TRUE), "Express")
})
`;

test('R: decisions from if/else chains, return() guards, and switch() (with fall-through)', () => {
  const r = readCode(R, { file: 'orders.R' });
  assert.equal(r.language, 'r');
  const ship = item(r, 'shipping_speed');
  assert.equal(ship.kind, 'decision');
  assert.equal(ship.doc, 'Decide how fast an order ships.');
  assert.deepEqual(ship.rules.map((x) => [x.when, x.result]), [['total >= 100 and member', 'Express'], ['total >= 50', 'Standard']]);
  assert.equal(ship.otherwise.result, 'Economy');
  const size = item(r, 'size_label');
  assert.deepEqual(size.rules.map((x) => [x.when, x.result]), [['n == "small"', 'S'], ['n == "medium"', 'L'], ['n == "large"', 'L']]);
  assert.equal(size.otherwise.result, 'M');
  assert.deepEqual([item(r, 'late_fee').rules[0].result, item(r, 'late_fee').otherwise.result], ['Small', 'Big']);
  assert.ok(r.items.some((i) => i.kind === 'test' && i.name === 'members get express'));
  assert.ok(r.items.some((i) => i.kind === 'error' && i.name === 'No orders file at «path»'));
});

test('R: pipelines one verb at a time, stop() as a Stop, tryCatch as handlers and always, the last value given back', () => {
  const r = readCode(R, { file: 'orders.R' });
  const f = item(r, 'region_sales');
  const s = says(f);
  for (const want of [
    'If not: the file path exists',
    'Fails with an error: "No orders file at «path»"',
    'Reads the CSV file path, keeping it as orders',
    'Works out big, step by step',
    'Keeps only the rows where total is more than 100 and status is "paid"',
    'Groups the rows by region',
    'Sums up the rows: n is how many rows, revenue is the total of total',
    'Sorts the rows by revenue, highest first',
    'Counts i from 1 to the number of rows in big',
    'Tries these steps and handles any error (the answer becomes saved)',
    'Saves big to the CSV file "big.csv"',
    'Sets saved to yes',
    'Warns: "Could not save: «conditionMessage(e)»"',
    'Sets saved to no',
    'Writes a message: "done"',
    'Returns big',
  ]) assert.ok(s.includes(want), `${want}\n--- got:\n${s.join('\n')}`);
  const t = f.steps.find((x) => x.kind === 'try');
  assert.equal(t.handlers[0].says, 'If anything goes wrong');
  assert.ok(t.always);
  assert.equal(f.completeness.level, 'explained', JSON.stringify(f.completeness));
});

test('R: a plumber annotation makes an action with its route', () => {
  const r = readCode(R, { file: 'orders.R' });
  const api = item(r, 'GET /orders');
  assert.deepEqual(api.route, { method: 'GET', path: '/orders' });
  assert.equal(api.doc, 'Return the open orders');
  assert.ok(says(api).includes("Returns the rows of orders where the orders' status is status"), says(api).join('\n'));
  const m = thunderModel([{ path: 'orders.R', source: R }]);
  assert.equal(m.members.find((x) => x.name === 'GET /orders').kind, 'action');
  assert.ok(/When someone calls GET \/orders/.test(modelText(m, m.members.find((x) => x.name === 'GET /orders').id)));
});

test('reading stays fast on long comment and whitespace runs, and odd input never throws', () => {
  const pad = `${'#'.repeat(20000)}\n${' '.repeat(50000)}\n`;
  for (const [lang, body] of [['shell', 'f() {\n  echo "x"\n}\n'], ['powershell', 'function F { "x" }\n'], ['r', 'f <- function() {\n  "x"\n}\n']]) {
    const t = Date.now();
    readCode(pad.repeat(3) + body.repeat(400), { language: lang });
    assert.ok(Date.now() - t < 3000, `${lang} took ${Date.now() - t} ms`);
    for (const odd of ['"unterminated', "f() { echo 'x", 'function {', '<#', '$(', 'if (', '}}}', 'case x in', 'x <- function(', '@"\nno end']) {
      assert.doesNotThrow(() => readCode(odd, { language: lang }), `${lang}: ${odd}`);
    }
  }
});
