// Faithfulness, PowerShell: each case is a minimal copy of a sample graded false (D) or misleading (C) in a hand
// review of posh-git and PSScriptAnalyzer; the sample is named in the test. Quoted text keeps every literal
// character and shows inserted values as «…» placeholders (docs/spec.md, "Text with values inside").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

const ps = (body) => thunderText('a.ps1', body);

test('posh-git Write-GitStatus: `!$a -or !$b` keeps its polarity; the Stop is on the side where the code returns', () => {
  const t = ps('function Write-GitStatus {\n  param($Status)\n  $s = $global:GitPromptSettings\n  if (!$Status -or !$s) {\n    return\n  }\n  "done"\n}\n');
  assert.equal(sideOf(t, /Ask: .*status is not set or s is not set\?/i, /Stops here/), 'yes', t);
  assert.doesNotMatch(t, /Is status set or s is not set/);
});

test('posh-git Write-GitStatus / gitIndex: a command argument is everything up to the next space; `> $null` is not an argument', () => {
  const t = ps('function gitFiles($filter, $files) { $files }\nfunction gitIndex($GitStatus, $filter) {\n  gitFiles $filter $GitStatus.Index\n}\nfunction W {\n  $sb | Write-Prompt $s.PathStatusSeparator.Expand() > $null\n  $sb | Write-Prompt $stashText -Color $s.StashColor > $null\n}\n');
  assert.match(t, /Runs git files with filter and the git status' index/);
  assert.doesNotMatch(t, /a value|then and/);
  assert.match(t, /Passes sb into writing the prompt the result of expand on the s's path status separator/);
  assert.match(t, /writing the prompt stash text with color set to the s's stash color/);
});

test('posh-git profile.example: Test-Path on an assignment is not "Null exists"; a piped value is what the command loads', () => {
  const t = ps("if ($m) {\n  $m | Import-Module\n}\nelseif (Test-Path -LiteralPath ($modulePath = Join-Path $root 'posh-git.psd1')) {\n  Import-Module $modulePath\n}\nif ($args[0] -ne 'choco') { Write-Warning 'x' }\n");
  assert.doesNotMatch(t, /Null exists/i);
  assert.match(t, /Ask: `Test-Path -LiteralPath \(\$modulePath = Join-Path/);
  assert.match(t, /Loads the module m\b/);
  assert.doesNotMatch(t, /loads the module \?/);
  assert.match(t, /Is the first input "choco"\?/);
});

test('posh-git AnsiUtils / PSScriptAnalyzer build.psm1: `$_` in a catch is the error, never the text "it" or ""', () => {
  const t = ps('function F {\n  try { Get-Thing }\n  catch {\n    Write-Debug $_\n    Write-Verbose -Verbose "$_"\n  }\n}\n');
  assert.match(t, /Writes a debugging message: the error/);
  assert.match(t, /Writes a detailed message: the error/);
  assert.doesNotMatch(t, /message: "it"|message: ""/);
});

test('posh-git gitRemoteBranches / gitRemoteUniqueBranches: spaces inside quoted text are kept; a ForEach-Object in the middle runs before the later commands', () => {
  const t = ps('function gitRemoteBranches($remote, $filter) {\n  git branch --no-color -r |\n    Where-Object { $_ -like "  $remote/$filter*" } |\n    ForEach-Object { $_ -replace "  $remote/","" } |\n    Sort-Object\n}\n');
  assert.match(t, /matches " {2}«remote»\/«filter»\*"/);
  assert.match(t, /Lists the branches, keeps only those where it matches " {2}«remote»\/«filter»\*", runs the steps below on each one, then sorts them/);
  assert.doesNotMatch(t, /For each result of/);
  const u = ps('function U {\n  git branch -r | Group-Object -NoElement | Where-Object { $_.Count -eq 1 } | Select-Object -ExpandProperty Name\n}\n');
  assert.match(u, /keeps only those where its count is 1, then takes each one's name/);
});

test('posh-git PoshGitTypes: `$this.ForegroundColor` as an argument is the foreground color, not "it"; arguments are not dropped', () => {
  const t = ps('class Cell {\n  [string] ToEscapedString() {\n    $str = ""\n    $seq = Get-ForegroundVirtualTerminalSequence $this.ForegroundColor\n    $str += EscapeAnsiString $seq\n    return $str\n  }\n}\n');
  assert.match(t, /Gets the foreground virtual terminal sequence foreground color, keeping the result as seq/);
  assert.match(t, /Adds the result of running EscapeAnsiString with seq to str/);
});

test('posh-git tgit: `$args[0] = …` sets input 1, not the inputs; `& $path $newArgs` runs that path with its arguments', () => {
  const t = ps('function tgit {\n  $args[0] = $map.Get_Item($args[0])\n  & $Global:Settings.TortoiseGitPath $newArgs\n}\n');
  assert.match(t, /Sets the first input to/);
  assert.doesNotMatch(t, /Sets the inputs to/);
  assert.match(t, /Runs the settings' tortoise git path with new args/);
});

test('posh-git expandGitAlias: a table looked up by a variable keeps the key', () => {
  const t = ps('function F($alias) {\n  $known = $Global:GitTabSettings.KnownAliases[$alias]\n  $known\n}\n');
  assert.match(t, /Sets known to the entry for alias in the git tab settings' known aliases/);
});

test('PSScriptAnalyzer build.psm1: `$x = $list | ForEach-Object { … }` keeps the loop and where its results go', () => {
  const t = ps('function F {\n  $installed = $sdkList | ForEach-Object { $_.Split()[0] }\n  $installed\n}\n');
  assert.match(t, /For each one in sdk list, runs the steps below; the results become installed/);
  assert.doesNotMatch(t, /Sdk list, keeping the result/);
});

test('PSScriptAnalyzer RuleMaker: New-Object on its own line is what the function gives back, with its properties', () => {
  const t = ps("function New-RuleObject {\n  param([string] $Name)\n  New-Object -TypeName 'PSObject' -Property @{\n    Name = $Name\n    SourceFileName = $Name + '.cs'\n  }\n}\n");
  assert.match(t, /Gives back a new PSObject from a table of name and source file name/);
});

test('text with values inside: literal text exactly, each inserted value as «…»', () => {
  const t = ps("function F($version, $x, $a, $b) {\n  $tag = \"v$version\"\n  $e = \"${env:HOME}/x $($x.R);m\"\n  $p = \"it: $_ and $x.Name\"\n  $q = 'it''s $literal'\n  $f = \"{0}/{1,-8} {{x}}\" -f $a, $b.Name\n  $only = \"$version\"\n  $n = \"Consider `$x and `\"y`\"\"\n}\n");
  assert.match(t, /Sets tag to "v«version»"/);
  assert.match(t, /Sets e to "«env:HOME»\/x «\$\(\$x\.R\)»;m"/);
  assert.match(t, /Sets p to "it: «\$_» and «x»\.Name"/);
  assert.match(t, /Sets q to "it''s \$literal"/);
  assert.match(t, /Sets f to "«a»\/«\$b\.Name as \{1,-8\}» \{\{x\}\}"/);
  assert.match(t, /Sets only to version/);
  assert.match(t, /Sets n to "Consider `\$x and `"y`""/);
});

test('the faithfulness gate: a negated group stays one negation; words that cannot keep every operator show the code', () => {
  const t = ps('function F {\n  if (-not ($a -or $b)) { return 1 }\n  if ($x -eq $false) { return 2 }\n  if ($null -ne $y) { return 3 }\n  3\n}\n');
  assert.equal(sideOf(t, /Ask: A is set or b is set\?/, /Gives back 1/), 'no', t);
  assert.match(t, /`\$x -eq \$false`/);
  assert.match(t, /Is y set\?/);
});

test('redirections are not arguments: 2>&1 and 2>$null', () => {
  const t = ps('function F {\n  $sdk = & $script:DotnetExe --list-sdks 2>&1\n  $v = & $script:DotnetExe --version 2>$null\n}\n');
  assert.match(t, /Runs dotnet exe with "--list-sdks", keeping the result as sdk/);
  assert.match(t, /Runs dotnet exe with "--version", keeping the result as v\b/);
});

test('posh-git #12 / #1: `git config name` reads the setting; choco -s takes a source, not a package', () => {
  const t = thunderText('a.ps1', "function Get-Alias($cmd) {\n  git config \"alias.$cmd\"\n  choco install -f -y poshgit -pre --version=$version -s .\n}\n");
  assert.match(t, /Reads the Git setting "alias\.«cmd»"/);
  assert.doesNotMatch(t, /Sets the Git setting/);
  assert.match(t, /Installs "?poshgit"? \(choco\)/);
  assert.doesNotMatch(t, /and "\."/);
});
