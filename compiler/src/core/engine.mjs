// The Thunder engine: runs Thunder Core directly, with no Python (thunder run --engine thunder).
//
// It runs the SAME checked program the Python target compiles (compileCore -> program + info), so there is one
// meaning of Thunder, not two. The language itself lives in engine-core.mjs (no Node APIs, so it also runs in a
// browser); this file adds what a command line needs: reading files from disk, and a worker thread with a deep stack
// for programs that nest calls deeper than the calling thread allows. compiler/test/core-engine.test.mjs runs every
// Core test program on both engines and compares the output, errors included. A difference is a bug in one of them.
//
// A program that uses a Python module ("Use csv as csv") is not run here: Thunder never imitates a library.

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve as resolvePath, dirname } from 'node:path';
import { ENGINES, pythonModulesUsed, refusalText, runInProcess as runCore, testInProcess as testCore, engineForServing, ThunderErr, PyErr } from './engine-core.mjs';
import { asPyErr, explain, NOT_GIVEN } from './engine-values.mjs';
import { inputValue, dataJson } from './store-format.mjs';

export { ENGINES, pythonModulesUsed, refusalText, ThunderErr, PyErr };

/** Files a program reads come from disk, relative to the folder it runs in. */
const readText = (path, cwd) => readFileSync(resolvePath(cwd, path), 'utf8');

/**
 * Stored lists (Store … as a list of …) live in files under the folder the program runs in (data/<name>.json).
 * A save writes a new file next to the old one and then renames it, so a file is never left half written.
 */
