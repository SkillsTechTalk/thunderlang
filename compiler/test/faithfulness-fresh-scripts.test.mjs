// Faithfulness for R, shell, and PowerShell: minimal copies of readings graded false (D) in the fresh audit of
// ThunderLang 1.0.3 (ggplot2, usethis, rbenv, Scoop, Pode). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('ggplot2#2 (R): answers that are quoted text keep their case and sign', () => {
  const t = thunderText('a.R', 'show_infinites <- function(x) {\n  if (x > 0) {\n    "`Inf`"\n  } else {\n    "`-Inf`"\n  }\n}\n');
  assert.match(t, /"`Inf`"/);
  assert.match(t, /"`-Inf`"/);
});

test('ggplot2#10 (R): `.stroke` is its own name, not `stroke`', () => {
  const t = thunderText('a.R', 'gg_par <- function(stroke = NULL) {\n  args <- list()\n  args$lwd <- stroke * .stroke / 2\n  args\n}\n');
  assert.match(t, /stroke times \.stroke divided by 2/);
});

test('usethis#10/#11/#14 (R): stop_input_type and ui_abort always stop; they give nothing back', () => {
  const t = thunderText('a.R', 'check_formula <- function(x) {\n  if (is_formula(x)) {\n    return(invisible(NULL))\n  }\n  stop_input_type(x, "a formula")\n}\ncheck_sha <- function(sha) {\n  ui_abort("Internal error.")\n}\n');
  assert.match(t, /Stop: an input-type error \(x is not a formula\)/);
  assert.match(t, /Stop: an error: "Internal error\."/);
  assert.doesNotMatch(t, /Gives back the result of (?:stop input type|ui abort)/);
});

test('rbenv#3 (shell): `[ -d "$path" ]` asks whether path is a folder, not whether it exists', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nf() {\n  if [ -d "$path" ]; then echo x; fi\n}\n');
  assert.match(t, /The folder path exists\?/);
});

test('rbenv#6 (shell): `$( … )` inside a list is one item, not split at its spaces', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nf() {\n  COMPREPLY=( $(compgen -W "$(rbenv commands)" -- "$word") )\n  local arr=( a "b c" )\n}\n');
  assert.doesNotMatch(t, /compge,|"-W"|"commands\)"/);
  assert.match(t, /"a" and "b c"/);
});

test('rbenv#7 (shell): `exec -a NAME prog` runs prog in place of the script; it never runs "-a"', () => {
  const t = thunderText('a.sh', '#!/bin/bash\nif [ "$1" = "--complete" ]; then\n  exec rbenv-shims --short\nfi\nexport PATH="${RBENV_BIN_PATH}:${PATH}"\nexec -a "$RBENV_COMMAND" "$RBENV_COMMAND_PATH" "$@"\n');
  assert.doesNotMatch(t, /Runs -a/);
  assert.match(t, /in place of this script/);
  assert.match(t, /Adds rbenv bin path to the PATH/);
});

test('Scoop#7/#13 (PowerShell): a list is never said with fewer items than it has', () => {
  const t = thunderText('a.ps1', "function F {\n    $ArgList = @('burn', 'extract', $Path, '-out', $DestinationPath, '-outba', \"$DestinationPath\\UX\")\n    Run $ArgList\n}\n");
  assert.match(t, /a list of 7 items/);
});

test('Scoop#9 (PowerShell): a message ends at its closing quote; the next line is its own step', () => {
  const t = thunderText('a.ps1', "Write-Host \"Installed apps$(if($query) { `\" matching '$query'`\"}):\"\n$apps | Where-Object { !$query } | ForEach-Object {\n    $app = $_.name\n}\nexit 0\n");
  assert.doesNotMatch(t, /Shows a message: [^\n]*\$apps/);
  assert.match(t, /finished without errors/);
});

test('Scoop#15 (PowerShell): Where-Object -Match keeps matching items; Measure-Object -Sum adds them up', () => {
  const t = thunderText('a.ps1', 'function cacheremove($app) {\n    $files = @(Get-ChildItem $cachedir | Where-Object -Property Name -Value "^$app#" -Match)\n    $totalLength = ($files | Measure-Object -Property Length -Sum).Sum\n    Write-Host $totalLength\n}\n');
  assert.doesNotMatch(t, /whether|counts them/);
  assert.match(t, /keeps only those whose name matches the pattern/);
  assert.match(t, /total of their length/);
});

test('Pode#8 (PowerShell): a table made with an entry is not "an empty table"', () => {
  const t = thunderText('a.ps1', 'function Merge {\n    $def = @{\n        $typeName = @($Definition)\n    }\n    return $def\n}\n');
  assert.doesNotMatch(t, /empty table/);
});
