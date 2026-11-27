// The Thunder playground's work, in plain JavaScript so it runs the same in the browser worker and in tests:
// run a program, record how it ran, run its tests, and call one of its functions with values a person types.
// Everything runs on the Thunder engine; nothing is sent anywhere.

import { compileCore } from "../../../compiler/src/core/index.mjs";
import { runInProcess, recordedRun, testInProcess } from "../../../compiler/src/core/engine-core.mjs";

const FILE = "main.thunder";

/** Problems in a program, as lines a person reads: { line, message, hint }. Empty when it compiles. */
export function problemsOf(source) {
  const r = compileCore(source, { file: FILE });
  return r.ok ? [] : r.diagnostics.filter((d) => d.severity !== "warning").map((d) => ({ line: d.line ?? null, message: d.message, hint: d.hint ?? null, code: d.code }));
}

/** The functions a program defines, with their inputs: [{ name, inputs: [{ name, kind }] }]. */
export function functionsOf(source) {
  const r = compileCore(source, { file: FILE });
  if (!r.ok) return [];
  const kindOf = (t) => (!t ? null : t.k === "whole" ? "whole number" : t.k === "bool" ? "yes/no" : t.k === "list" ? "list" : t.k === "record" ? t.text ?? t.name : t.k);
  return r.info.funcs.map((f) => ({ name: f.text, line: f.line, inputs: (f.params ?? []).map((p) => ({ name: p.text, kind: kindOf(p.type) })) }));
}

/**
 * The program's definitions only (functions, records, kept values, Use lines), without the steps that run at the
 * top, so calling one function does not also print everything the program prints.
 */
export function definitionsOnly(source) {
  const lines = source.split("\n");
  const blocks = [];
  for (const line of lines) {
    if (line.trim() && !/^\s/.test(line)) blocks.push([line]);
    else if (blocks.length) blocks[blocks.length - 1].push(line);
  }
  const keep = (b) => /^(to\s.+:\s*$|an?\s.+\shas:\s*$|keep\s|use\s|#)/i.test(b[0].trim());
  return blocks.filter(keep).map((b) => b.join("\n")).join("\n");
}

/** Call `fn` with the values a person typed (each written the Thunder way: 100, $5, "text", yes, [1, 2]). */
export function tryCall(source, fn, values) {
  if (problemsOf(source).length) return { ok: false, error: "Fix the problems in the program first." };
  const empty = values.findIndex((v) => !String(v).trim());
  if (empty >= 0) return { ok: false, error: "Give every input a value." };
  const args = values.length === 0 ? "" : values.length === 1 ? ` with ${values[0]}` : ` with ${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
  const driver = `${definitionsOnly(source)}\n\nsay ${fn}${args}\n`;
  const r = compileCore(driver, { file: FILE });
  if (!r.ok) {
    const d = r.diagnostics.find((x) => x.severity !== "warning");
    return { ok: false, error: `That value is not one Thunder can read: ${d?.message ?? "check how it is written"}`, hint: "Numbers as 100 or 2.5, money as $5, text in quotes, yes or no, lists as [1, 2]." };
  }
  const out = runInProcess({ entry: r, cwd: "." });
  if (out.status !== 0) return { ok: false, error: (out.stderr || "It stopped.").trim().replace(/^main\.thunder, line \d+: /, "") };
  return { ok: true, value: out.stdout.trimEnd() };
}

/** Run the program: { status, stdout, stderr }. */
export function runProgram(source) {
  return runInProcess({ entry: compileCore(source, { file: FILE }), cwd: "." });
}

/** Run every Test block: { passed, failed, tests: [{ title, line, ok, why }] }, or { none: true }. */
export function testProgram(source) {
  const r = compileCore(source, { file: FILE });
  if (r.ok && !r.info.tests.length) return { none: true };
  const out = testInProcess({ results: [{ ...r, file: FILE, module: "main", kind: "src" }], cwd: "." });
  if (out.notCompiled) return { notCompiled: true, stderr: out.stderr };
  const tests = [];
  const lines = out.stdout.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(PASS|FAIL) {2}(.+) \(main\.thunder, line (\d+)\)$/.exec(lines[i]);
    if (!m) continue;
    const why = m[1] === "FAIL" ? (lines[i + 1] ?? "").trim().replace(/^main\.thunder, /, "") : null;
    tests.push({ title: m[2], line: Number(m[3]), ok: m[1] === "PASS", why });
  }
  return { passed: tests.filter((t) => t.ok).length, failed: tests.filter((t) => !t.ok).length, tests };
}

/** Record how the program ran, step by step: [{ n, line, code, says, printed }], with what it printed and any error. */
export function stepsOf(source) {
  const r = compileCore(source, { file: FILE });
  const rec = recordedRun({ entry: r, cwd: "." });
  const lines = source.split("\n");
  const steps = (rec.steps ?? []).filter((s) => s.file === FILE).map((s) => {
    const changes = (s.changes ?? []).map((c) => (c.before === undefined ? `${c.name} is now ${c.after}` : `${c.name}: ${c.before} → ${c.after}`));
    const says = changes.length ? changes.join(", ") : s.kind === "say" ? `says ${s.said ?? ""}`.trim() : s.kind === "call" ? `calls ${s.fn ?? "a function"}` : s.kind === "give" ? `gives ${s.value ?? "an answer"}` : "";
    return { n: s.n, line: s.line, code: (lines[s.line - 1] ?? "").trim(), depth: s.depth ?? 1, fn: s.fn ?? null, says, printed: s.printed ?? null };
  });
  return { steps, stdout: rec.stdout ?? "", stderr: rec.stderr ?? "", truncated: !!rec.truncated, status: rec.status };
}

/** A program as a link part (#code=…) and back, so a program can be shared by its link alone. */
export function encodeProgram(source) {
  const bytes = new TextEncoder().encode(source);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeProgram(code) {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return null; }
}
