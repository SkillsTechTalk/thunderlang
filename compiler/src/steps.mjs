// Steps: read any function as a short list of plain steps (check, branch, loop, set, call, return, fail).
// Decisions become rules; everything else becomes steps. Deterministic and pattern-based, like the rest of
// the reader: a statement it does not recognize is kept as `other` with its original text, never guessed.
export const STEPS_SCHEMA = 'thunder-steps-v1';
const MAX_STEPS = 14;

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const clip = (s, n = 70) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const stripTail = (s) => String(s).trim().replace(/[;{]\s*$/, '').replace(/:\s*$/, '').trim();

// Calls that mean something to a reader, recognized by name. Same spirit as the Thunder map patterns.
const KNOWN_CALLS = [
  { re: /^(?:requests\.(?:get|post|put|patch|delete)|fetch|axios(?:\.\w+)?|http\.(?:Get|Post|NewRequest)|HttpClient\.\w+|client\.(?:get|post|put|delete))$/i, say: () => 'Calls another service over HTTP' },
  { re: /^stripe\./i, say: () => 'Calls Stripe' },
  { re: /^(?:send_?email|sendMail|mailer\.\w+|smtp\.\w+)$/i, say: () => 'Sends an email' },
  { re: /^(?:db|database|repo|repository|session|conn|cursor)\.(?:insert|save|add|create|update|execute|exec|query|delete|remove|commit)\w*$/i, say: (m) => `Writes to the database (${m.split('.').pop()})` },
  { re: /^(?:events?|bus|publisher|emitter|queue)\.(?:publish|emit|send|enqueue|push)$/i, say: () => 'Announces an event' },
  { re: /^(?:log|logger|console|logging|fmt|Log|System\.out|println|print|puts|echo|printf)\b/i, say: () => 'Writes a log or message' },
];

/** A condition as words when it can't be fully translated: c.ctx == nil -> "c.ctx is empty". */
export function sayCodeCondition(cond) {
  let c = String(cond).trim().replace(/\s*(\{|:|then|do)\s*$/, '').trim();
  while (c.startsWith('(') && matchingClose(c, 0) === c.length - 1) c = c.slice(1, -1).trim();
  return clip(c
    .replace(/\s*(===|==)\s*(nil|null|None|undefined|""|'')(?=\s|\)|$)/g, ' is empty')
    .replace(/\s*(!==|!=)\s*(""|'')(?=\s|\)|$)/g, ' is not empty')
    .replace(/\s*(!==|!=)\s*(nil|null|None|undefined)\b/g, ' is set')
    .replace(/\bis not None\b/g, 'is set').replace(/\bis None\b/g, 'is empty')
    .replace(/\s*(===|==)\s*/g, ' is ').replace(/\s*(!==|!=)\s*/g, ' is not ')
    .replace(/\s*&&\s*/g, ' and ').replace(/\s*\|\|\s*/g, ' or ')
    .replace(/(^|[\s(])!(?=[\w(])/g, '$1not ').replace(/\s+/g, ' '), 70);
}
function matchingClose(str, open) {
  let depth = 0;
  for (let i = open; i < str.length; i++) { if (str[i] === '(') depth++; else if (str[i] === ')' && --depth === 0) return i; }
  return -1;
}
const lastWords = (path) => words(String(path).split('.').pop());
/** "cmd.commandCalledAs.called" -> "called on command called as"; "this.count" -> "count". */
function targetWords(path) {
  const parts = String(path).replace(/^@+/, '').replace(/\[.*$/, '').split('.').filter((p) => !/^(this|self)$/.test(p));
  if (parts.length <= 1) return words(parts[0] || path);
  return `${words(parts[parts.length - 1])} on ${words(parts[parts.length - 2])}`;
}

function callee(text) {
  const m = String(text).match(/^(?:await\s+|try\s+|yield\s+)?(?:new\s+)?([A-Za-z_$][\w$]*(?:(?:\.|::|->)[A-Za-z_$][\w$]*)*)!?\s*\(/);
  return m ? m[1].replace(/::|->/g, '.') : null;
}
function sayCall(name, args) {
  for (const k of KNOWN_CALLS) if (k.re.test(name)) {
    const target = (args.match(/^\s*["'`]([\w.\-/: ]{1,60})["'`]/) || [])[1];
    const base = k.say(name);
    return target ? `${base}: ${target}` : base;
  }
  return null;
}
function firstArgs(text) {
  const open = text.indexOf('(');
  return open >= 0 ? text.slice(open + 1, open + 120) : '';
}

function sayValue(expr) {
  const e = stripTail(expr);
  if (/^["'`].*["'`]$/.test(e)) return `"${clip(e.slice(1, -1), 40)}"`;
  if (/^-?\d+(\.\d+)?$/.test(e) || /^(true|false|True|False|nil|null|None|undefined)$/.test(e)) return e;
  const c = callee(e);
  if (c) {
    if (/^new\s/.test(e)) return `a new ${c.split('.').pop()}`;
    return `the result of ${lastWords(c)}`;
  }
  if (/^[A-Za-z_$][\w$.]*$/.test(e)) return words(e.split('.').pop());
  return null;
}

/** Classify one statement (its first line or header). Returns { kind, says, code } where code is the original text. */
export function classifyStatement(raw, { inner = 0 } = {}) {
  const text = String(raw).trim();
  const head = text.split('\n')[0].trim();
  const code = clip(head, 90);
  let m;
  const innerNote = inner ? ` (${inner} step${inner === 1 ? '' : 's'} inside)` : '';
  // Failures
  if ((m = head.match(/^(?:throw|raise)\s+(?:new\s+)?([A-Za-z_][\w.]*)?/)) || /^panic!?\s*\(/.test(head)) {
    const name = m?.[1] ? m[1].split('.').pop() : null;
    const msg = (head.match(/["'`]([^"'`]{1,60})["'`]/) || [])[1];
    return { kind: 'fail', says: `Fails${name ? ` with ${name}` : ''}${msg ? `: "${msg}"` : ''}`, code };
  }
  // Returns (Go/Rust error returns read as failures)
  if ((m = head.match(/^return\b\s*(.*)$/))) {
    const expr = stripTail(m[1]);
    if (!expr) return { kind: 'return', says: 'Stops here', code };
    const lastVal = expr.split(',').pop().trim();
    if (/,/.test(expr) && /^(?:err|error|e)$|^Err[A-Z]\w*$|^\w*Error$|^errors\.New\(|^fmt\.Errorf\(/.test(lastVal)) {
      const named = /^Err[A-Z]\w*$|^\w+Error$/.test(lastVal) ? `: ${lastVal}` : '';
      return { kind: 'fail', says: `Returns an error to the caller${named}`, code };
    }
    if (/^(Err|Error)\s*\(/.test(expr) || /\berrors\.New\(|fmt\.Errorf\(/.test(expr)) {
      const msg = (expr.match(/["'`]([^"'`]{1,60})["'`]/) || [])[1];
      return { kind: 'fail', says: `Returns an error${msg ? `: "${msg}"` : ''}`, code };
    }
    const v = sayValue(expr);
    return { kind: 'return', says: v ? `Returns ${v}` : 'Returns a computed value', code, ...(v ? {} : { value: clip(expr, 60) }) };
  }
  // Loops
  if ((m = head.match(/^for\s*\(?\s*(?:const|let|var|val|final|auto|[\w<>\[\],? ]+?\s)?\s*\(?([\w$, _]+?)\)?\s+(?:of|in|:)\s+(.+?)\)?\s*(?:\{|:|do)?\s*$/))) {
    return { kind: 'loop', says: `For each ${words(m[1].split(',').pop().trim())} in ${words(stripTail(m[2]).split('.').pop().replace(/\(\)$/, ''))}${innerNote}`, code };
  }
  if ((m = head.match(/^for\s+[\w, _]+\s*:=\s*range\s+(.+?)\s*\{?$/))) return { kind: 'loop', says: `For each item in ${words(stripTail(m[1]).split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^foreach\s*\(\s*(?:var\s+|\w+\s+)?(\$?\w+)\s+in\s+(.+?)\)\s*\{?$/))) return { kind: 'loop', says: `For each ${words(m[1])} in ${words(m[2].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^foreach\s*\(\s*(.+?)\s+as\s+(?:\w+\s*=>\s*)?(\w+)\s*\)\s*\{?$/))) return { kind: 'loop', says: `For each ${words(m[2])} in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^([\w.]+)\.each(?:_with_index)?\s+do\s*\|(\w+)/))) return { kind: 'loop', says: `For each ${words(m[2])} in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^([\w.]+)\.(?:forEach|each|map|filter|for_each)\s*[({]/))) return { kind: 'loop', says: `For each item in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^(?:while|until|loop)\b\s*\(?(.*?)\)?\s*(?:\{|:|do)?\s*$/))) return { kind: 'loop', says: m[1] ? `Repeats while ${clip(m[1], 50)}${innerNote}` : `Repeats${innerNote}`, code };
  // Branches
  if ((m = head.match(/^(?:if|elif|else\s+if|unless|when)\b\s*(.*?)\s*(?:\{|:|then)?\s*$/))) { const cond = sayCodeCondition(m[1]); return { kind: 'branch', says: `If ${/^unless\b/.test(head) ? 'not: ' : ''}${cond}${innerNote}`, cond: m[1].replace(/^\((.*)\)$/, '$1'), code, negate: /^unless\b/.test(head) }; }
  if ((m = head.match(/^(?:switch|match|case|select)\b\s*\(?(.*?)\)?\s*(?:\{|:)?\s*$/))) return { kind: 'branch', says: `Chooses by ${words(clip(m[1], 40)) || 'value'}${innerNote}`, code };
  if (/^(?:try|begin)\b/.test(head)) return { kind: 'try', says: `Tries the next steps and handles any error${innerNote}`, code };
  if ((m = head.match(/^assert\b\s*(.*?)\s*;?$/))) return { kind: 'check', says: `Checks that ${m[1] ? sayCodeCondition(m[1].replace(/,\s*["'].*$/, '')) : 'a condition holds'}`, code };
  if ((m = head.match(/^assert(?:_\w+|That|Equals|True|False|NotNull|Null)\b/))) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
  if ((m = head.match(/^(?:expect|t\.(?:Error|Fatal|Errorf|Fatalf|Run)|require\.\w+|assert\.\w+)\b/))) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
  if ((m = head.match(/^with\s+(.+?)\s+as\s+(.+?):\s*$/))) { const what = /^open\s*\(/.test(m[1]) ? 'a file' : words(clip(stripTail(m[1]).replace(/\(.*$/, ''), 40)); return { kind: 'set', says: `Opens ${what} as ${words(m[2].replace(/[()]/g, ''))}`, code }; }
  if ((m = head.match(/^(?:using|lock|synchronized)\s*\((.+?)\)/))) return { kind: 'set', says: `Uses ${clip(m[1], 50)}`, code };
  if (/^defer\b/.test(head)) return { kind: 'call', says: `At the end, ${clip(head.replace(/^defer\s+/, ''), 60)}`, code };
  if (/^super\b/.test(head)) return { kind: 'call', says: 'Runs the parent version first', code };
  if (/^yield\b/.test(head)) return { kind: 'call', says: 'Hands control to the given block', code };
  // A bare value as a statement is an implicit return (Ruby, Rust, Kotlin/Scala expression bodies).
  if (/^(?:["'`].*["'`]|-?\d+(?:\.\d+)?|true|false|nil|null|None|self|[a-z_][\w.]*)$/.test(head) && !/^(?:else|end|break|next|redo|retry|pass)$/.test(head)) {
    const v = sayValue(head);
    return { kind: 'return', says: v ? `Returns ${v}` : 'Returns a value', code };
  }
  if ((m = head.match(/^(?:var|const)\s*\($/))) return { kind: 'set', says: 'Declares some values', code };
  if ((m = head.match(/^var\s+([\w, ]+?)\s+[\w.*\[\]]+$/))) return { kind: 'set', says: `Declares ${m[1].split(/\s*,\s*/).map(words).join(', ')}`, code };
  // Typed declaration: Type name = value (Java, C#, C++); the value may continue on the next line.
  if ((m = head.match(/^(?:final\s+|static\s+|readonly\s+)*([A-Z][\w.]*(?:<[^=]*>)?(?:\[\])?|int|long|double|float|boolean|bool|char|byte|short|string|decimal|var|auto)\s+([a-zA-Z_$][\w$]*)\s*=(?!=)\s*(.*)$/))) {
    const value = stripTail(m[3]); const target = words(m[2]);
    const c = value ? callee(value) : null;
    if (c) {
      const known = sayCall(c, firstArgs(value));
      if (known) return { kind: 'call', says: `${known}, keeping the result as ${target}`, code, callee: c };
      if (/^new\s/.test(value)) return { kind: 'set', says: `Creates a new ${c.split('.').pop()} as ${target}`, code };
      return { kind: 'set', says: `Works out ${target} from ${lastWords(c)}`, code, callee: c };
    }
    const v = value ? sayValue(value) : null;
    return { kind: 'set', says: v ? `Sets ${target} to ${v}` : `Works out ${target}`, code };
  }
  // Assignment (not comparisons)
  if ((m = head.match(/^(?:(?:const|let|var|val|final|auto|my|local)\s+)?(?:mut\s+)?([@A-Za-z_$][\w$.\[\]'"@]*?(?:\s*,\s*[@A-Za-z_$][\w$.@]*)*)(?:\s*:\s*[\w<>\[\]?, .|]+)?\s*(:=|\+=|-=|\*=|\/=|\|\|=|\?\?=|=)(?!=)\s*(.*)$/)) && !/^(?:if|for|while|return)\b/.test(head)) {
    const target = m[1].split(/\s*,\s*/).map(targetWords).join(', ');
    const value = stripTail(m[3]);
    const c = callee(value);
    if (c) {
      const known = sayCall(c, firstArgs(value));
      if (known) return { kind: 'call', says: `${known}, keeping the result as ${target}`, code, callee: c };
      if (/^new\s/.test(value)) return { kind: 'set', says: `Creates a new ${c.split('.').pop()} as ${target}`, code };
      return { kind: 'set', says: `Works out ${target} from ${lastWords(c)}`, code, callee: c };
    }
    if (!value) return { kind: 'set', says: `Works out ${target}`, code };
    if (m[2] === '+=' || m[2] === '-=') return { kind: 'set', says: `${m[2] === '+=' ? 'Adds to' : 'Subtracts from'} ${target}`, code };
    const v = sayValue(value);
    return { kind: 'set', says: v ? `Sets ${target} to ${v}` : `Works out ${target}`, code };
  }
  // Calls
  const c = callee(head);
  if (c) {
    const known = sayCall(c, firstArgs(head));
    return { kind: 'call', says: known || `Calls ${lastWords(c)}`, code, callee: c };
  }
  if ((m = head.match(/^([a-z_][\w.]*[?!]?)\s+(?![=<>!+\-*/%]|and\b|or\b|if\b|unless\b)(.+)$/)) && !/^(?:if|for|while|return|else|elsif|when|case|def|class|module|end|not)$/.test(m[1])) {
    if (/^assert/.test(m[1])) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
    const known = sayCall(m[1], m[2]);
    return { kind: 'call', says: known || `Calls ${lastWords(m[1])}`, code, callee: m[1] };
  }
  return { kind: 'other', says: clip(head, 70), code };
}

/** Steps for a function body. `statements` are top-level [{ text, line, inner? }]. */
export function stepsFrom(statements) {
  const steps = [];
  for (const s of statements) {
    if (!s.text || /^(?:else\b|elsif\b|end\b|\}|except\b|catch\b|finally\b|rescue\b|ensure\b|pass$|break$|continue$|#)/.test(s.text.trim())) continue;
    const t = s.text.trim();
    if (/^(?:"""|'''|r"""|\/\*\*|\*)/.test(t)) continue; // docstrings and doc comments
    if (/^[)\]}]+[):;,]*$/.test(t) || /^\.\.\.$/.test(t) || /^\.[A-Za-z_]/.test(t) || /^@\w+(?:\(.*\))?$/.test(t) || /^:(?:param|rtype|return|raises|type)\b/.test(t)) continue;
    const step = { ...classifyStatement(s.text, { inner: s.inner || 0 }), line: s.line };
    if (s.children?.length && ['branch', 'loop', 'try'].includes(step.kind)) {
      const kids = stepsFrom(s.children.map(({ children, ...rest }) => rest)).steps.slice(0, 6);
      if (kids.length) { step.children = kids; step.says = step.says.replace(/ \(\d+ steps? inside\)$/, ''); }
    }
    steps.push(step);
  }
  const more = Math.max(0, steps.length - MAX_STEPS);
  return { steps: steps.slice(0, MAX_STEPS), more, readable: steps.length ? steps.filter((x) => x.kind !== 'other').length / steps.length : 0 };
}

/** Top-level statements for a brace-language body, with the number of inner statements of each block. */
export function braceStatements(stmts, split = null) {
  return stmts.map((s) => {
    const open = s.text.indexOf('{');
    // Only the first block (the "then" part of an if, the body of a loop); else-chains stay summarized.
    let body = '';
    if (open >= 0) {
      let depth = 0, end = -1;
      for (let i = open; i < s.text.length; i++) { if (s.text[i] === '{') depth++; else if (s.text[i] === '}' && --depth === 0) { end = i; break; } }
      body = end > open ? s.text.slice(open + 1, end) : '';
    }
    const inner = body ? body.split(/;|\n/).filter((l) => l.trim() && !/^[{}]$/.test(l.trim())).length : 0;
    const children = body && split ? split(body, s.line).map((c) => ({ text: c.text, line: c.line })) : [];
    return { text: s.text, line: s.line, inner, children };
  });
}

/** Top-level statements for an indentation body (Python) or depth body (Ruby). */
export function indentStatements(body, { depthKey = 'indent' } = {}) {
  if (!body?.length) return [];
  // Drop multi-line docstrings first: everything between an opening and closing triple quote.
  const kept = [];
  let inDoc = null;
  for (const l of body) {
    const t = l.text.trim();
    if (inDoc) { if (t.includes(inDoc)) inDoc = null; continue; }
    const q = (t.match(/^[rbuf]{0,2}("""|''')/) || [])[1];
    if (q) { if (t.slice(t.indexOf(q) + 3).includes(q) === false) inDoc = q; continue; }
    kept.push(l);
  }
  body = kept;
  if (!body.length) return [];
  const base = Math.min(...body.map((l) => l[depthKey] ?? 0));
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if ((l[depthKey] ?? 0) !== base) continue;
    let inner = 0;
    const children = [];
    let childDepth = null;
    for (let k = i + 1; k < body.length && (body[k][depthKey] ?? 0) > base; k++) {
      inner++;
      const d = body[k][depthKey] ?? 0;
      if (childDepth === null) childDepth = d;
      if (d === childDepth) children.push({ text: body[k].text, line: body[k].line });
    }
    out.push({ text: l.text, line: l.line, inner, children });
  }
  return out;
}
