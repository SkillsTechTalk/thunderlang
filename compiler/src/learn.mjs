// @skillstech/thunderlang/learn: the Thunder tutorial as data, shipped with every release so a course built from it
// always matches the language it teaches. Every quiz answer is worked out here by the compiler, from the lesson's
// own code; if the compiler's answer is not what the lesson expects, building the lessons throws, so a release can
// never carry a lesson that disagrees with the compiler. Browser-safe.
import { readCode } from './read.mjs';
import { thunderText, visualFor, SYMBOLS } from './visual.mjs';
import { thunderModel, modelText } from './model.mjs';
import { plainFromReading, explainPlain } from './plain-contract.mjs';
import { sameMeaning } from './same.mjs';
import { COMPILER_VERSION } from './emit.mjs';
import { READ_LESSONS, WRITE_LESSONS } from './learn-lessons.mjs';
import { compileCore } from './core/index.mjs';
import { runInProcess, testInProcess } from './core/engine-core.mjs';
import { pythonToCore } from './core/from-python.mjs';
import { explainRun } from './why.mjs';
import { accessFlow } from './flow/access.mjs';
import { writeRuleAcross } from './write-across.mjs';
import { assemblePassport, checkPassport } from './passport.mjs';

export const LEARN_SCHEMA = 'thunder-learn-v1';
export { READ_LESSONS, WRITE_LESSONS };

const squash = (s) => String(s).replace(/[_\s]/g, '').toLowerCase();
const EXT = { python: 'py', typescript: 'ts', javascript: 'js', java: 'java', go: 'go', csharp: 'cs', ruby: 'rb', php: 'php', rust: 'rs', kotlin: 'kt' };
const MODEL_SHOWS = new Set(['thing', 'flow']);

/** What a lesson's quiz checks may look at: only what the compiler produced from the lesson's code. */
function lessonContext(lesson) {
  if (lesson.part === 'write') return writeContext(lesson);
  const files = lesson.files.map((f, i) => ({ path: `lesson${i ? i + 1 : ''}.${EXT[f.language] ?? 'txt'}`, source: f.code }));
  const readings = lesson.files.map((f) => readCode(f.code, { language: f.language }));
  const all = readings.flatMap((r) => r.items);
  const focus = lesson.focus ? readings.map((r) => r.items.find((i) => squash(i.name) === squash(lesson.focus))) : [];
  const model = MODEL_SHOWS.has(lesson.show) && files.length ? thunderModel(files) : null;
  const target = model && (lesson.show === 'thing' ? model.things.find((t) => t.name === lesson.focus) : model.members.find((m) => m.name === lesson.focus));
  /** Run a rule (the focus, or one named) on facts given by their readable labels; gives back the answer. */
  const run = (facts, name) => {
    const item = name ? all.find((i) => squash(i.name) === squash(name)) : focus[0];
    const plain = plainFromReading(item);
    const values = {};
    for (const input of plain.inputs) {
      const key = Object.keys(facts).find((k) => squash(k) === squash(String(input.label).replace(/^the /, '')));
      if (key === undefined) throw new Error(`no value given for ${input.label}`);
      values[input.id] = facts[key];
    }
    return explainPlain(plain, values).outcome;
  };
  return {
    item: focus[0], items: focus, all, model, target,
    text: model && target ? modelText(model, target.id) : undefined,
    texts: focus.map((i) => (i ? thunderText(i) : '')),
    visuals: focus.map((i) => (i ? visualFor(i) : null)),
    symbols: SYMBOLS, visualFor, run,
    same: (oldFiles, newFiles) => sameMeaning(oldFiles, newFiles).verdict,
  };
}

/**
 * What a write lesson's quiz may look at: its Thunder program compiled and run on the Thunder engine (no Python, so
 * this works in a browser too), Python read as Core, or an agent's record read by thunder why.
 */
