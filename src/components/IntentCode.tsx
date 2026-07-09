import { Fragment } from "react";

/**
 * Lightweight, dependency-free highlighter for Intent's *draft* syntax.
 * This is intentionally simple (keyword + comment + string tinting), Intent
 * has no compiler yet, so this is illustrative, not a real grammar.
 */

// Block-level keywords in Intent's draft syntax (capitalised, line-leading).
const KEYWORDS = new Set([
  // Mission-level
  "Mission",
  "Goal",
  "Requires",
  "Input",
  "Output",
  "Guarantees",
  "Never",
  "Constraints",
  "Assumptions",
  "Risks",
  "Target",
  "Implementation",
  "Verify",
  "Test",
  "Observe",
  "Secure",
  "Explain",
  "Ownership",
  "Owner",
  "Architecture",
  "Dependencies",
  "Contract",
  "Plan",
  "Proof",
  // Architecture / API / Event
  "Service",
  "Owns",
  "Consumes",
  "Publishes",
  "Database",
  "API",
  "Method",
  "Path",
  "Errors",
  "Event",
  "PublishedBy",
  "ConsumedBy",
  "Payload",
  "Field",
  // Testing
  "Given",
  "When",
  "Then",
  // connective lowercase words
  "is",
  "never",
  "not",
  "use",
  "and",
  "for",
  "to",
  "of",
]);

function highlightLine(line: string, key: number) {
  // Whole-line comment
  const commentMatch = line.match(/^(\s*)(#|\/\/)(.*)$/);
  if (commentMatch) {
    return (
      <span key={key} className="tok-comment">
        {line}
      </span>
    );
  }

  const tokens = line.split(/(\s+|[(),.:>-])/);
  return (
    <Fragment key={key}>
      {tokens.map((tok, i) => {
        if (tok === "") return null;
        if (/^\s+$/.test(tok)) return <Fragment key={i}>{tok}</Fragment>;
        if (KEYWORDS.has(tok)) {
          return (
            <span key={i} className="tok-key">
              {tok}
            </span>
          );
        }
        // Capitalised identifiers → treated as types/entities
        if (/^[A-Z][A-Za-z0-9_]+$/.test(tok)) {
          return (
            <span key={i} className="tok-type">
              {tok}
            </span>
          );
        }
        if (/^[(),.:>-]$/.test(tok)) {
          return (
            <span key={i} className="tok-punc">
              {tok}
            </span>
          );
        }
        return <Fragment key={i}>{tok}</Fragment>;
      })}
    </Fragment>
  );
}

export function IntentCode({
  code,
  filename,
  className = "",
}: {
  code: string;
  filename?: string;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");

  return (
    <div className={`panel overflow-hidden shadow-panel ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-mono text-xs text-haze-400">
          {filename ?? "intent"}
        </span>
      </div>
      <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => (
            <div key={i} className="table-row">
              <span className="table-cell select-none pr-5 text-right text-haze-500">
                {i + 1}
              </span>
              <span className="table-cell whitespace-pre">
                {highlightLine(line, i)}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
