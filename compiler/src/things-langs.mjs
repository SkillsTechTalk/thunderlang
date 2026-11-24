// Things (classes, records, and choices) in Java, C#, Kotlin, PHP, Go, Rust, and Ruby, so Big Picture shows what an
// app is made of in every language Thunder reads, not only Python and TypeScript. Each reader gives the same shape
// as model.mjs's pythonThings/tsThings: { kind: 'thing' | 'record' | 'choices', name, file, lines, doc?, knows,
// choices, memberRanges? }. `memberRanges` are extra line ranges whose functions belong to the Thing (Go methods
// with a receiver, Rust impl blocks), because those languages write methods outside the type itself.

/** Index of the `}` that closes the `{` at `open`, skipping strings, chars, and comments. -1 if unclosed. */
function braceEnd(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const n = src.indexOf('\n', i); if (n < 0) return -1; i = n; continue; }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); if (n < 0) return -1; i = n + 1; continue; }
    if (c === '"' || c === '`') { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++; continue; }
    if (c === "'" && /^'(?:\\.|[^\\'])'/.test(src.slice(i, i + 4))) { i = src.indexOf("'", i + 1 + (src[i + 1] === '\\' ? 1 : 0)) ; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Line-start offsets once per source, so every line lookup is a binary search. */
function lineFinder(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}

