// thunder-expr-v1: the meaning model underneath Thunder's words (see src/meaning.mjs).
export const EXPR_SCHEMA: 'thunder-expr-v1';
export const RENDER_LANGUAGES: string[];

/** A literal value, exactly as the code has it: `value` is the decoded value, `raw` its spelling. */
export interface ExprLiteral { kind: 'literal'; type: 'number' | 'text' | 'bool' | 'null' | 'char' | 'regex' | 'symbol'; value: unknown; raw: string; bytes?: true; flags?: string; /** Text with parts filled in at run time that are kept as written (C# $"…", Kotlin "$x", Ruby "#{x}"). */ interpolated?: true }
/** Text with values in it: `hello ${name}`, f"{name!r}". Parts are text or { expr, conv?, format? }. */
export interface ExprTemplate { kind: 'template'; parts: (string | { expr: Expr; conv?: string; format?: string; selfDoc?: true })[]; raw: string; form?: 'f'; tag?: Expr }
/** A block of statements: the step's own children (a lambda's body, a method in an object). */
export interface ExprBlock { kind: 'block' }

/** An expression or statement tree. Every node has `kind`; what is not understood is `{ kind: 'code', text }`. */
export type Expr =
  | { kind: 'code'; text: string }
  | { kind: 'name'; name: string; typeArgs?: string }
  | ExprLiteral | ExprTemplate
  | { kind: 'member'; object: Expr; property: string; optional?: true; static?: true; typeArgs?: string }
  | { kind: 'index'; object: Expr; index: Expr; optional?: true }
  | { kind: 'slice'; start?: Expr; end?: Expr; step?: Expr }
  | { kind: 'call'; callee: Expr; args: Expr[]; new?: true; optional?: true; typeArgs?: string; parens?: false; init?: { key?: Expr; value: Expr }[] }
  | { kind: 'named'; name: string; value: Expr }
  | { kind: 'spread'; value: Expr; form?: '...' | '*' | '**' | '&' | '..' }
  | { kind: 'hole' }
  | { kind: 'not'; value: Expr }
  | { kind: 'unary'; op: string; value: Expr; postfix?: true }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'compare'; op: string; left: Expr; right: Expr; type?: true }
  | { kind: 'chain'; ops: string[]; operands: Expr[] }
  | { kind: 'logic'; op: 'and' | 'or'; operands: Expr[] }
  | { kind: 'conditional'; test: Expr; then: Expr; else: Expr }
  | { kind: 'array'; items: Expr[]; form?: 'tuple' | 'set' | 'braces'; type?: string; repeat?: Expr }
  | { kind: 'object'; entries: ({ key?: Expr; value: Expr; shorthand?: true; computed?: true; method?: true } | { kind: 'spread'; value: Expr; form?: string })[]; type?: string; form?: string }
  | { kind: 'comprehension'; form: 'list' | 'set' | 'dict' | 'generator'; item: Expr; key?: Expr; clauses: { targets: Expr[]; iter: Expr; conds?: Expr[] }[] }
  | { kind: 'lambda'; params: string[]; body: Expr | ExprBlock; returns?: string; async?: true; form?: string; name?: string; trailing?: true }
  | { kind: 'cast'; value: Expr; type: string; form: string }
  | { kind: 'pattern'; text: string; names: string[] }
  | ExprBlock
  // Statements
  | { kind: 'assign'; op: string; target: Expr; value: Expr; declare?: string; type?: string; mutable?: true }
  | { kind: 'declare'; names: (string | Expr)[]; declare?: string; type?: string; scope?: string }
  | { kind: 'sequence'; items: Expr[] }
  | { kind: 'return'; value?: Expr }
  | { kind: 'throw'; value?: Expr; error?: string; message?: string; cause?: Expr; form?: string }
  | { kind: 'if'; test: Expr; negate?: true; init?: Expr; inline?: true | Expr; elvis?: true }
  | { kind: 'loop'; form: 'each' | 'while' | 'until' | 'for' | 'forever' | 'do-while'; targets?: Expr[]; iterable?: Expr; test?: Expr; init?: Expr; update?: Expr; keys?: true; range?: true; declare?: string; type?: string }
  | { kind: 'switch'; form?: string; subject?: Expr; init?: Expr }
  | { kind: 'case'; patterns?: Expr[]; default?: true; guard?: Expr }
  | { kind: 'catch'; errors: string[]; as?: string }
  | { kind: 'try' }
  | { kind: 'jump'; jump: 'break' | 'continue' | 'fallthrough'; label?: string }
  | { kind: 'yield'; value?: Expr; delegate?: true; end?: true }
  | { kind: 'defer' | 'go'; value: Expr }
  | { kind: 'delete'; target: Expr }
  | { kind: 'assert'; test: Expr; message?: Expr }
  | { kind: 'with'; items: { value: Expr; as?: Expr }[] }
  | { kind: 'function'; name: string; params: string[]; returns?: string; async?: true; body: ExprBlock }
  | { kind: 'pass' };

/** One whole expression, or null when the text is not exactly one expression the reader understands. */
export function parseExpr(text: string, language?: string): Expr | null;
/** A statement (a step's `expr`). For a statement that opens a block, only its head; never guessed. */
export function parseStatement(text: string, language?: string): Expr;
/** A statement with where each part came from (for running the original code of a part). */
export function parseStatementSpans(text: string, language?: string): { tree: Expr; textOf(node: Expr): string | null; /** [start, end) of a part in `source` (the trimmed text). */ rangeOf(node: Expr): [number, number] | null; source: string } | null;
/** Index of the `}` closing the `{` at `open` (strings, templates, and comments skipped), or -1. */
export function blockEnd(src: string, open: number, language?: string): number;
/** Code for an expression in TypeScript/JavaScript, Python, or Go. Throws when the language cannot say it. */
export function renderExpr(tree: Expr, language: string): string;
/** Code for a statement (a block-opening one with an empty block). Throws when the language cannot say it. */
export function renderStatement(tree: Expr, language: string): string;
/** Every detail as one line of neutral, readable code. */
export function sayFull(tree: Expr): string;
/** What a step's short words leave out: [{ label, text }], empty when they say everything. */
export function detailParts(step: { says?: string; kind?: string; code?: string; restates?: boolean; expr?: Expr }): { label: string; text: string }[];
/** The short words with every omitted detail after them, or null: "Calls save — with: order, { validate: false }". */
export function detailOf(step: { says?: string; kind?: string; code?: string; restates?: boolean; expr?: Expr }): string | null;
/** Negations, and/or joins, and comparisons in a tree (what the faithfulness gate counts). */
export function exprCounts(tree: Expr): { neg: number; logic: number; compare: number };
/** The tree without spelling (quote style, spacing in types and parameters, layout). */
export function normalizeExpr(tree: Expr): unknown;
/** True when two trees mean the same after normalizing spelling. */
export function sameExpr(a: Expr, b: Expr): boolean;
/** The names and values in a tree, as a reader would look for them in words. */
export function namesIn(tree: Expr): string[];
/** Where a step's words disagree with its tree (a number or text not in the code, a call it does not make). */
export function wordsAgree(step: { says?: string; kind?: string; restates?: boolean; expr?: Expr }): string[];
/** Every node of a tree, depth first. */
export function nodesOf(tree: unknown): Generator<Expr>;
export class Unrenderable extends Error {}
