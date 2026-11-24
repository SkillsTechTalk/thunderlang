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
import { READ_LESSONS } from './learn-lessons.mjs';

export const LEARN_SCHEMA = 'thunder-learn-v1';
export { READ_LESSONS };

const squash = (s) => String(s).replace(/[_\s]/g, '').toLowerCase();
const EXT = { python: 'py', typescript: 'ts', javascript: 'js', java: 'java', go: 'go', csharp: 'cs', ruby: 'rb', php: 'php', rust: 'rs', kotlin: 'kt' };
const MODEL_SHOWS = new Set(['thing', 'flow']);

/** What a lesson's quiz checks may look at: only what the compiler produced from the lesson's code. */
function lessonContext(lesson) {
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
 * The tutorial: { schema, languageVersion, lessons }. Each lesson has its idea, a picture to hold in mind, its code
 * (snippet), the Thunder Text the compiler gives for it, quiz questions whose answers the compiler worked out, and
 * open questions to think about (reflect).
 */
export function learnThunder() {
  const lessons = READ_LESSONS.map((lesson) => {
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
      snippet: snippets[0] ? { language: snippets[0].language, code: snippets[0].code } : null,
      snippets,
      thunderText: ctx.text ?? (ctx.texts[0] || null),
      questions,
      reflect: lesson.questions.map((q) => ({ prompt: q.q, answer: q.a })),
    };
  });
  return { schema: LEARN_SCHEMA, languageVersion: COMPILER_VERSION, lessons };
}
