// Thunderize: a whole app written in Thunder Text. Every readable file becomes a Thunder Text file beside a mirror of
// its path, and an index (APP.thunder-text) reads the app from the top: areas, files, actions, rules. Browser-safe:
// it takes [{ path, source }] and returns text; the CLI writes the files.
import { readCode } from './read.mjs';
import { readableLanguage, readingOf } from './read-repo.mjs';
import { thunderText, visualFor } from './visual.mjs';

export const THUNDERIZE_SCHEMA = 'thunderize-v1';
export const THUNDER_TEXT_EXT = '.thunder-text';

const LANGUAGE_NAMES = { typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', go: 'Go', rust: 'Rust', csharp: 'C#', java: 'Java', kotlin: 'Kotlin', php: 'PHP', ruby: 'Ruby', sql: 'SQL', c: 'C', cpp: 'C++', swift: 'Swift', r: 'R', shell: 'Shell', powershell: 'PowerShell', dockerfile: 'Dockerfile', 'github-actions': 'GitHub Actions', terraform: 'Terraform', bicep: 'Bicep', kubernetes: 'Kubernetes', 'docker-compose': 'Docker Compose' };

/** One file in Thunder Text: a header, then every action, rule, and function in order, then how it can fail. */
export function thunderizeFile(path, source, language = readableLanguage(path, source), reading = readCode(source, { language, file: path })) {
  const main = reading.items.filter((i) => i.kind === 'decision' || i.kind === 'function');
  const failures = [...new Set(reading.items.filter((i) => i.kind === 'error').map((i) => i.name))];
  const counts = { actions: 0, rules: 0, functions: 0, notReadYet: 0, failures: failures.length };
  const parts = main.map((item) => {
    const v = visualFor(item);
    if (v.element === 'action') counts.actions++;
    else if (v.element === 'decision') counts.rules++;
    else if (v.element === 'not-read') counts.notReadYet++;
    else counts.functions++;
    return `# line ${item.line}${v.line === 'dashed' ? ' · not read yet' : ''}\n${thunderText(item).trimEnd()}`;
  });
  const header = `File ${path} (${LANGUAGE_NAMES[reading.language] || reading.language})\n` +
    `Read from code by the Thunder compiler, no AI. ${summary(counts)}`;
  const footer = failures.length ? `\nCan fail with: ${failures.join(', ')}` : '';
  return { path, language: reading.language, out: `${path}${THUNDER_TEXT_EXT}`, counts, items: main.map((i) => ({ name: i.name, line: i.line, ...pick(visualFor(i)) })), text: `${header}\n\n${parts.join('\n\n')}${footer}\n` };
}

const pick = (v) => ({ element: v.element, title: v.title, ...(v.badge ? { route: v.badge.text } : {}) });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function summary(c) {
  const bits = [c.actions && plural(c.actions, 'action'), c.rules && plural(c.rules, 'rule'), c.functions && plural(c.functions, 'function'), c.notReadYet && `${c.notReadYet} not read yet`].filter(Boolean);
  return bits.length ? `${bits.join(', ')}.` : 'Nothing to read.';
}

/**
 * A whole app in Thunder Text. Returns every file's Thunder Text and an index that reads the app top-down.
 * Files Thunder cannot read (unsupported language, empty, or too large) are listed, never silently dropped.
 */
export function thunderizeFiles(files, { name = 'app' } = {}) {
  const out = [], skipped = [];
  for (const f of files) {
    const language = readableLanguage(f.path, f.source);
    if (!language) { skipped.push({ path: f.path, reason: 'not a language Thunder reads yet' }); continue; }
    if (!f.source) { skipped.push({ path: f.path, reason: f.size ? 'too large to read' : 'empty' }); continue; }
    try { out.push(thunderizeFile(f.path, f.source, language, readingOf(f, language))); }
    catch (e) { skipped.push({ path: f.path, reason: `could not be read: ${e.message}` }); }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  const total = { files: out.length, actions: 0, rules: 0, functions: 0, notReadYet: 0 };
  for (const f of out) for (const k of ['actions', 'rules', 'functions', 'notReadYet']) total[k] += f.counts[k];
  const langs = [...new Set(out.map((f) => LANGUAGE_NAMES[f.language] || f.language))].sort();

  const areas = new Map();
  for (const f of out) {
    const area = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    if (!areas.has(area)) areas.set(area, []);
    areas.get(area).push(f);
  }
  const lines = [
    `App ${name}`,
    `  ${plural(total.files, 'file')} read in ${langs.join(', ') || 'no language'}: ${summary(total).replace(/\.$/, '')}.`,
    '  Read from code by the Thunder compiler, no AI. Each file has its own Thunder Text beside it.',
  ];
  for (const [area, list] of areas) {
    lines.push('', `Area ${area === '.' ? '(top level)' : area}`);
    for (const f of list) {
      const doors = f.items.filter((i) => i.element === 'action' || i.element === 'decision');
      lines.push(`  File ${f.path}: ${summary(f.counts)}`);
      for (const d of doors) lines.push(`    ${d.element === 'action' ? d.title : `Rule: ${d.title}`}`);
    }
  }
  if (skipped.length) {
    lines.push('', 'Not read');
    for (const s of skipped) lines.push(`  ${s.path}: ${s.reason}`);
  }
  return { schema: THUNDERIZE_SCHEMA, name, counts: total, languages: langs, files: out, skipped, index: `${lines.join('\n')}\n` };
}
