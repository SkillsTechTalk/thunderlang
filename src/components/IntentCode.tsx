import { HighlightedLine } from "@/lib/highlight";

/**
 * Lightweight, dependency-free highlighter for ThunderLang's (pre-1.0) syntax.
 * Intentionally simple (keyword + comment + string tinting) for display only; the
 * canonical grammar lives in the compiler (@skillstech/thunderlang), not here.
 */

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
        <code className="font-mono text-haze-200">
          {lines.map((line, i) => (
            <div key={i} className="table-row">
              <span className="table-cell select-none pr-5 text-right text-haze-500">
                {i + 1}
              </span>
              <span className="table-cell whitespace-pre">
                <HighlightedLine line={line} />
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
