// A minimal Language Server for ThunderLang (LSP over stdio). Wraps the compiler's existing
// diagnostics + IntelliSense so ANY LSP-capable editor (VS Code, Neovim, Helix, ...) gets
// live ThunderLang intelligence: diagnostics on open/change, keyword/type completions, and
// hover docs for semantic types and note lenses. Deterministic; no AI. `thunder lsp` starts it.

import { parseIntent } from './parse.mjs';
import { semanticDiagnostics } from './emit.mjs';
import { getCompletions, getHover } from './intellisense.mjs';
import { COMPILER_VERSION } from './emit.mjs';

// LSP CompletionItemKind numbers for the kinds IntelliSense returns.
const COMPLETION_KIND = { keyword: 14, semantic_type: 7, field: 5, snippet: 15, value: 12, block: 14 };
// LSP DiagnosticSeverity: 1 error, 2 warning, 3 info, 4 hint.
const SEVERITY = { error: 1, warning: 2, info: 3 };

// Diagnostics don't carry a source span, so anchor them best-effort: to the line containing
// the quoted subject in the message, else the mission line, else line 0.
function anchorLine(message, lines) {
  const q = String(message || '').match(/"([^"]+)"/);
  if (q) { const i = lines.findIndex((l) => l.includes(q[1])); if (i >= 0) return i; }
  const m = lines.findIndex((l) => /^mission\b/.test(l.trim()));
  return m >= 0 ? m : 0;
}

function toLspDiagnostic(d, lines) {
  const line = anchorLine(d.message, lines);
  const text = lines[line] || '';
  return {
    range: { start: { line, character: 0 }, end: { line, character: Math.max(1, text.length) } },
    severity: SEVERITY[d.level] || 3,
    code: d.code,
    source: 'thunderlang',
    message: d.message + (d.why ? `\n\n${d.why}` : ''),
  };
}

function toLspCompletion(item) {
  const insert = item.insertText || item.label;
  return {
    label: item.label,
    kind: COMPLETION_KIND[item.kind] || 1,
    detail: item.detail || undefined,
    insertText: insert,
    insertTextFormat: /\$\{|\$\d/.test(insert) ? 2 : 1, // 2 = snippet, 1 = plaintext
    sortText: item.sortText || undefined,
  };
}

function toLspHover(out) {
  const h = out && out.hover;
  if (!h) return null;
  const parts = [h.title ? `**${h.title}**` : null, h.description || null];
  if (Array.isArray(h.examples) && h.examples.length) parts.push('```\n' + h.examples.join('\n') + '\n```');
  return { contents: { kind: 'markdown', value: parts.filter(Boolean).join('\n\n') } };
}

/**
 * Start the language server. Reads LSP JSON-RPC (Content-Length framed) from `readable` and
 * writes responses to `writable`. Testable: pass in-memory streams. Returns nothing.
 */
export function startLspServer({ readable = process.stdin, writable = process.stdout } = {}) {
  const docs = new Map(); // uri -> text
  let buffer = Buffer.alloc(0);

  const send = (msg) => {
    const payload = Buffer.from(JSON.stringify(msg), 'utf8');
    writable.write(`Content-Length: ${payload.length}\r\n\r\n`);
    writable.write(payload);
  };
  const respond = (id, result) => send({ jsonrpc: '2.0', id, result });
  const notify = (method, params) => send({ jsonrpc: '2.0', method, params });

  const publish = (uri) => {
    const lines = (docs.get(uri) || '').split('\n');
    let diags;
    try { diags = semanticDiagnostics(parseIntent(docs.get(uri) || '')); } catch { diags = []; }
    notify('textDocument/publishDiagnostics', { uri, diagnostics: diags.map((d) => toLspDiagnostic(d, lines)) });
  };

  const handle = (msg) => {
    switch (msg.method) {
      case 'initialize':
        respond(msg.id, {
          capabilities: {
            textDocumentSync: 1, // full document sync
            completionProvider: { triggerCharacters: [' '] },
            hoverProvider: true,
          },
          serverInfo: { name: 'thunderlang-lsp', version: COMPILER_VERSION },
        });
        break;
      case 'initialized':
        break;
      case 'shutdown':
        respond(msg.id, null);
        break;
      case 'exit':
        process.exit(0);
        break;
      case 'textDocument/didOpen':
        docs.set(msg.params.textDocument.uri, msg.params.textDocument.text || '');
        publish(msg.params.textDocument.uri);
        break;
      case 'textDocument/didChange': {
        const changes = msg.params.contentChanges || [];
        if (changes.length) docs.set(msg.params.textDocument.uri, changes[changes.length - 1].text || '');
        publish(msg.params.textDocument.uri);
        break;
      }
      case 'textDocument/didClose':
        docs.delete(msg.params.textDocument.uri);
        break;
      case 'textDocument/completion': {
        const text = docs.get(msg.params.textDocument.uri) || '';
        const p = msg.params.position;
        let items = [];
        try { items = (getCompletions(text, { line: p.line + 1, column: p.character + 1 }).items || []); } catch { items = []; }
        respond(msg.id, items.map(toLspCompletion));
        break;
      }
      case 'textDocument/hover': {
        const text = docs.get(msg.params.textDocument.uri) || '';
        const p = msg.params.position;
        let hover = null;
        try { hover = toLspHover(getHover(text, { line: p.line + 1, column: p.character + 1 })); } catch { hover = null; }
        respond(msg.id, hover);
        break;
      }
      default:
        if (msg.id != null) respond(msg.id, null); // unknown request -> empty result, keep alive
    }
  };

  readable.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd).toString('ascii');
      const m = header.match(/Content-Length:\s*(\d+)/i);
      if (!m) { buffer = buffer.slice(headerEnd + 4); continue; }
      const len = Number(m[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + len) break; // wait for the rest of the body
      const body = buffer.slice(start, start + len).toString('utf8');
      buffer = buffer.slice(start + len);
      let msg;
      try { msg = JSON.parse(body); } catch { continue; }
      try { handle(msg); } catch { /* one bad message must not kill the server */ }
    }
  });
}
