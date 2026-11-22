"use client";

import Editor from "@monaco-editor/react";
import { THUNDER_KEYWORDS, THUNDER_LOGIC } from "@/lib/thunder-tokens";

/**
 * Monaco editor for ThunderLang. Syntax highlighting + a dark theme, and inline
 * IntelliSense (completions + hover) that call the compiler through /api/assist.
 * The compiler is the single source of truth; this component only renders it.
 */

// Same vocabulary and palette as the site-wide highlighter (src/lib/thunder-tokens.ts).
const KEYWORDS = [...THUNDER_KEYWORDS];
const LOGIC = [...THUNDER_LOGIC];

let registered = false;

function registerIntent(monaco: any) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "intent" });

  monaco.languages.setMonarchTokensProvider("intent", {
    keywords: KEYWORDS,
    logic: LOGIC,
    tokenizer: {
      root: [
        [/^\s*(#|\/\/).*$/, "comment"],
        [/"(?:[^"\\]|\\.)*"?/, "string"],
        [/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/, "id"],
        [/->|=>|>=|<=|==|!=|[<>=]/, "operator"],
        [/-?\d+(?:\.\d+)?/, "number"],
        [/\b(true|false)\b/, "number"],
        [/^\s*[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@logic": "logic", "@default": "identifier" } }],
        [/[a-zA-Z_]\w*(?=\s*:)/, "field"],
        [/[A-Z][A-Za-z0-9_]*/, "type"],
        [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword.soft", "@logic": "logic", "@default": "identifier" } }],
        [/[(),.:]/, "delimiter"],
      ],
    },
  });

  monaco.editor.defineTheme("intent-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B778D", fontStyle: "italic" },
      { token: "keyword", foreground: "C4B5FD", fontStyle: "bold" },
      { token: "keyword.soft", foreground: "A78BFA" },
      { token: "logic", foreground: "F9A8D4", fontStyle: "bold" },
      { token: "operator", foreground: "F472B6" },
      { token: "type", foreground: "67E8F9" },
      { token: "field", foreground: "93C5FD" },
      { token: "id", foreground: "FCD34D" },
      { token: "number", foreground: "FDBA74" },
      { token: "string", foreground: "BEF264" },
      { token: "identifier", foreground: "C7D1E2" },
      { token: "delimiter", foreground: "6B778D" },
    ],
    colors: {
      "editor.background": "#080B14",
      "editorLineNumber.foreground": "#3A4459",
      "editorLineNumber.activeForeground": "#9AA6BD",
      "editor.selectionBackground": "#9A7CF759",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorCursor.foreground": "#EAF0FA",
      "editorIndentGuide.background": "#ffffff10",
    },
  });

  async function assist(model: any, position: any) {
    const res = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: model.getValue(),
        position: { line: position.lineNumber, column: position.column },
      }),
    });
    return res.json();
  }

  const kindMap: Record<string, number> = {
    snippet: monaco.languages.CompletionItemKind.Snippet,
    type: monaco.languages.CompletionItemKind.TypeParameter,
    keyword: monaco.languages.CompletionItemKind.Keyword,
  };

  monaco.languages.registerCompletionItemProvider("intent", {
    triggerCharacters: [" ", ":"],
    async provideCompletionItems(model: any, position: any) {
      let data;
      try {
        data = await assist(model, position);
      } catch {
        return { suggestions: [] };
      }
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = (data.completions || []).map((c: any) => ({
        label: c.label,
        kind: kindMap[c.kind] ?? monaco.languages.CompletionItemKind.Text,
        detail: c.detail,
        insertText: c.insertText,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: c.sortText,
        range,
      }));
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider("intent", {
    async provideHover(model: any, position: any) {
      let data;
      try {
        data = await assist(model, position);
      } catch {
        return null;
      }
      const h = data.hover;
      if (!h) return null;
      const md = [`**${h.title}**`, "", h.description];
      if (h.examples?.length) md.push("", ...h.examples.map((e: string) => `- ${e}`));
      if (h.relatedSuggestions?.length)
        md.push("", "Related:", ...h.relatedSuggestions.map((r: string) => `- ${r}`));
      return { contents: md.map((value) => ({ value })) };
    },
  });
}

export function IntentMonaco({
  value,
  onChange,
  onEditor,
}: {
  value: string;
  onChange: (v: string) => void;
  onEditor?: (editor: any) => void;
}) {
  return (
    <div className="h-[460px] overflow-hidden rounded-2xl border border-white/10">
      <Editor
        height="460px"
        language="intent"
        theme="intent-dark"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        beforeMount={registerIntent}
        onMount={(editor) => onEditor?.(editor)}
        loading={
          <div className="flex h-full items-center justify-center text-xs text-haze-500">
            Loading editor…
          </div>
        }
        options={{
          fontFamily:
            "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          minimap: { enabled: false },
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "off",
          padding: { top: 14, bottom: 14 },
          tabSize: 2,
          renderLineHighlight: "line",
          smoothScrolling: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  );
}
