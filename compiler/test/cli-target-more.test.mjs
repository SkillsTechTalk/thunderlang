import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { emitGoModule, runGoTarget, goAvailable } from '../src/target-go.mjs';
import { emitRustModule, runRustTarget, rustAvailable } from '../src/target-rust.mjs';
import { emitKotlinModule, runKotlinTarget, kotlinAvailable } from '../src/target-kotlin.mjs';
import { emitScalaModule, runScalaTarget, scalaAvailable } from '../src/target-scala.mjs';
import { emitElixirModule, runElixirTarget, elixirAvailable } from '../src/target-elixir.mjs';

// Live compile+run is opt-in: it needs the Go/Rust/Kotlin/Scala/Elixir toolchains and is
// unverifiable in a Node-only CI, so it runs only when a developer sets TL_NATIVE_TARGETS=1.
// Source-shape tests always run.
const NATIVE = process.env.TL_NATIVE_TARGETS === '1';
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-more-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };

const SRC = `mission Enroll
decision CanEnroll
  inputs
    age
    score
    region
  rule adult
    when age >= 18 and score >= 70 and region == US
    return Eligible
  default
    return NotEligible
test CanEnroll
  case adult
    given age 20, score 90, region US
    expect Eligible
  case minor
    given age 10, score 90, region US
    expect NotEligible
target
  Go
  Rust
`;

// Exercises the `in [ .. ]` membership rendering per dialect.
const IN_SRC = `mission Route
decision Pick
  inputs
    region
  rule known
    when region in [US, EU]
    return Yes
  default
    return No
test Pick
  case us
    given region US
    expect Yes
`;

// , source-shape (always run) ,

test('emitted Go is well-formed and typed (float64 for numbers, string for text, == for strings)', () => {
  const go = emitGoModule(parseIntent(SRC));
  assert.match(go, /^package main/);
  assert.match(go, /func CanEnroll\(age float64, score float64, region string\) string/);
  assert.match(go, /region == "US"/);
  assert.match(go, /&&/);
  assert.match(go, /CanEnroll\(20, 90, "US"\)/);
});

test('emitted Go renders `in` as a chained OR of equalities', () => {
  const go = emitGoModule(parseIntent(IN_SRC));
  assert.match(go, /\(region == "US" \|\| region == "EU"\)/);
});

test('emitted Rust is well-formed and typed (f64 for numbers, &str for text, f64 literals)', () => {
  const rust = emitRustModule(parseIntent(SRC));
  assert.match(rust, /fn CanEnroll\(age: f64, score: f64, region: &str\) -> &'static str/);
  assert.match(rust, /region == "US"/);
  assert.match(rust, /18f64/);
  assert.match(rust, /CanEnroll\(20f64, 90f64, "US"\)/);
});

test('emitted Rust renders `in` as slice .contains(&x)', () => {
  const rust = emitRustModule(parseIntent(IN_SRC));
  assert.match(rust, /\["US", "EU"\]\.contains\(&region\)/);
});

test('emitted Kotlin is well-formed and typed (Double for numbers, String for text, Double literals)', () => {
  const kt = emitKotlinModule(parseIntent(SRC));
  assert.match(kt, /fun CanEnroll\(age: Double, score: Double, region: String\): String/);
  assert.match(kt, /region == "US"/);
  assert.match(kt, /18\.0/);
  assert.match(kt, /CanEnroll\(20\.0, 90\.0, "US"\)/);
});

test('emitted Kotlin renders `in` as x in listOf(..)', () => {
  const kt = emitKotlinModule(parseIntent(IN_SRC));
  assert.match(kt, /region in listOf\("US", "EU"\)/);
});

test('emitted Scala is well-formed and typed (Double for numbers, String for text)', () => {
  const scala = emitScalaModule(parseIntent(SRC));
  assert.match(scala, /def CanEnroll\(age: Double, score: Double, region: String\): String/);
  assert.match(scala, /region == "US"/);
  assert.match(scala, /CanEnroll\(20, 90, "US"\)/);
});

test('emitted Scala renders `in` as List(..).contains(x)', () => {
  const scala = emitScalaModule(parseIntent(IN_SRC));
  assert.match(scala, /List\("US", "EU"\)\.contains\(region\)/);
});

test('emitted Elixir is well-formed (lowercased def name, and/or logic, module driver)', () => {
  const ex = emitElixirModule(parseIntent(SRC));
  assert.match(ex, /defmodule ThunderTarget do/);
  assert.match(ex, /def d_CanEnroll\(age, score, region\) do/);
  assert.match(ex, /region == "US"/);
  assert.match(ex, / and /);
  assert.match(ex, /ThunderTarget\.d_CanEnroll\(20, 90, "US"\)/);
});

test('emitted Elixir renders `in` as x in [..]', () => {
  const ex = emitElixirModule(parseIntent(IN_SRC));
  assert.match(ex, /region in \["US", "EU"\]/);
});

// , live compile + execute (opt-in) ,

test('the Go adapter compiles + executes the generated decision', { skip: !(NATIVE && goAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Go toolchain to run' }, () => {
  const out = runGoTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target go runs the tests against generated Go', { skip: !(NATIVE && goAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Go toolchain to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('g.thunder', SRC), '--target', 'go'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('the Rust adapter compiles + executes the generated decision', { skip: !(NATIVE && rustAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Rust toolchain to run' }, () => {
  const out = runRustTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target rust runs the tests against generated Rust', { skip: !(NATIVE && rustAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Rust toolchain to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('r.thunder', SRC), '--target', 'rust'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('the Kotlin adapter compiles + executes the generated decision', { skip: !(NATIVE && kotlinAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Kotlin toolchain to run' }, () => {
  const out = runKotlinTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target kotlin runs the tests against generated Kotlin', { skip: !(NATIVE && kotlinAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Kotlin toolchain to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('k.thunder', SRC), '--target', 'kotlin'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('the Scala adapter compiles + executes the generated decision', { skip: !(NATIVE && scalaAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Scala toolchain to run' }, () => {
  const out = runScalaTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target scala runs the tests against generated Scala', { skip: !(NATIVE && scalaAvailable()) && 'set TL_NATIVE_TARGETS=1 with a Scala toolchain to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('s.thunder', SRC), '--target', 'scala'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('the Elixir adapter compiles + executes the generated decision', { skip: !(NATIVE && elixirAvailable()) && 'set TL_NATIVE_TARGETS=1 with an Elixir runtime to run' }, () => {
  const out = runElixirTarget(parseIntent(SRC));
  assert.equal(out['CanEnroll / adult'], 'Eligible');
  assert.equal(out['CanEnroll / minor'], 'NotEligible');
});

test('thunder test --target elixir runs the tests against generated Elixir', { skip: !(NATIVE && elixirAvailable()) && 'set TL_NATIVE_TARGETS=1 with an Elixir runtime to run' }, () => {
  const res = spawnSync(process.execPath, [CLI, 'test', write('e.thunder', SRC), '--target', 'elixir'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /2\/2 passed \(executed generated code\)/);
});

test('conform --run go|rust|kotlin|scala|elixir stays declared (skips) when toolchains are absent', { skip: (NATIVE) && 'runs only in the toolchain-absent default environment' }, () => {
  const out = JSON.parse(spawnSync(process.execPath, [CLI, 'conform', write('cc.thunder', SRC), '--json', '--run', 'go,rust,kotlin,scala,elixir'], { encoding: 'utf8' }).stdout);
  assert.ok(out.total > 0, 'has cases to conform');
});
