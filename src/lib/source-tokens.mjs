// Editor-style syntax colors for ORIGINAL source code (Python, TypeScript, JavaScript, Java, C#, Go, Rust,
// Kotlin, PHP, Ruby, SQL), so the Original level looks like the code does in an IDE.
//
// Small, dependency-free, and deterministic (a pure function of the text), so server-rendered pages hydrate
// without mismatches. It is for display only: it colors what a reader expects (keywords, strings including
// template and f-strings, comments, numbers, function names, types, decorators), not each language's full
// grammar. Thunder Text has its own colors (thunderTokens in compiler/src/visual.mjs); this never touches it.
//
// Plain .mjs (with source-tokens.d.mts) so `node --test` can check it without a build step.

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const C_CTL = "if else for while do switch case default break continue return throw try catch finally goto";

/** One entry per language: comment markers, string rules, and keyword sets. */
const SPECS = {
  python: {
    line: ["#"], triple: true, prefix: /[rRbBfFuU]{1,2}(?=["'])/y, interpIf: (p) => /f/i.test(p) && "{",
    decl: words("def class lambda import from as global nonlocal async await with pass del self cls"),
    ctl: words("if elif else for while return yield raise try except finally break continue in not and or is assert match case"),
    consts: words("True False None NotImplemented Ellipsis"),
    types: words("int str float bool list dict set tuple bytes object complex frozenset type"),
    defFn: words("def"), defType: words("class"), at: "decorator",
  },
  typescript: {
    line: ["//"], block: ["/*", "*/"], backtick: "template",
    decl: words("const let var function class interface type enum namespace module declare import export from as async await new extends implements public private protected readonly static abstract override get set keyof typeof instanceof satisfies infer is this super void delete yield of in"),
    ctl: words(C_CTL),
    consts: words("true false null undefined NaN Infinity"),
    types: words("string number boolean any unknown never object bigint symbol Array Promise Record Map Set Date Error"),
    defFn: words("function"), defType: words("class interface type enum namespace"), at: "decorator",
  },
  java: {
    line: ["//"], block: ["/*", "*/"], triple: true, quote1: "char",
    decl: words("class interface enum record package import public private protected static final abstract native synchronized transient volatile strictfp extends implements new this super instanceof var sealed permits non-sealed throws assert"),
    ctl: words(C_CTL + " yield"),
    consts: words("true false null"),
    types: words("void int long short byte char boolean float double String Object Integer Long Double Boolean List Map Set Optional BigDecimal"),
    defType: words("class interface enum record"), at: "decorator",
  },
  csharp: {
    line: ["//"], block: ["/*", "*/"], triple: true, quote1: "char", prefix: /(?:\$@|@\$|\$|@)(?=")/y, interpIf: (p) => p.includes("$") && "{", verbatimIf: (p) => p.includes("@"),
    decl: words("using namespace class struct interface enum record public private protected internal static readonly const sealed abstract virtual override new this base var async await partial event delegate operator implicit explicit extern unsafe fixed ref out in params is as typeof sizeof nameof get set init value where"),
    ctl: words(C_CTL + " foreach yield lock checked unchecked when"),
    consts: words("true false null"),
    types: words("void int long short byte sbyte uint ulong ushort char bool float double decimal string object dynamic String Task List Dictionary"),
    defType: words("class struct interface enum record"), attrs: "brackets", pascalFns: true,
  },
  go: {
    line: ["//"], block: ["/*", "*/"], backtick: "raw", quote1: "char",
    decl: words("package import func var const type struct interface map chan go defer select range"),
    ctl: words("if else for switch case default break continue return goto fallthrough"),
    consts: words("true false nil iota"),
    types: words("string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 bool byte rune error any"),
    defFn: words("func"), defType: words("type"), pascalFns: true,
  },
  rust: {
    line: ["//"], block: ["/*", "*/"], quote1: "rust", prefix: /b?r#*(?=")|b(?=["'])/y, rawIf: (p) => p.includes("r"),
    decl: words("fn let mut const static pub use mod crate super self Self impl struct enum trait type where as ref move dyn unsafe extern async await"),
    ctl: words("if else for while loop match return break continue in"),
    consts: words("true false None Some Ok Err"),
    types: words("i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box"),
    defFn: words("fn"), defType: words("struct enum trait type impl"), attrs: "hash", macros: true,
  },
  kotlin: {
    line: ["//"], block: ["/*", "*/"], triple: true, quote1: "char", interpAll: "$",
    decl: words("package import class interface object fun val var typealias data sealed enum annotation companion open abstract override private protected public internal inner lateinit const suspend inline operator infix tailrec by this super is as in out"),
    ctl: words("if else for while do when return break continue throw try catch finally"),
    consts: words("true false null"),
    types: words("Int Long Short Byte Double Float Boolean Char String Unit Any Nothing List Map Set"),
    defFn: words("fun"), defType: words("class interface object typealias"), at: "decorator",
  },
  php: {
    line: ["//", "#"], block: ["/*", "*/"], interpDouble: "$",
    decl: words("function class interface trait enum namespace use extends implements public private protected static final abstract readonly const new fn echo print require require_once include include_once global var instanceof insteadof clone"),
    ctl: words(C_CTL + " elseif foreach as endif endforeach endwhile match yield and or xor"),
    consts: words("true false null TRUE FALSE NULL"),
    types: words("int float string bool array object mixed void callable iterable never self static parent"),
    defFn: words("function fn"), defType: words("class interface trait enum"), attrs: "hash", sigil: /\$[A-Za-z_]\w*/y,
  },
  ruby: {
    line: ["#"], interpDouble: "#{",
    decl: words("def class module self super alias defined? lambda proc require require_relative include extend attr_accessor attr_reader attr_writer private protected public new"),
    ctl: words("if elsif else unless case when then while until for in do end begin rescue ensure raise return break next redo retry yield and or not"),
    consts: words("true false nil"),
    types: words(""),
    defFn: words("def"), defType: words("class module"), sigil: /@@?[A-Za-z_]\w*|\$[A-Za-z_]\w*/y, symbols: true, bang: true,
  },
  sql: {
    line: ["--"], block: ["/*", "*/"], ci: true, quote2: "ident",
    decl: words("select from where insert into values update set delete create table view index drop alter add column primary key foreign references constraint unique default not null as distinct join inner left right full outer cross on using group by order having limit offset union all with returning asc desc begin commit rollback transaction grant revoke if exists replace trigger function procedure returns declare"),
    ctl: words("and or in is like between case when then else end exists any some"),
    consts: words("true false null"),
    types: words("int integer bigint smallint tinyint decimal numeric real float double precision varchar char text date time timestamp timestamptz boolean bool serial uuid json jsonb blob"),
  },
};
SPECS.javascript = SPECS.typescript;

const ALIASES = {
  python: "python", py: "python", typescript: "typescript", ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  javascript: "javascript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  java: "java", csharp: "csharp", "c#": "csharp", cs: "csharp", go: "go", golang: "go", rust: "rust", rs: "rust",
  kotlin: "kotlin", kt: "kotlin", kts: "kotlin", php: "php", ruby: "ruby", rb: "ruby", sql: "sql",
};

/**
 * The language to color, from a language name ("python", "C#"), a file name ("loans.py"), or a label that
 * contains one ("Python, pizza.py"). Null when it is none of the supported languages (shown uncolored).
 */
export function sourceLang(hint) {
  if (!hint) return null;
  const h = String(hint).trim().toLowerCase();
  if (ALIASES[h]) return ALIASES[h];
  const ext = h.match(/\.([a-z]+)\b(?!.*\.[a-z]+\b)/);
  if (ext && ALIASES[ext[1]]) return ALIASES[ext[1]];
  const first = h.match(/^[a-z#]+/);
  return (first && ALIASES[first[0]]) || null;
}

const WS = /\s+/y;
const NUM = /(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[A-Za-z0-9_]*/y;
const IDENT = /[A-Za-z_À-￿][\wÀ-￿]*/y;
const OPS = /[+\-*/%=&|^!<>~?:]+/y;
const PUNC = /[(){}[\],;.]/;

function at(re, src, i) {
  re.lastIndex = i;
  const m = re.exec(src);
  return m ? m[0] : null;
}

/** Index just past the `}` that closes an interpolation opened right before `i` (or the line end). */
function closeBrace(src, i) {
  let depth = 1;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "\n") return j;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return j;
  }
  return src.length;
}

/**
 * Tokens for a whole source, in order. Each token is { text, cls? }; cls is one of the syn-* classes in
 * globals.css. Joining every token's text gives back the exact source.
 */
export function tokenizeSource(source, langHint) {
  const lang = sourceLang(langHint);
  if (!lang) return source ? [{ text: source }] : [];
  return scan(source, SPECS[lang]);
}

function scan(src, spec) {
  const out = [];
  const push = (text, cls) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += text;
    else out.push(cls ? { text, cls } : { text });
  };
  const kwKey = (w) => (spec.ci ? w.toLowerCase() : w);
  let pendingDecl = null; // "fn" | "type": the next identifier is a name being declared
  let lineStart = true; // only whitespace so far on this line (for C# [Attributes])
  let prev = ""; // previous non-space character

  // A string whose opening quote starts at `from` and whose body starts at `i`; pushes tokens, returns the end.
  const string = (from, i, quote, { escapes = true, multiline = false, interp = null, doubled = false }) => {
    let j = i;
    let start = from;
    const flush = (end) => { push(src.slice(start, end), "syn-str"); start = end; };
    while (j < src.length) {
      if (escapes && src[j] === "\\") { j += 2; continue; }
      if (src.startsWith(quote, j)) {
        if (doubled && src.startsWith(quote, j + quote.length)) { j += quote.length * 2; continue; }
        j += quote.length;
        flush(j);
        return j;
      }
      if (src[j] === "\n" && !multiline) break;
      if (interp) {
        const open = interp === "$" ? (src.startsWith("${", j) ? "${" : /\$[A-Za-z_]/.test(src.slice(j, j + 2)) ? "$" : null) : src.startsWith(interp, j) ? interp : null;
        if (open === "{" && src[j + 1] === "{") { j += 2; continue; } // {{ is a literal brace
        if (open === "$") {
          flush(j);
          const name = at(IDENT, src, j + 1);
          push("$" + name, "syn-var");
          j += 1 + name.length;
          start = j;
          continue;
        }
        if (open) {
          flush(j);
          const end = closeBrace(src, j + open.length);
          push(open, "syn-punc");
          for (const t of scan(src.slice(j + open.length, end), spec)) push(t.text, t.cls);
          if (src[end] === "}") push("}", "syn-punc");
          j = end + (src[end] === "}" ? 1 : 0);
          start = j;
          continue;
        }
      }
      j++;
    }
    flush(j);
    return j;
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    let m;

    if ((m = at(WS, src, i))) {
      push(m);
      if (m.includes("\n")) lineStart = true;
      prev = " ";
      i += m.length;
      continue;
    }
    const wasLineStart = lineStart;
    lineStart = false;

    // Attributes: Rust/PHP #[...], C# [Attribute] at the start of a line.
    if (spec.attrs === "hash" && (m = at(/#!?\[[^\]\n]*\]?/y, src, i))) { push(m, "syn-dec"); i += m.length; prev = "]"; continue; }
    if (spec.attrs === "brackets" && wasLineStart && (m = at(/\[[A-Z][\w.]*/y, src, i))) { push("[", "syn-punc"); push(m.slice(1), "syn-dec"); i += m.length; prev = "x"; continue; }

    // Comments.
    if (spec.block && src.startsWith(spec.block[0], i)) {
      const end = src.indexOf(spec.block[1], i + spec.block[0].length);
      const stop = end < 0 ? src.length : end + spec.block[1].length;
      push(src.slice(i, stop), "syn-com");
      i = stop;
      continue;
    }
    const lc = spec.line.find((c) => src.startsWith(c, i));
    if (lc) {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? src.length : end;
      push(src.slice(i, stop), "syn-com");
      i = stop;
      continue;
    }

    // Strings (with an optional prefix such as f"", r"", $"", @"", b"").
    const prefix = spec.prefix ? at(spec.prefix, src, i) || "" : "";
    const q = src[i + prefix.length];
    if (q === '"' || q === "'" || q === "`") {
      const p = prefix;
      const s = i + p.length;
      if (spec.triple && (src.startsWith('"""', s) || src.startsWith("'''", s))) {
        const quote = src.slice(s, s + 3);
        push(p, "syn-str");
        i = string(s, s + 3, quote, { multiline: true, escapes: !spec.verbatimIf?.(p) && spec !== SPECS.kotlin, interp: spec.interpIf?.(p) || spec.interpAll || null });
        prev = '"';
        continue;
      }
      if (q === "`" && spec.backtick) {
        push(p, "syn-str");
        i = string(s, s + 1, "`", { multiline: true, escapes: spec.backtick === "template", interp: spec.backtick === "template" ? "${" : null });
        prev = '"';
        continue;
      }
      if (q === "'" && spec.quote1 === "rust") {
        const char = at(/'(?:\\(?:u\{[\da-fA-F]+\}|x[\da-fA-F]{2}|.)|[^'\\\n])'/y, src, s);
        if (char) { push(p + char, "syn-str"); i = s + char.length; prev = '"'; continue; }
        const life = at(/'[A-Za-z_]\w*/y, src, s);
        if (life && !p) { push(life, "syn-type"); i += life.length; prev = "x"; continue; }
      }
      // SQL "quoted identifiers" are names, not text.
      if (q === '"' && spec.quote2 === "ident" && (m = at(/"(?:[^"\n]|"")*"?/y, src, i))) { push(m); i += m.length; prev = "x"; continue; }
      if (q !== "`") {
        const raw = spec.rawIf?.(p);
        const quote = raw ? '"' + "#".repeat((p.match(/#/g) || []).length) : q;
        push(p, "syn-str");
        const interp = q === '"' ? spec.interpIf?.(p) || spec.interpAll || spec.interpDouble || null : null;
        i = string(s, s + 1, raw ? quote : q, { escapes: !raw && !spec.verbatimIf?.(p) && !(spec.ci && q === "'"), multiline: !!raw || !!spec.verbatimIf?.(p), interp, doubled: !!spec.verbatimIf?.(p) || (spec.ci && q === "'") });
        prev = '"';
        continue;
      }
    }

    // Decorators and annotations (@app.get, @Override), sigil variables ($total, @count), Ruby :symbols.
    if (ch === "@" && spec.at === "decorator" && (m = at(/@[A-Za-z_][\w.]*/y, src, i))) { push(m, "syn-dec"); i += m.length; prev = "x"; continue; }
    if (spec.sigil && (m = at(spec.sigil, src, i))) { push(m, "syn-var"); i += m.length; prev = "x"; continue; }
    if (spec.symbols && ch === ":" && prev !== ":" && !/[\w)\]]/.test(prev) && (m = at(/:[A-Za-z_]\w*[?!]?/y, src, i))) { push(m, "syn-const"); i += m.length; prev = "x"; continue; }

    if (/\d/.test(ch) && (m = at(NUM, src, i))) { push(m, "syn-num"); i += m.length; prev = "0"; continue; }

    if ((m = at(IDENT, src, i))) {
      let word = m;
      if (spec.bang && /[?!]/.test(src[i + word.length] || "") && src[i + word.length + 1] !== "=") word += src[i + word.length];
      const after = src.slice(i + word.length).match(/^\s*(\S)/)?.[1];
      const key = kwKey(word);
      const member = prev === ".";
      let cls;
      if (pendingDecl && !spec.decl.has(key) && !spec.ctl.has(key)) { cls = pendingDecl === "fn" ? "syn-fn" : "syn-type"; pendingDecl = null; }
      else if (!member && spec.ctl.has(key)) cls = "syn-ctl";
      else if (!member && spec.decl.has(key)) cls = "syn-kw";
      else if (spec.consts.has(spec.ci ? key : word)) cls = "syn-const";
      else if (spec.macros && src[i + word.length] === "!" && src[i + word.length + 1] !== "=") { word += "!"; cls = "syn-fn"; }
      else if (after === "(") cls = !spec.ci && !spec.pascalFns && /^_?[A-Z]/.test(word) && /[a-z]/.test(word) ? "syn-type" : "syn-fn"; // Foo(...) builds a Foo
      else if (spec.types.has(key)) cls = "syn-type";
      else if (!spec.ci && /^[A-Z][A-Z0-9_]+$/.test(word)) cls = "syn-const";
      else if (!spec.ci && /^_?[A-Z]/.test(word)) cls = "syn-type";
      if (spec.defFn?.has(key)) pendingDecl = "fn";
      else if (spec.defType?.has(key)) pendingDecl = "type";
      push(word, cls);
      i += word.length;
      prev = "x";
      continue;
    }

    if ((m = at(OPS, src, i))) { push(m, "syn-op"); i += m.length; prev = m[m.length - 1]; continue; }
    if (PUNC.test(ch)) { push(ch, "syn-punc"); i += 1; prev = ch; pendingDecl = null; continue; }
    push(ch);
    i += 1;
    prev = ch;
  }
  return out;
}

/** The same tokens, split into lines (a token that spans lines, such as a block comment, is cut at each newline). */
export function sourceLines(source, langHint) {
  const lines = [[]];
  for (const t of tokenizeSource(source, langHint)) {
    const parts = t.text.split("\n");
    parts.forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(t.cls ? { text: part, cls: t.cls } : { text: part });
    });
  }
  return lines;
}
