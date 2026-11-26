// The Thunder engine: runs Thunder Core directly, with no Python (thunder run --engine thunder).
//
// It runs the SAME checked program the Python target compiles (compileCore -> program + info), so there is one
// meaning of Thunder, not two. The language itself lives in engine-core.mjs (no Node APIs, so it also runs in a
// browser); this file adds what a command line needs: reading files from disk, and a worker thread with a deep stack
// so calls nest as deep as they do in Python. compiler/test/core-engine.test.mjs runs every Core test program on both
// engines and compares the output, errors included. A difference is a bug in one of them.
//
// A program that uses a Python module ("Use csv as csv") is not run here: Thunder never imitates a library.

import { readFileSync } from 'node:fs';
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { resolve as resolvePath } from 'node:path';
import { ENGINES, pythonModulesUsed, refusalText, runInProcess as runCore, testInProcess as testCore, ThunderErr, PyErr } from './engine-core.mjs';

export { ENGINES, pythonModulesUsed, refusalText, ThunderErr, PyErr };

/** Files a program reads come from disk, relative to the folder it runs in. */
const readText = (path, cwd) => readFileSync(resolvePath(cwd, path), 'utf8');

/**
 * Run a program with the Thunder engine. `results` are compileCore results (each with .file, and in a project
 * .kind 'src' | 'test'); `entry` is the one to run. Returns { status, stdout, stderr }, the way `python main.py`
 * would end: status 0, or 1 after an error reported in Thunder words.
 */
export function runWithEngine({ entry, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  return runSync({ entry, cwd });
}

/** The same, on the calling thread (its stack allows only a few hundred nested calls). */
export function runInProcess({ entry, cwd = process.cwd() } = {}) { return runCore({ entry, cwd, readText }); }

/** Run every Test block, the way run_tests.py does: one line per test, then the totals. */
export function testWithEngine({ results, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed(results);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  return runSync({ results, cwd, tests: true });
}

/** The same, on the calling thread. */
export function testInProcess({ results, cwd = process.cwd() } = {}) { return testCore({ results, cwd, readText }); }

function runSync(job) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./engine-worker.mjs', import.meta.url), {
    workerData: { shared, port: port2, job }, transferList: [port2], resourceLimits: { stackSizeMb: 256 }, stdout: false, stderr: false,
  });
  try {
    while (Atomics.wait(shared, 0, 0, 1000) === 'timed-out') { if (!worker.threadId) break; }
    const msg = receiveMessageOnPort(port1);
    return msg ? msg.message : { status: 70, stdout: '', stderr: 'The Thunder engine stopped without an answer.\n' };
  } finally {
    worker.terminate();
    port1.close();
  }
}