export function nodeStore(cwd) {
  return {
    load(file) { try { return readFileSync(resolvePath(cwd, file), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    save(file, text) {
      const path = resolvePath(cwd, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.saving`, text);
      renameSync(`${path}.saving`, path);
    },
  };
}

// A call to another service (the answer from GET "…") waits for its answer, as every step of a program does: Node's
// fetch runs in a child process and the engine reads what it printed. The same as compiled TypeScript.
const FETCH = "let d='';process.stdin.on('data',(c)=>d+=c).on('end',async()=>{const q=JSON.parse(d);try{const r=await fetch(q.url,{method:q.method,headers:q.body==null?{accept:'application/json'}:{accept:'application/json','content-type':'application/json'},body:q.body??undefined,signal:AbortSignal.timeout(30000)});process.stdout.write(JSON.stringify({status:r.status,text:await r.text()}))}catch(e){process.stdout.write(JSON.stringify({error:String(e.cause?.code??e.cause?.message??e.message),name:e.name}))}})";
export function nodeHttp(method, url, body) {
  const r = spawnSync(process.execPath, ['-e', FETCH], { input: JSON.stringify({ method, url, body }), encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return { error: 'no answer' }; }
}

/**
 * Run a program with the Thunder engine. `entry` is a compileCore result. Returns { status, stdout, stderr }, the way
 * `python main.py` would end: status 0, or 1 after an error reported in Thunder words. On this thread first (fast, no
 * worker); only a program that nests calls deeper than this thread's stack allows is run again on a worker with a
 * deep stack. Running again is safe: the engine only collects output and reads.
 */
export function runWithEngine({ entry, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed([entry]);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const r = runCore({ entry, cwd, deeper: true, readText, store: nodeStore(cwd), http: nodeHttp });
  return r.needsDeeperStack ? runSync({ entry, cwd }) : r;
}

/** The same, on the calling thread only. */
export function runInProcess({ entry, cwd = process.cwd(), deeper = false } = {}) { return runCore({ entry, cwd, deeper, readText, store: nodeStore(cwd), http: nodeHttp }); }

/** Run every Test block, the way run_tests.py does: one line per test, then the totals. */
export function testWithEngine({ results, cwd = process.cwd() } = {}) {
  const uses = pythonModulesUsed(results);
  if (uses.length) return { status: 2, stdout: '', stderr: `${refusalText(uses)}\n`, refused: uses };
  const r = testCore({ results, cwd, deeper: true, readText, http: nodeHttp });
  return r.needsDeeperStack ? runSync({ results, cwd, tests: true }) : r;
}

/** The same, on the calling thread only. */
export function testInProcess({ results, cwd = process.cwd(), deeper = false } = {}) { return testCore({ results, cwd, deeper, readText, http: nodeHttp }); }

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


const kindName = { whole: 'a whole number', number: 'a number', money: 'money', text: 'text', bool: 'yes or no', date: 'a date' };

/**
 * thunder run --engine thunder for a program with endpoints: run its main part, then answer requests on this machine,
 * one at a time, until stopped (Ctrl+C). The same answers, words, and statuses as compiled Python and TypeScript.
 * Gives back a status only when it could not start.
 */
export function serveWithEngine({ entry, cwd = process.cwd() } = {}) {
  const ready = engineForServing({ entry, cwd, readText, store: nodeStore(cwd), http: nodeHttp });
  if (!ready.eng) return ready;
  const { eng, mod } = ready;
  if (ready.stdout) process.stdout.write(ready.stdout);
  const own = (s) => !entry.info.imported?.has(s);
  const routes = (entry.info.endpoints ?? []).filter(own).map((f) => {
    const fromPath = new Set(f.endpoint.segments.filter((g) => g.param).map((g) => g.param));
    return { f, method: f.endpoint.method, path: f.endpoint.path, parts: f.endpoint.path.split('/').filter(Boolean), inputs: f.params.map((p) => ({ text: p.text, py: p.py, type: p.type, path: fromPath.has(p.name), dflt: !!p.dflt })) };
  });
  const host = process.env.THUNDER_HOST || '127.0.0.1';
  const port = Number(process.env.THUNDER_PORT || 8080);
  const match = (parts, got) => {
    if (parts.length !== got.length) return null;
    const found = {};
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/^\{(.+)\}$/);
      if (m) found[m[1].trim().toLowerCase()] = decodeURIComponent(got[i]);
      else if (parts[i] !== got[i]) return null;
    }
    return found;
  };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const flush = () => { if (eng.out.length) { process.stdout.write(eng.out.join('')); eng.out = []; } };
      const send = (status, value, plain = false) => {
        let data;
        if (plain) data = JSON.stringify(value);
        else { try { data = dataJson(value); } catch (e) { status = 500; data = JSON.stringify({ problem: explain(asPyErr(e)) }); } }
        flush();
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data) });
        res.end(data);
        process.stdout.write(`${req.method} ${req.url} -> ${status}\n`);
      };
      const problem = (status, text) => send(status, { problem: text }, true);
      const url = new URL(req.url, 'http://localhost');
      const got = url.pathname.split('/').filter(Boolean);
      const query = Object.fromEntries(url.searchParams);
      let chosen = null;
      const methods = [];
      for (const r of routes) {
        const found = match(r.parts, got);
        if (!found) continue;
        methods.push(r.method);
        if (r.method === req.method) chosen = { r, found };
      }
      if (!chosen) return methods.length ? problem(405, `${url.pathname} answers only ${methods.join(', ')}.`) : problem(404, `Nothing here answers ${req.method} ${url.pathname}.`);
      const { r, found } = chosen;
      let body = {};
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try { body = JSON.parse(raw); } catch { return problem(400, "The request's body is not JSON Thunder can read."); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return problem(400, "The request's body should be a JSON object, written { … }.");
      }
      const args = [];
      try {
        for (const inp of r.inputs) {
          const key = inp.text.toLowerCase();
          const where = `"${inp.text}"`;
          if (inp.path) args.push(inputValue(found[key], inp.type, where, true));
          else if (key in query || (inp.py && inp.py in query)) args.push(inputValue(key in query ? query[key] : query[inp.py], inp.type, where, true));
          else if (inp.text in body || key in body || (inp.py && inp.py in body)) args.push(inputValue(inp.text in body ? body[inp.text] : key in body ? body[key] : body[inp.py], inp.type, where, false));
          else if (inp.dflt) args.push(NOT_GIVEN);
          else if (inp.type.k === 'optional') args.push(null);
          else return problem(400, `${r.method} ${r.path} needs ${inp.text} (${kindName[inp.type.k] ?? inp.type.k}).`);
        }
      } catch (e) { return problem(400, explain(asPyErr(e))); }
      let answer;
      try { answer = eng.answer(mod, r.f, args); } catch (e0) {
        const e = asPyErr(e0);
        if (e.pyType === 'Stop') return problem(e.status ?? 400, explain(e));
        if (e.pyType === 'RuleBroken') return problem(422, explain(e));
        flush();
        process.stderr.write(`${eng.describeError(e)}\n`);
        return problem(500, explain(e));
      }
      try { eng.saveStores(mod); } catch (e0) { const e = asPyErr(e0); process.stderr.write(`${eng.describeError(e)}\n`); return problem(500, explain(e)); }
      return send(answer.status, answer.value);
    });
  });
  server.listen(port, host, () => {
    process.stdout.write(`Thunder is answering on http://${host}:${port}\n${routes.map((r) => `  ${r.method} ${r.path}\n`).join('')}Press Ctrl+C to stop.\n`);
  });
  process.on('SIGINT', () => { process.stdout.write('Stopped answering.\n'); server.close(); process.exit(0); });
  return null;
}
