#!/usr/bin/env node
// Performance test: read a whole (large) repository with the Thunder compiler and time each stage.
// Usage: node scripts/perf.mjs <folder> [--max-files n] [--json]
// Stages: collect files, read every file (readCode), build the model (thunderModel), write the app as Thunder Text
// (thunderizeFiles), and compare the app with itself (sameMeaning). Reports time, throughput, peak memory, and the
// slowest files, so a regression shows up as a number.
import { collectReadableFiles } from '../src/read-repo-fs.mjs';
import { readFiles } from '../src/read-repo.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { readCode } from '../src/read.mjs';
import { thunderModel } from '../src/model.mjs';
import { thunderizeFiles } from '../src/thunderize.mjs';
import { sameMeaning } from '../src/same.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const maxAt = args.indexOf('--max-files');
const maxFiles = maxAt >= 0 ? Number(args[maxAt + 1]) : 100000;
if (!dir) { console.error('Use node scripts/perf.mjs <folder> [--max-files n] [--json]'); process.exit(2); }

// Peak memory is the operating system's high-water mark for this process (a timer cannot fire during synchronous work).
// (macOS reports it in bytes, Linux and Windows in kilobytes.)
const peakBytes = () => process.resourceUsage().maxRSS * (process.platform === 'darwin' ? 1 : 1024);
const time = (fn) => { const t = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - t) / 1e6]; };

const [files, tCollect] = time(() => collectReadableFiles(dir, { maxFiles }));
const loaded = files.filter((f) => f.source);
const bytes = loaded.reduce((n, f) => n + f.source.length, 0);
const lines = loaded.reduce((n, f) => n + f.source.split('\n').length, 0);

// Read every file on its own, timing each, so the slowest files are visible.
let functions = 0, decisions = 0, errors = 0;
const perFile = [];
const [, tRead] = time(() => {
  for (const f of loaded) {
    const language = readableLanguage(f.path, f.source);
    const t = process.hrtime.bigint();
    try {
      const r = readCode(f.source, { language, file: f.path });
      for (const it of r.items) { if (it.kind === 'function') functions++; if (it.kind === 'decision') decisions++; }
    } catch { errors++; }
    perFile.push([f.path, Number(process.hrtime.bigint() - t) / 1e6, f.source.length]);
  }
});
// Each stage's result is reduced to its counts before the next stage, as a real caller would let it go.
const [modelCounts, tModel] = time(() => { const m = thunderModel(loaded); return { things: m.things.length, members: m.members.length, unknowns: m.unknowns.length }; });
const [thunderTextFiles, tThunderize] = time(() => thunderizeFiles(loaded, { name: dir }).files.length);
const [sameVerdict, tSame] = time(() => sameMeaning(loaded, loaded).verdict);
// The same three stages after reading every file once (readFiles): each stage reuses the readings.
const [onceTotal, tOnce] = time(() => {
  const read = readFiles(loaded);
  thunderModel(read); thunderizeFiles(read, { name: dir }); sameMeaning(read, read);
  return true;
});

const langs = {};
for (const f of loaded) { const l = readableLanguage(f.path); langs[l] = (langs[l] || 0) + 1; }
const slowest = perFile.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, ms, size]) => ({ file: p, ms: Math.round(ms), kb: Math.round(size / 1024) }));
const report = {
  repo: dir, files: loaded.length, skipped: files.length - loaded.length, languages: langs, megabytes: +(bytes / 1048576).toFixed(1), lines,
  functions, decisions, readerErrors: errors, ...modelCounts,
  ms: { collect: Math.round(tCollect), read: Math.round(tRead), model: Math.round(tModel), thunderize: Math.round(tThunderize), same: Math.round(tSame), allStagesEachReading: Math.round(tModel + tThunderize + tSame), allStagesReadOnce: Math.round(tOnce) },
  readThroughput: { filesPerSecond: Math.round(loaded.length / (tRead / 1000)), linesPerSecond: Math.round(lines / (tRead / 1000)) },
  peakMemoryMB: Math.round(peakBytes() / 1048576), sameVerdict, thunderTextFiles, slowest,
};
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  const s = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
  console.log(`${dir}: ${report.files} files (${Object.entries(langs).map(([l, n]) => `${n} ${l}`).join(', ')}), ${report.megabytes} MB, ${lines.toLocaleString()} lines`);
  console.log(`  read ${functions.toLocaleString()} functions, ${decisions} decisions, ${errors} reader errors; model: ${report.things} things, ${report.members} members`);
  console.log(`  collect ${s(report.ms.collect)} · read ${s(report.ms.read)} (${report.readThroughput.filesPerSecond} files/s, ${report.readThroughput.linesPerSecond.toLocaleString()} lines/s) · model ${s(report.ms.model)} · thunderize ${s(report.ms.thunderize)} · same ${s(report.ms.same)}`);
  console.log(`  model + Thunder Text + compare: ${s(report.ms.allStagesEachReading)} when each stage reads; ${s(report.ms.allStagesReadOnce)} reading once (readFiles)`);
  console.log(`  peak memory ${report.peakMemoryMB} MB · slowest files: ${slowest.map((x) => `${x.file} ${x.ms} ms (${x.kb} KB)`).join('; ')}`);
}