function writeContext(lesson) {
  const compile = (source, file = 'main.thunder') => compileCore(source, { file });
  const runCore = (source) => {
    const r = compile(source);
    if (!r.ok) return { ok: false, diagnostics: r.diagnostics, stdout: '', stderr: r.diagnostics.map((d) => `${d.code} ${d.message}`).join('\n'), status: 1 };
    return { ok: true, diagnostics: [], ...runInProcess({ entry: r }) };
  };
  const testCore = (source) => {
    const r = compile(source);
    if (!r.ok) throw new Error(r.diagnostics.map((d) => `${d.code} line ${d.line}: ${d.message}`).join('; '));
    return testInProcess({ results: [{ ...r, kind: 'src' }] });
  };
  const file = lesson.files[0];
  const ctx = { compile, runCore, testCore };
  if (file?.language === 'thunder' && !/^\s*Test "/m.test(file.code)) {
    ctx.core = runCore(file.code);
    if (!ctx.core.ok || ctx.core.status !== 0) throw new Error(`the lesson's program does not run cleanly: ${ctx.core.stderr}`);
  }
  if (lesson.asCore) ctx.asCore = pythonToCore(file.code);
  if (lesson.why) ctx.why = explainRun(file.code);
  // Changing real code: each tool run on the lesson's files, labeled "part/file".
  const parted = lesson.files.map((f) => { const i = f.label.indexOf('/'); return { part: f.label.slice(0, i), path: f.label.slice(i + 1), source: f.code }; });
  if (lesson.access) {
    ctx.accessOf = (which) => accessFlow((which ?? lesson.files.map((_, i) => i)).map((i) => ({ path: lesson.files[i].label, source: lesson.files[i].code })));
    ctx.access = ctx.accessOf();
  }
  if (lesson.across) ctx.across = writeRuleAcross(parted, lesson.across);
  if (lesson.passport) {
    const parts = [...new Set(parted.map((f) => f.part))].map((name) => ({ name, files: parted.filter((f) => f.part === name).map(({ path, source }) => ({ path, source })) }));
    const runs = lesson.passport.map((r) => ({ cwd: r.part, ...r }));
    ctx.passport = assemblePassport({ parts, runs, builtAt: '2026-01-01T00:00:00.000Z', thunder: COMPILER_VERSION });
    /** Check the passport after some files changed: { "part/file": new source }. */
    ctx.passportCheck = (changed) => checkPassport(ctx.passport, { read: (part, file) => changed[`${part}/${file}`] ?? parted.find((f) => f.part === part && f.path === file)?.source });
  }
  return ctx;
}

/**
 * The tutorial: { schema, languageVersion, lessons }. Each lesson has its idea, a picture to hold in mind, its code
 * (snippet), the Thunder Text the compiler gives for it, quiz questions whose answers the compiler worked out, and
 * open questions to think about (reflect).
 */
export function learnThunder() {
  const lessons = [...READ_LESSONS, ...WRITE_LESSONS].map((lesson) => {
    const ctx = lessonContext(lesson);
    const questions = (lesson.quiz || []).map((q, i) => {
      const where = `Lesson "${lesson.slug}", question ${i + 1}`;
      let answer;
      try { answer = String(q.check(ctx)); } catch (e) { throw new Error(`${where}: the compiler could not answer it (${e.message}).`); }
      if (!q.choices.includes(answer)) throw new Error(`${where}: the compiler's answer "${answer}" is not one of the choices.`);
      if (answer !== q.expect) throw new Error(`${where}: the lesson expects "${q.expect}", but the compiler says "${answer}". Update the lesson to match the language.`);
      return { prompt: q.prompt, choices: [...q.choices], answer, explain: q.explain };
    });
    const snippets = lesson.files.map((f) => ({ language: f.language, label: f.label, code: f.code }));
    return {
      slug: lesson.slug, title: lesson.title, idea: lesson.idea, picture: lesson.picture, part: lesson.part ?? 'read',
      ...(lesson.concept ? { concept: lesson.concept } : {}),
      ...(lesson.commands ? { commands: [...lesson.commands] } : {}),
      snippet: snippets[0] ? { language: snippets[0].language, code: snippets[0].code } : null,
      snippets,
      thunderText: ctx.text ?? (ctx.texts?.[0] || null),
      // What the lesson's program prints, worked out by running it (write lessons).
      ...(ctx.core ? { output: ctx.core.stdout } : {}),
      questions,
      reflect: lesson.questions.map((q) => ({ prompt: q.q, answer: q.a })),
    };
  });
  return { schema: LEARN_SCHEMA, languageVersion: COMPILER_VERSION, lessons };
}