/** The doc comment just above a declaration (/** … *\/, ///, or # lines), first paragraph, or null. */
function docAbove(src, idx) {
  // Strip attributes and annotations right before the declaration, one at a time (a single regex with nested
  // whitespace repeats backtracks without end on long whitespace runs).
  let before = src.slice(Math.max(0, idx - 1200), idx).trimEnd();
  for (let n = 0; n < 20; n++) {
    const next = before.replace(/(?:@\w+(?:\([^)]*\))?|#\[[^\]]*\]|\[[A-Z]\w*(?:\([^)]*\))?\])$/, '').trimEnd();
    if (next === before) break;
    before = next;
  }
  // The doc comment that ends right before the declaration: the last /** in the text, not the first.
  let m = /\*\/\s*$/.test(before) ? before.slice(before.lastIndexOf('/**')).match(/^\/\*\*([\s\S]*?)\*\/\s*$/) : null;
  if (m) return m[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter((l) => l && !l.startsWith('@')).join(' ').split(/\s{2,}/)[0] || null;
  // Line comments right above (/// , //, #): walk back line by line (a regex over the run backtracks badly).
  const lines = before.split('\n');
  const run = [];
  for (let k = lines.length - 1; k >= 0 && /^\s*(?:\/\/\/?|#(?!\[))/.test(lines[k]); k--) run.unshift(lines[k]);
  if (run.length) {
    const text = run.map((l) => l.replace(/^\s*(?:\/\/\/?|#)\s?/, '').trim()).filter(Boolean).join(' ').replace(/<\/?summary>/g, '').trim();
    return text && !/^(frozen_string_literal|!|typed:)/.test(text) ? text : null;
  }
  return null;
}

/** C and C++ also document with a plain block comment (/* … *\/) on the lines right above. */
function cDocAbove(src, idx) {
  const before = src.slice(Math.max(0, idx - 1200), idx).trimEnd();
  if (/\*\/$/.test(before) && !/\/\*\*[\s\S]*\*\/$/.test(before.slice(before.lastIndexOf('/*')))) {
    const at = before.lastIndexOf('/*');
    if (at >= 0 && /(?:^|\n)[ \t]*$/.test(before.slice(0, at))) {
      const para = [];
      for (const l of before.slice(at + 2, -2).split('\n')) { const t = l.replace(/^\s*\*?\s?/, '').trim(); if (!t) { if (para.length) break; continue; } para.push(t); }
      return para.join(' ') || null;
    }
  }
  return docAbove(src, idx);
}

/** The body of a brace block with nested blocks removed: the type's own declarations, not its methods' bodies. */
function ownLevel(body) {
  let depth = 0, own = '';
  for (const c of body) { if (c === '{') depth++; if (depth === 0) own += c; if (c === '}') depth--; }
  return own;
}

/** Split a parameter list at top-level commas. */
function splitParams(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of String(s)) {
    if ('(<[{'.includes(c)) depth++;
    if (')>]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Go doc comments start with the type's name ("Library lends books…"); read them without it ("Lends books…"). */
function goDoc(src, at, name) {
  const d = docAbove(src, at);
  if (!d) return null;
  const t = d.replace(new RegExp(`^${name}\\s+(?:is|holds|represents)\\s+`), '').replace(new RegExp(`^${name}\\s+`), '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const MODIFIERS = /^(?:(?:public|private|protected|internal|static|final|readonly|const|volatile|transient|override|open|abstract|sealed|lateinit|required|unsafe|mut|pub(?:\([^)]*\))?|var|val|let)\s+)*/;

export function makeThingReaders({ words, kindWords, startValue }) {
  const know = (name, type, start, params, line = null) => ({ name, label: words(name.replace(/^[_$]+|_$/g, '')), kind: type ? kindWords(type) : null, start: start != null && start !== '' ? startValue(start, params) : null, line });

  /** Java, C#, Kotlin, PHP: brace-bodied classes. */
  function curlyThings(src, file, language) {
    const lineAt = lineFinder(src);
    const out = [];
    const kw = {
      java: /(?:^|\n)[ \t]*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|final|abstract|sealed|non-sealed)\s+)*(class|enum|record)\s+(\w+)\s*(?:<[^>{]*>)?\s*(\([^)]*\))?[^{;]*\{/g,
      csharp: /(?:^|\n)[ \t]*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|file)\s+)*(class|struct|enum|record(?:\s+(?:class|struct))?)\s+(\w+)\s*(?:<[^>{(]*>)?\s*(\([^)]*\))?[^{;]*(?:\{|;)/g,
      kotlin: /(?:^|\n)[ \t]*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|internal|open|abstract|sealed|final|data|enum|value|inline)\s+)*(class|object)\s+(\w+)\s*(?:<[^>{(]*>)?\s*(?:(?:private|internal|public)?\s*constructor\s*)?(\((?:[^()]|\([^()]*\))*\))?[^{\n]*(\{)?/g,
      php: /(?:^|\n)[ \t]*(?:#\[[^\]]*\]\s*)*(?:(?:final|abstract|readonly)\s+)*(class|enum)\s+(\w+)(?:\s*:\s*\w+)?[^{;]*\{/g,
    }[language];
    if (!kw) return out;
    let m;
    while ((m = kw.exec(src))) {
      const declAt = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const head = m[0];
      const kindWord = m[1];
      const name = m[2];
      const ctorParams = m[3] && m[3].startsWith('(') ? m[3].slice(1, -1) : '';
      const isData = language === 'kotlin' ? /\bdata\s+class\b|\bvalue\s+class\b/.test(head) : false;
      const isEnum = kindWord === 'enum' || (language === 'kotlin' && /\benum\s+class\b/.test(head));
      const isRecord = !isEnum && (/^record/.test(kindWord) || isData || (language === 'csharp' && kindWord === 'struct'));
      const open = head.trimEnd().endsWith('{') ? m.index + head.trimEnd().length - 1 : -1;
      const close = open >= 0 ? braceEnd(src, open) : -1;
      if (open >= 0 && close < 0) continue;
      const body = open >= 0 ? src.slice(open + 1, close) : '';
      const thing = {
        kind: isEnum ? 'choices' : isRecord ? 'record' : 'thing', name, file,
        lines: [lineAt(declAt), lineAt(close >= 0 ? close : m.index + head.length)],
        ...(docAbove(src, declAt) ? { doc: docAbove(src, declAt) } : {}), knows: [], choices: [],
      };
      // Constructor parameters in the header: Java/C# records, Kotlin primary constructors, C# primary constructors.
      const params = {};
      for (const p of splitParams(ctorParams)) {
        let pm;
        if (language === 'kotlin' && (pm = p.match(/^(?:@\w+\s+)*(?:(?:private|public|protected|internal|override|open)\s+)*(val|var)?\s*(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/))) {
          params[pm[2]] = pm[4] ?? null;
          if (pm[1]) thing.knows.push(know(pm[2], pm[3], pm[4], {}, null));
        } else if ((pm = p.match(/^(?:@\w+\s+)*(?:final\s+)?([\w.<>[\],? ]+?)\s+(\w+)(?:\s*=\s*(.+))?$/))) {
          params[pm[2]] = pm[3] ?? null;
          if (/^record/.test(kindWord) || (language === 'csharp' && /^record/.test(kindWord))) thing.knows.push(know(pm[2], pm[1], pm[3], {}, null));
        }
      }
      if (isEnum) {
        // Doc comments between the values (/// <summary>…, /** … */) are not values.
        const own = ownLevel(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''));
        const list = language === 'php' ? [...own.matchAll(/\bcase\s+(\w+)(?:\s*=\s*([^;]+))?;/g)].map((x) => [x[1], x[2]]) : own.split(';')[0].split(',').map((x) => x.trim().match(/^(?:@\w+\s+)*(\w+)\s*(?:\((.*)\))?(?:\s*=\s*(.+))?/s)).filter(Boolean).map((x) => [x[1], x[2] ?? x[3]]);
        for (const [n, v] of list) if (n && !/^(public|private|protected|fun|val|var|companion)$/.test(n)) thing.choices.push(v && /^\s*["']/.test(v) ? v.trim().replace(/^["'](.*)["']$/s, '$1') : words(n));
        out.push(thing);
        continue;
      }
      const own = ownLevel(body);
      for (const raw of own.split(/[;\n]/)) {
        const l = raw.trim().replace(/^(?:@\w+(?:\([^)]*\))?\s*)+/, '').replace(/^#\[[^\]]*\]\s*/, '');
        if (!l || /^(\/\/|\/\*|\*|import|package|use|return|case|default|enum\s|class\s|interface\s|fun\s|function\s|def\s|init\b|constructor|companion|object\s)/.test(l) || /\)\s*$/.test(l) && !/=/.test(l)) continue;
        let f;
        if (language === 'kotlin' && (f = l.match(/^(?:(?:private|public|protected|internal|override|open|lateinit|const)\s+)*(?:val|var)\s+(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/))) {
          thing.knows.push(know(f[1], f[2], f[3], params));
        } else if (language === 'php' && (f = l.match(/^(?:(?:public|private|protected|static|readonly)\s+)+(?:\??[\w\\]+\s+)?\$(\w+)(?:\s*=\s*(.+))?$/))) {
          const type = l.match(/^(?:(?:public|private|protected|static|readonly)\s+)+(\??[\w\\]+)\s+\$/)?.[1];
          thing.knows.push(know(f[1], type, f[2], params));
        } else if (language === 'csharp' && (f = l.match(/^(?:(?:public|private|protected|internal|static|readonly|required|virtual|override|const)\s+)*([\w.<>[\],? ]+?)\s+(\w+)\s*\{\s*(?:get|init|set)[^}]*\}(?:\s*=\s*(.+))?$/))) {
          thing.knows.push(know(f[2], f[1], f[3], params));
        } else if ((language === 'java' || language === 'csharp') && (f = l.match(/^(?:(?:public|private|protected|internal|static|final|readonly|transient|volatile|const)\s+)*([\w.<>[\],? ]+?)\s+(\w+)(?:\s*=\s*(.+))?$/)) && !/^(new|return|throw|if|for|while)$/.test(f[1].trim())) {
          if (/\bstatic\b/.test(l) && /\bfinal\b|\bconst\b/.test(l)) continue; // constants belong to the type, not each Thing
          thing.knows.push(know(f[2], f[1], f[3], params));
        }
      }
      // Starting values set in the constructor: this.x = …; / $this->x = …; / x = … (Kotlin init blocks).
      const ctorRe = language === 'php' ? /function\s+__construct\s*\(([^)]*)\)\s*\{/ : language === 'kotlin' ? /\binit\s*\{/ : new RegExp(`(?:public|private|protected|internal)?\\s*${name}\\s*\\(([^)]*)\\)\\s*(?::\\s*(?:this|base)\\([^)]*\\)\\s*)?\\{`);
      const ctor = body.match(ctorRe);
      if (ctor) {
        for (const p of splitParams(ctor[1] || '')) {
          const pm = language === 'php' ? p.match(/^(?:(public|private|protected)(?:\s+readonly)?\s+)?(?:\??[\w\\]+\s+)?\$(\w+)(?:\s*=\s*(.+))?$/) : p.match(/^(?:final\s+)?(?:[\w.<>[\],? ]+?)\s+(\w+)(?:\s*=\s*(.+))?$/);
          if (!pm) continue;
          if (language === 'php') { params[pm[2]] = pm[3] ?? null; if (pm[1] && !thing.knows.some((k) => k.name === pm[2])) thing.knows.push(know(pm[2], p.match(/(\??[\w\\]+)\s+\$/)?.[1], pm[3], {})); }
          else params[pm[1]] = pm[2] ?? null;
        }
        const cOpen = body.indexOf('{', ctor.index + ctor[0].length - 1);
        const cBody = body.slice(cOpen + 1, braceEnd(body, cOpen));
        const assign = language === 'php' ? /\$this->(\w+)\s*=\s*([^;\n]+)/g : language === 'kotlin' ? /(?:this\.)?(\w+)\s*=\s*([^\n;]+)/g : /(?:this\.)?(\w+)\s*=\s*([^;\n]+);/g;
        for (const a of cBody.matchAll(assign)) {
          const k = thing.knows.find((x) => x.name === a[1] || x.name === `_${a[1]}` || x.name.replace(/^_/, '') === a[1]);
          const value = a[2].trim().replace(/^\$/, '');
          if (k) { if (!k.start) k.start = startValue(value, params); }
          else if (language === 'php' || /^this\./.test(a[0])) thing.knows.push(know(a[1], null, value, params));
        }
      }
      out.push(thing);
    }
    return out;
  }

  /** Go: structs are Things when they have methods (func (r *T) …), records otherwise; typed const blocks are choices. */
  function goThings(src, file) {
    const lineAt = lineFinder(src);
    const out = [];
    const byName = new Map();
    for (const m of src.matchAll(/(?:^|\n)type\s+(\w+)\s+struct\s*\{/g)) {
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const open = m.index + m[0].length - 1;
      const close = braceEnd(src, open);
      if (close < 0) continue;
      const t = { kind: 'record', name: m[1], file, lines: [lineAt(at), lineAt(close)], ...(goDoc(src, at, m[1]) ? { doc: goDoc(src, at, m[1]) } : {}), knows: [], choices: [], memberRanges: [] };
      for (const raw of src.slice(open + 1, close).split('\n')) {
        const f = raw.replace(/\/\/.*$/, '').replace(/`[^`]*`/g, '').trim().match(/^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+(\S.*)$/);
        if (f) for (const n of f[1].split(',')) t.knows.push(know(n.trim(), f[2].trim(), null, {}));
      }
      out.push(t);
      byName.set(m[1], t);
    }
    // Methods with a receiver belong to their type; a type with methods can do things, so it is a Thing.
    for (const m of src.matchAll(/(?:^|\n)func\s*\(\s*\w*\s*\*?\s*(\w+)(?:\[[^\]]*\])?\s*\)\s*\w+/g)) {
      const t = byName.get(m[1]);
      if (!t) continue;
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const open = src.indexOf('{', at);
      const close = open >= 0 ? braceEnd(src, open) : -1;
      t.kind = 'thing';
      t.memberRanges.push([lineAt(at), lineAt(close >= 0 ? close : at)]);
    }
    // Starting values from a constructor: func NewLibrary(...) *Library { return &Library{MaxBooks: 3, ...} }.
    for (const m of src.matchAll(/func\s+New(\w+)\s*\(([^)]*)\)[^{]*\{/g)) {
      const t = byName.get(m[1]);
      if (!t) continue;
      const open = m.index + m[0].length - 1;
      const body = src.slice(open, braceEnd(src, open) + 1);
      const params = Object.fromEntries(splitParams(m[2]).map((p) => [p.split(/\s+/)[0], null]));
      const litAt = body.search(new RegExp(`&?${m[1]}\\s*\\{`));
      const litOpen = litAt >= 0 ? body.indexOf('{', litAt) : -1;
      const litBody = litOpen >= 0 ? body.slice(litOpen + 1, braceEnd(body, litOpen)) : '';
      for (const kv of splitParams(litBody.replace(/\n/g, ','))) {
        const f = kv.match(/^(\w+)\s*:\s*(.+)$/);
        const k = f && t.knows.find((x) => x.name === f[1]);
        if (k && !k.start) k.start = startValue(f[2].trim(), params);
      }
    }
    // A named type with a typed const block is a set of choices: type Status int; const ( OnShelf Status = iota … ).
    for (const m of src.matchAll(/(?:^|\n)type\s+(\w+)\s+(?:int|int8|int16|int32|uint|uint8|string)\b/g)) {
      const name = m[1];
      const block = src.match(new RegExp(`const\\s*\\(([^)]*\\b${name}\\b[^)]*)\\)`));
      if (!block) continue;
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const choices = [];
      let inType = false;
      for (const raw of block[1].split('\n')) {
        const l = raw.replace(/\/\/.*$/, '').trim();
        if (!l) continue;
        const f = l.match(/^(\w+)(?:\s+(\w+))?(?:\s*=\s*(.+))?$/);
        if (!f) continue;
        if (f[2]) inType = f[2] === name;
        if (!inType) continue;
        const label = f[3] && /^"/.test(f[3].trim()) ? f[3].trim().slice(1, -1) : words(f[1].replace(new RegExp(`^${name}`), '') || f[1]);
        choices.push(label);
      }
      if (choices.length) out.push({ kind: 'choices', name, file, lines: [lineAt(at), lineAt(at)], ...(goDoc(src, at, name) ? { doc: goDoc(src, at, name) } : {}), knows: [], choices });
    }
    return out;
  }

  /** Rust: structs and enums; impl blocks give a struct its methods (a Thing), otherwise it is a record. */
  function rustThings(src, file) {
    const lineAt = lineFinder(src);
    const out = [];
    const byName = new Map();
    for (const m of src.matchAll(/(?:^|\n)[ \t]*(?:#\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(struct|enum)\s+(\w+)\s*(?:<[^>{]*>)?\s*(?:where[^{]*)?(\{|\(|;)/g)) {
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const doc = docAbove(src, at);
      if (m[3] !== '{') {
        // Tuple struct (struct Meters(f64);) or unit struct: a record with no named facts.
        const t = { kind: 'record', name: m[2], file, lines: [lineAt(at), lineAt(at)], ...(doc ? { doc } : {}), knows: [], choices: [], memberRanges: [] };
        out.push(t); byName.set(m[2], t); continue;
      }
      const open = m.index + m[0].length - 1;
      const close = braceEnd(src, open);
      if (close < 0) continue;
      const body = ownLevel(src.slice(open + 1, close));
      const t = { kind: m[1] === 'enum' ? 'choices' : 'record', name: m[2], file, lines: [lineAt(at), lineAt(close)], ...(doc ? { doc } : {}), knows: [], choices: [], memberRanges: [] };
      if (m[1] === 'enum') {
        for (const v of splitParams(body.replace(/\/\/[^\n]*/g, '').replace(/#\[[^\]]*\]/g, ''))) { const n = v.trim().match(/^(\w+)/); if (n) t.choices.push(words(n[1])); }
      } else {
        for (const f of splitParams(body.replace(/\/\/[^\n]*/g, '').replace(/#\[[^\]]*\]/g, ''))) { const fm = f.trim().match(/^(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:\s*(.+)$/s); if (fm) t.knows.push(know(fm[1], fm[2].trim(), null, {})); }
      }
      out.push(t); byName.set(m[2], t);
    }
    for (const m of src.matchAll(/(?:^|\n)[ \t]*impl(?:\s*<[^>]*>)?\s+(?:[\w:]+(?:<[^>]*>)?\s+for\s+)?(\w+)(?:<[^>]*>)?\s*(?:where[^{]*)?\{/g)) {
      const t = byName.get(m[1]);
      if (!t) continue;
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const close = braceEnd(src, m.index + m[0].length - 1);
      if (close < 0) continue;
      if (/\bfn\s+\w+\s*(?:<[^>]*>)?\s*\(\s*&?(?:mut\s+)?self\b/.test(src.slice(at, close))) { if (t.kind === 'record') t.kind = 'thing'; }
      t.memberRanges.push([lineAt(at), lineAt(close)]);
      // Starting values from fn new() -> Self { Self { field: value, … } }.
      // (Brace matching, not one big regex: a lazy match across a large impl block backtracks without end.)
      const block = src.slice(at, close);
      const fnNew = block.match(/fn\s+new\s*\(([^)]*)\)[^{;]*\{/);
      const fnOpen = fnNew ? fnNew.index + fnNew[0].length - 1 : -1;
      const fnBody = fnOpen >= 0 ? block.slice(fnOpen + 1, braceEnd(block, fnOpen)) : '';
      const litAt = fnBody.search(new RegExp(`\\b(?:Self|${m[1]})\\s*\\{`));
      const litOpen = litAt >= 0 ? fnBody.indexOf('{', litAt) : -1;
      const ctor = litOpen >= 0 ? [null, fnNew[1], fnBody.slice(litOpen + 1, braceEnd(fnBody, litOpen))] : null;
      if (ctor) {
        const params = Object.fromEntries(splitParams(ctor[1]).map((p) => [p.split(':')[0].trim(), null]));
        for (const kv of splitParams(ctor[2].replace(/\n/g, ','))) {
          const f = kv.match(/^(\w+)(?:\s*:\s*(.+))?$/);
          const k = f && t.knows.find((x) => x.name === f[1]);
          if (k && !k.start) k.start = startValue((f[2] ?? f[1]).trim().replace(/^Vec::new\(\)$|^vec!\[\]$|^HashMap::new\(\)$|^String::new\(\)$/, '[]'), params);
        }
      }
    }
    return out;
  }

  /** Ruby: class … end (by indentation), attr_* facts, initialize assignments, Struct.new records. */
  function rubyThings(src, file) {
    const lines = src.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const struct = lines[i].match(/^\s*(\w+)\s*=\s*(?:Struct|Data)\.(?:new|define)\(([^)]*)\)/);
      if (struct) {
        const t = { kind: 'record', name: struct[1], file, lines: [i + 1, i + 1], knows: [], choices: [] };
        for (const s of struct[2].split(',')) { const n = s.trim().match(/^:(\w+)/); if (n) t.knows.push(know(n[1], null, null, {}, i + 1)); }
        out.push(t);
        continue;
      }
      const m = lines[i].match(/^(\s*)class\s+(\w+)/);
      if (!m) continue;
      const indent = m[1].length;
      let end = i;
      for (let j = i + 1; j < lines.length; j++) if (new RegExp(`^\\s{${indent}}end\\b`).test(lines[j]) && lines[j].match(/^\s*/)[0].length === indent) { end = j; break; }
      if (end === i) continue;
      const doc = (() => { const d = []; for (let k = i - 1; k >= 0 && /^\s*#/.test(lines[k]); k--) d.unshift(lines[k].replace(/^\s*#\s?/, '').trim()); return d.join(' ').trim() || null; })();
      const t = { kind: 'thing', name: m[2], file, lines: [i + 1, end + 1], ...(doc && !/frozen_string_literal/.test(doc) ? { doc } : {}), knows: [], choices: [] };
      const body = lines.slice(i + 1, end);
      for (let k = 0; k < body.length; k++) {
        const a = body[k].match(/^\s*attr_(?:reader|accessor|writer)\s+(.+)$/);
        if (a) for (const s of a[1].split(',')) { const n = s.trim().match(/^:(\w+)/); if (n && !t.knows.some((x) => x.name === n[1])) t.knows.push(know(n[1], null, null, {}, i + 2 + k)); }
      }
      const init = body.findIndex((l) => /^\s*def\s+initialize\b/.test(l));
      if (init >= 0) {
        const sig = body[init].match(/def\s+initialize\s*\(?([^)]*)\)?/);
        const params = {};
        for (const p of splitParams(sig?.[1] || '')) { const pm = p.match(/^(\w+):?\s*(?:=\s*)?(.*)$/); if (pm) params[pm[1]] = pm[2] || null; }
        const ii = body[init].match(/^\s*/)[0].length;
        for (let k = init + 1; k < body.length; k++) {
          if (body[k].trim() && body[k].match(/^\s*/)[0].length <= ii) break;
          const a = body[k].trim().match(/^@(\w+)\s*=\s*(.+)$/);
          if (!a) continue;
          const kn = t.knows.find((x) => x.name === a[1]);
          if (kn) { if (!kn.start) kn.start = startValue(a[2], params); }
          else t.knows.push(know(a[1], null, a[2], params, i + 2 + k));
        }
      }
      if (!t.knows.length && !body.some((l) => /^\s*def\s/.test(l))) t.kind = 'record';
      out.push(t);
    }
    return out;
  }

  /**
   * The members written at a type's own level, split where a declaration ends (`;`, or a newline for Swift) or where a
   * brace block closes: [{ head, block, at }] where `block` is the inside of the braces that end it (or null) and `at`
   * is the head's offset in `body`.
   */
  function members(raw, { newlines = false } = {}) {
    // Comments blanked once (same length), so a `;` or `{` in a comment is never read as code.
    const chars = raw.split('');
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '/' && chars[i + 1] === '/') { while (i < chars.length && chars[i] !== '\n') chars[i++] = ' '; continue; }
      if (chars[i] === '/' && chars[i + 1] === '*') { chars[i] = chars[i + 1] = ' '; i += 2; while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) { if (chars[i] !== '\n') chars[i] = ' '; i++; } if (i < chars.length) { chars[i] = ' '; if (i + 1 < chars.length) chars[i + 1] = ' '; i++; } }
    }
    const body = chars.join('');
    const out = [];
    let from = 0, depth = 0;
    const emit = (end, block) => { const head = body.slice(from, end); if (head.trim() || block != null) out.push({ head: head.trim(), block, at: from + (head.length - head.trimStart().length) }); };
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '"' || c === "'") { const q = c; for (i++; i < body.length && body[i] !== q && body[i] !== '\n'; i++) if (body[i] === '\\') i++; continue; }
      if (c === '(' || c === '[') { depth++; continue; }
      if (c === ')' || c === ']') { depth--; continue; }
      if (depth) continue;
      if (c === '{') {
        const close = braceEnd(body, i);
        if (close < 0) break;
        emit(i, body.slice(i + 1, close));
        from = close + 1; i = close;
        continue;
      }
      if (c === ';' || (newlines && c === '\n')) { emit(i, null); from = i + 1; }
    }
    emit(body.length, null);
    return out;
  }

  /** Drop a common prefix from enum values: STATUS_ON_SHELF, STATUS_BORROWED -> ON_SHELF, BORROWED; kOnShelf -> OnShelf. */
  function enumNames(names) {
    if (names.length > 1) {
      const parts = names.map((n) => n.split('_'));
      let k = 0;
      while (parts.every((p) => p.length > k + 1 && p[k] === parts[0][k])) k++;
      if (k) names = parts.map((p) => p.slice(k).join('_'));
    }
    if (names.length && names.every((n) => /^k[A-Z]/.test(n))) names = names.map((n) => n.slice(1));
    return names;
  }

  /** C: struct, typedef struct, union, and enum. A struct is a record; the model makes it a Thing when functions take it. */
  function cThings(src, file) {
    const code = src.replace(/^[ \t]*#.*(?:\\\r?\n.*)*$/gm, (m) => m.replace(/[^\n]/g, ' '));
    const lineAt = lineFinder(code);
    const out = [];
    for (const m of code.matchAll(/(?:^|\n)[ \t]*(typedef\s+)?(struct|union|enum)\b\s*(\w+)?\s*\{/g)) {
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const open = m.index + m[0].length - 1;
      const close = braceEnd(code, open);
      if (close < 0) continue;
      const alias = m[1] ? (code.slice(close + 1, close + 200).match(/^\s*(\w+)/) || [])[1] : null;
      const name = alias || m[3];
      if (!name) continue;
      const doc = cDocAbove(code, at);
      const t = { kind: m[2] === 'enum' ? 'choices' : 'record', name, ...(m[3] && m[3] !== name ? { tag: m[3] } : {}), file, lines: [lineAt(at), lineAt(close)], ...(doc ? { doc } : {}), knows: [], choices: [] };
      const body = code.slice(open + 1, close);
      if (m[2] === 'enum') {
        t.choices = enumNames(splitParams(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')).map((x) => (x.trim().match(/^(\w+)/) || [])[1]).filter(Boolean)).map((n) => words(n));
      } else {
        for (const { head } of members(body)) {
          const fp = head.match(/\(\s*\*\s*(\w+)\s*\)\s*\(/); // a function pointer field: int (*compare)(int, int)
          if (fp) { t.knows.push(know(fp[1], null, null, {})); continue; }
          const d = head.replace(/\s*:\s*\d+\s*$/, '').match(/^((?:(?:const|unsigned|signed|struct|enum|union|volatile|long|short)\s+)*[A-Za-z_]\w*)\s*((?:\*\s*)*)(\w+)\s*((?:\[[^\]]*\]\s*)*)((?:,\s*\**\s*\w+\s*(?:\[[^\]]*\])*)*)$/);
          if (!d) continue;
          const type = (base, stars, arr) => `${base.replace(/\b(?:const|struct|enum|union|volatile)\s+/g, '').trim()}${stars ? '*' : ''}${arr ? '[]' : ''}`;
          t.knows.push(know(d[3], cKind(type(d[1], d[2].trim(), d[4].trim())), null, {}));
          for (const more of d[5].split(',').map((x) => x.trim()).filter(Boolean)) { const n = more.match(/^(\**)\s*(\w+)\s*(\[[^\]]*\])?/); if (n) t.knows.push(know(n[2], cKind(type(d[1], n[1], n[3])), null, {})); }
        }
      }
      out.push(t);
    }
    // Starting values from a C constructor: Library library_new(int max) { Library lib = { .max_books = 3 }; … }
    for (const t of out.filter((x) => x.kind === 'record')) {
      const snake = words(t.name).replace(/ /g, '_');
      const ctor = code.match(new RegExp(`\\b(?:${snake}_(?:new|create|init|make|alloc)|(?:new|create|init|make)_${snake})\\s*\\(([^)]*)\\)\\s*\\{`));
      if (!ctor) continue;
      const open = ctor.index + ctor[0].length - 1;
      const fnBody = code.slice(open + 1, braceEnd(code, open));
      const params = Object.fromEntries(splitParams(ctor[1]).map((p) => [(p.match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/) || [])[1], null]).filter(([n]) => n && n !== 'void'));
      for (const a of fnBody.matchAll(/(?:\.|->)\s*(\w+)\s*=\s*(\{[^{}]*\}|[^,;}\n]+)/g)) {
        const k = t.knows.find((x) => x.name === a[1]);
        if (k && !k.start) k.start = startValue(a[2].trim().replace(/^\{\s*0?\s*\}$/, '{}'), params);
      }
    }
    return out;
  }

  /** C/C++ field types in the reader's terms: int, words (char *, std::string), yes or no, lists, or the type. */
  function cKind(type) {
    const t = String(type).replace(/\bstd::/g, '').replace(/\s+/g, ' ').trim();
    if (/^(?:unsigned |signed )?char\*$|^(?:string|string_view|wstring|sds)$/.test(t)) return 'string';
    if (/^(?:(?:unsigned|signed|long|short) )*(?:int|long|short|unsigned|signed)$|^(?:size_t|ssize_t|off_t|time_t|u?int\d+_t|float|double|long double|uint|uintptr_t|intptr_t)$/.test(t)) return 'int';
    if (/^(?:bool|_Bool)$/.test(t)) return 'bool';
    const list = t.match(/^(?:vector|list|deque|array|set|unordered_set|span)<\s*([\w:]+)\s*(?:,[^>]*)?>$/);
    if (list) return `${list[1].split('::').pop()}[]`;
    if (/^(?:map|unordered_map|multimap)</.test(t)) return 'Map<>';
    if (/^(?:unique_ptr|shared_ptr|optional)<\s*([\w:]+)\s*>$/.test(t)) return t.replace(/^\w+<\s*([\w:]+)\s*>$/, '$1').split('::').pop();
    return t.replace(/\*+$/, '');
  }

  /** C++: classes and structs (Things when they have methods, records otherwise), enums and enum classes (choices). */
  function cppThings(src, file) {
    const code = src.replace(/^[ \t]*#.*(?:\\\r?\n.*)*$/gm, (m) => m.replace(/[^\n]/g, ' '));
    const lineAt = lineFinder(code);
    const out = [];
    const byName = new Map();
    for (const m of code.matchAll(/(?:^|\n)[ \t]*(?:template\s*<[^>{;]*>\s*)?(?:(class|struct|union)\s+(?:alignas\([^)]*\)\s*)?(?:[A-Z_][A-Z0-9_]*\s+)*(\w+)(?:\s+final)?\s*(?::[^{;]*)?|enum(?:\s+(?:class|struct))?\s+(\w+)(?:\s*:\s*[\w:]+)?\s*)\{/g)) {
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const open = m.index + m[0].length - 1;
      const close = braceEnd(code, open);
      if (close < 0) continue;
      const name = m[2] || m[3];
      const doc = cDocAbove(code, at);
      const body = code.slice(open + 1, close);
      if (m[3]) {
        const vals = splitParams(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')).map((x) => (x.trim().match(/^(\w+)/) || [])[1]).filter(Boolean);
        out.push({ kind: 'choices', name, file, lines: [lineAt(at), lineAt(close)], ...(doc ? { doc } : {}), knows: [], choices: enumNames(vals).map((n) => words(n)) });
        continue;
      }
      const t = { kind: 'record', name, file, lines: [lineAt(at), lineAt(close)], ...(doc ? { doc } : {}), knows: [], choices: [], memberRanges: [] };
      let methods = false;
      const inits = {}, params = {};
      for (const mem of members(body)) {
        const head = mem.head.replace(/^(?:(?:public|private|protected)\s*:\s*)+/, '').replace(/\[\[[^\]]*\]\]\s*/g, '').trim();
        if (!head || /^(?:using|friend|typedef|static_assert|template|enum|class|struct|union|namespace|static|constexpr\s+static|inline\s+static|Q_OBJECT)\b/.test(head)) continue;
        const sig = head.replace(/<[^<>]*(?:<[^<>]*>[^<>]*)*>/g, '<>');
        const call = sig.split(/=(?!=)/)[0];
        if (/\(/.test(call) && !/\(\s*\*\s*\w+\s*\)\s*\(/.test(call)) {
          methods = true;
          // The constructor: its parameters, member initializers (: max_(max)), and body assignments start the Thing.
          const ctor = head.match(new RegExp(`^(?:explicit\\s+|constexpr\\s+|inline\\s+)*${name}\\s*\\(([^)]*)\\)\\s*(?:noexcept\\s*)?(?::\\s*([\\s\\S]+))?$`));
          if (ctor) cppCtor(ctor[1], ctor[2], mem.block, params, inits);
          continue;
        }
        let f = head.match(/^((?:(?:const|mutable|volatile|unsigned|signed|long|short|inline)\s+)*[\w:]+(?:<[^;]*>)?(?:\s*[*&]+)?)\s+[*&]*\s*(\w+)\s*(?:\[[^\]]*\])?\s*(?:=\s*([\s\S]+))?$/);
        if (f) { t.knows.push(know(f[2].replace(/^m_/, ''), cKind(f[1].replace(/\b(?:const|mutable|volatile|inline)\s+/g, '').replace(/\s*[*&]+$/, '')), f[3] ? cppValue(f[3]) : mem.block != null ? cppValue(`{${mem.block}}`) : null, {})); t.knows[t.knows.length - 1].name = f[2]; continue; }
        if ((f = head.match(/^((?:(?:const|mutable|unsigned|signed|long|short)\s+)*[\w:]+(?:<[^;]*>)?(?:\s*[*&]+)?)\s+[*&]*\s*(\w+)$/)) && mem.block != null) {
          t.knows.push({ ...know(f[2].replace(/^m_/, ''), cKind(f[1]), cppValue(`{${mem.block}}`), {}), name: f[2] });
        }
      }
      // Methods written outside the class (Library::lateFee) and an outside constructor (Library::Library(...) : …).
      for (const d of code.matchAll(new RegExp(`\\b${name}::(~?\\w+)\\s*\\(`, 'g'))) {
        const pOpen = d.index + d[0].length - 1;
        let depth = 0, pClose = -1;
        for (let k = pOpen; k < code.length && k < pOpen + 4000; k++) { if (code[k] === '(') depth++; else if (code[k] === ')' && --depth === 0) { pClose = k; break; } }
        if (pClose < 0) continue;
        const brace = code.indexOf('{', pClose), semi = code.indexOf(';', pClose);
        if (brace < 0 || (semi >= 0 && semi < brace) || /[()]/.test(code.slice(pClose + 1, brace).replace(/:\s*[\s\S]*$/, ''))) continue;
        methods = true;
        const bClose = braceEnd(code, brace);
        t.memberRanges.push([lineAt(d.index), lineAt(bClose >= 0 ? bClose : brace)]);
        if (d[1] === name) cppCtor(code.slice(pOpen + 1, pClose), (code.slice(pClose + 1, brace).match(/^\s*(?:noexcept\s*)?:\s*([\s\S]+)$/) || [])[1], bClose > 0 ? code.slice(brace + 1, bClose) : '', params, inits);
      }
      for (const k of t.knows) {
        const v = inits[k.name] ?? inits[k.name.replace(/^m_|_$/g, '')];
        if (v != null) k.start = startValue(cppValue(v), params);
      }
      if (methods || m[1] === 'class') t.kind = 'thing';
      out.push(t); byName.set(name, t);
    }
    return out;
  }
  /** A C++ starting value as the reader's words take it: {} or a std container is empty; nullptr is nothing. */
  function cppValue(v) {
    const s = String(v).trim().replace(/;$/, '');
    if (/^\{\s*\}$|^\(\s*\)$|^(?:std::)?(?:vector|list|deque|map|unordered_map|set|unordered_set|string|array)\s*(?:<[^;]*>)?\s*(?:\{\s*\}|\(\s*\))$/.test(s)) return '{}';
    if (/^\{\s*(.+?)\s*\}$/.test(s) && !/,/.test(s)) return s.slice(1, -1).trim();
    return s.replace(/^(-?\d+(?:\.\d+)?)[uUlLfF]+$/, '$1').replace(/^nullptr$/, 'NULL');
  }
  function cppCtor(paramText, initText, bodyText, params, inits) {
    for (const p of splitParams(paramText || '')) {
      const pm = p.match(/(\w+)\s*(?:\[[^\]]*\])?\s*(?:=\s*(.+))?$/);
      if (pm && pm[1] !== 'void') params[pm[1]] = pm[2] != null ? cppValue(pm[2]) : null;
    }
    for (const it of splitParams(String(initText || '').replace(/\{\s*$/, ''))) {
      const im = it.trim().match(/^(\w+)\s*[({]([\s\S]*)[)}]$/);
      if (im) inits[im[1]] = im[2].trim() || '{}';
    }
    for (const a of String(bodyText || '').matchAll(/(?:this->)?(\w+)\s*=\s*([^;\n]+);/g)) if (inits[a[1]] == null) inits[a[1]] = a[2];
  }

  /** Swift: class, struct, actor (Things or records), enum with case (choices), extension (methods that belong to the type). */
  function swiftThings(src, file) {
    const lineAt = lineFinder(src);
    const out = [];
    const byName = new Map();
    for (const m of src.matchAll(/(?:^|\n)[ \t]*(?:@\w+(?:\([^)\n]*\))?\s+)*(?:(?:public|private|internal|fileprivate|open|final|indirect|nonisolated)\s+)*(class|struct|enum|actor|protocol)\s+(\w+)(?:<[^>{\n]*>)?[ \t]*(?::[ \t]*([^{\n]+?))?[ \t]*\{/g)) {
      if (m[1] === 'protocol') continue; // a contract other types promise to keep, not a Thing
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const open = m.index + m[0].length - 1;
      const close = braceEnd(src, open);
      if (close < 0) continue;
      const doc = docAbove(src, at);
      const body = src.slice(open + 1, close);
      const t = { kind: m[1] === 'enum' ? 'choices' : 'record', name: m[2], file, lines: [lineAt(at), lineAt(close)], ...(doc ? { doc } : {}), knows: [], choices: [], memberRanges: [] };
      const mems = members(body, { newlines: true });
      if (m[1] === 'enum') {
        for (const { head } of mems) {
          const c = head.match(/^(?:indirect\s+)?case\s+([\s\S]+)$/);
          if (!c) continue;
          for (const part of splitParams(c[1])) {
            const v = part.trim().match(/^(\w+)\s*(?:\([^)]*\))?\s*(?:=\s*(.+))?$/);
            if (v) t.choices.push(v[2] && /^"/.test(v[2].trim()) ? v[2].trim().slice(1, -1) : words(v[1]));
          }
        }
        out.push(t); byName.set(t.name, t);
        continue;
      }
      let methods = mems.some((x) => /(?:^|\s)func\s/.test(x.head));
      const params = {}, inits = {};
      for (const { head, block } of mems) {
        const h = head.replace(/^(?:@\w+(?:\([^)]*\))?\s+)+/, '');
        if (/(?:^|\s)(?:static|class)\s+(?:let|var|func)\b/.test(h) || /^(?:case|typealias|associatedtype|subscript|deinit|#)/.test(h)) continue;
        const init = h.match(/^(?:(?:public|private|internal|fileprivate|open|convenience|required|override|nonisolated)\s+)*init[?!]?\s*\(([\s\S]*)\)\s*(?:throws\s*)?$/);
        if (init) {
          for (const p of splitParams(init[1])) { const pm = p.match(/^(?:\w+\s+)?(\w+)\s*:\s*[^=]+?(?:=\s*(.+))?$/); if (pm) params[pm[1]] = pm[2] ?? null; }
          for (const a of String(block || '').matchAll(/(?:self\.)?(\w+)\s*=\s*([^\n;]+)/g)) if (inits[a[1]] == null) inits[a[1]] = a[2].trim();
          continue;
        }
        if (/(?:^|\s)func\s/.test(h)) { methods = true; continue; }
        const p = h.match(/^(?:(?:public|private|internal|fileprivate|open|final|lazy|weak|unowned|override|nonisolated)(?:\((?:set|get)\))?\s+)*(let|var)\s+(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*([\s\S]+))?$/);
        if (!p) continue;
        // A computed property (`var total: Int { … }`) is worked out each time: something it can do, not something it knows.
        if (block != null && !p[4] && !/^\s*(?:willSet|didSet)\b/.test(block)) continue;
        t.knows.push(know(p[2], p[3] ? swiftType(p[3]) : null, p[4] != null ? p[4].trim() : null, {}));
      }
      for (const k of t.knows) if (inits[k.name] != null && !k.start) k.start = startValue(inits[k.name], params);
      if (methods || m[1] === 'class' || m[1] === 'actor') t.kind = 'thing';
      out.push(t); byName.set(t.name, t);
    }
    // extension Library { … }: its methods belong to Library (a struct that can do things is a Thing).
    for (const m of src.matchAll(/(?:^|\n)[ \t]*(?:(?:public|private|internal|fileprivate)\s+)?extension\s+([\w.]+)[^{\n]*\{/g)) {
      const t = byName.get(m[1].split('.').pop());
      if (!t) continue;
      const at = m.index + (m[0].startsWith('\n') ? 1 : 0);
      const close = braceEnd(src, m.index + m[0].length - 1);
      if (close < 0) continue;
      t.memberRanges.push([lineAt(at), lineAt(close)]);
      if (t.kind === 'record' && /(?:^|\s)func\s/.test(src.slice(at, close))) t.kind = 'thing';
    }
    return out;
  }
  /** Swift types as the shared kind words read them: [Book] is a list, [String: Int] a lookup table, Int? optional. */
  function swiftType(type) {
    const t = String(type).trim();
    let m;
    if ((m = t.match(/^\[\s*([^:\]]+?)\s*\]$/))) return `${m[1]}[]`;
    if (/^\[[^\]]*:[^\]]*\]$/.test(t)) return 'Map<>';
    return t;
  }

  return function thingsFor(language, src, file) {
    if (language === 'c') return cThings(src, file);
    if (language === 'cpp') return cppThings(src, file);
    if (language === 'swift') return swiftThings(src, file);
    if (language === 'go') return goThings(src, file);
    if (language === 'rust') return rustThings(src, file);
    if (language === 'ruby') return rubyThings(src, file);
    if (['java', 'csharp', 'kotlin', 'php'].includes(language)) return curlyThings(src, file, language);
    return [];
  };
}
