// A small HCL reader (Terraform's language), no library: a file is a body of attributes (`name = value`) and blocks
// (`resource "type" "name" { … }`), each with its lines and the comment written just above it. Values are parsed by
// infra-expr.mjs. A block Thunder cannot parse is kept as an error with its line and skipped, never guessed.
import { tokenize, lineIndex, Parser, ParseError } from './infra-expr.mjs';

/** Comments that end right above `line`, joined (an author's note), or ''. */
export function docAbove(comments, line) {
  const byEnd = new Map(comments.map((c) => [c.endLine, c]));
  const out = [];
  for (let l = line - 1; byEnd.has(l); l = byEnd.get(l).line - 1) out.unshift(byEnd.get(l).text);
  return out.filter((t) => t && !/^(disable-|tflint-ignore|checkov:|tfsec:|trivy:)/.test(t)).join(' ').trim();
}

/**
 * Parse HCL source. Returns { body, comments, errors }: body items are
 *   { kind: 'attr', name, value, line, endLine }
 *   { kind: 'block', type, labels, body, line, endLine, doc? }
 * and errors are [{ line, why }] for top-level blocks that could not be parsed (they are skipped).
 */
export function parseHcl(src) {
  const text = String(src ?? '').replace(/^﻿/, '');
  const lineAt = lineIndex(text);
  const { toks, comments } = tokenize(text, 'hcl', 0, text.length, lineAt);
  const p = new Parser(text, toks, 'hcl', lineAt);
  const errors = [];
  const body = [];
  for (;;) {
    p.newlines();
    if (p.peek().k === 'eof') break;
    const start = p.i;
    try { body.push(item(p, comments)); }
    catch (e) {
      if (!(e instanceof ParseError)) throw e;
      errors.push({ line: e.line, why: e.why });
      p.i = resync(toks, start);
    }
  }
  return { body, comments, errors, lineAt, src: text };
}

/** Past the end of the top-level item that starts at token `i` (its braces matched), for skipping one that failed. */
function resync(toks, i) {
  let depth = 0, seen = false;
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === 'eof') return i;
    if (t.k === 'p' && (t.v === '{' || t.v === '[' || t.v === '(')) { depth++; seen = true; }
    else if (t.k === 'p' && (t.v === '}' || t.v === ']' || t.v === ')')) { depth--; if (depth <= 0 && seen) return i + 1; }
    else if (t.k === 'nl' && depth <= 0 && !seen) return i + 1;
  }
  return i;
}

function body(p, comments) {
  const out = [];
  return p.withNl(false, () => {
    for (;;) {
      p.newlines();
      const t = p.peek();
      if (t.k === 'eof') throw new ParseError('A block is not closed', p.lineOf(t));
      if (t.k === 'p' && t.v === '}') return out;
      out.push(item(p, comments));
    }
  });
}

function item(p, comments) {
  return p.withNl(false, () => {
    const t = p.next();
    if (t.k !== 'id') throw new ParseError(`Expected a name, found "${p.src.slice(t.s, t.e).slice(0, 20)}"`, p.lineOf(t));
    const line = p.lineOf(t);
    if (p.is('=') || p.is(':')) {
      p.next();
      const value = p.expr();
      const end = p.peek();
      if (!(end.k === 'nl' || end.k === 'eof' || (end.k === 'p' && end.v === '}'))) throw new ParseError(`Expected the end of the line after ${t.v} = …`, p.lineOf(end));
      return { kind: 'attr', name: t.v, value, line, endLine: p.lineAt(Math.max(value.s, value.e - 1)) };
    }
    const labels = [];
    while (p.peek().k === 'str' || p.peek().k === 'id') {
      const l = p.next();
      labels.push(l.k === 'str' ? p.string(l).v ?? p.src.slice(l.s + 1, l.e - 1) : l.v);
    }
    p.expect('{');
    const inner = body(p, comments);
    const close = p.expect('}');
    const doc = docAbove(comments, line);
    return { kind: 'block', type: t.v, labels, body: inner, line, endLine: p.lineOf(close), ...(doc ? { doc } : {}) };
  });
}

/** Attributes of a body by name, and its blocks by type. */
export const attrOf = (bodyItems, name) => bodyItems?.find((x) => x.kind === 'attr' && x.name === name);
export const blocksOf = (bodyItems, type) => (bodyItems ?? []).filter((x) => x.kind === 'block' && x.type === type);
