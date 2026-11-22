"use client";

import { useRef, type ReactNode } from "react";
import { HighlightedSource } from "@/lib/highlight";

/**
 * An editable ThunderLang text area that shows the shared syntax colors. A real <textarea> keeps
 * typing, selection, accessibility, and undo native; its text is transparent and a highlighted copy
 * sits behind it, scrolled in step.
 */
export function ThunderEditor({
  id,
  value,
  onChange,
  describedBy,
  invalid,
  minRows = 8,
  maxRows = 26,
  highlight,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  describedBy?: string;
  invalid?: boolean;
  minRows?: number;
  maxRows?: number;
  /** Optional renderer for another notation's colors (defaults to ThunderLang). */
  highlight?: (source: string) => ReactNode;
}) {
  const layer = useRef<HTMLPreElement>(null);
  const text = "p-4 font-mono text-[13px] leading-6 sm:text-sm";
  return (
    <div className="relative">
      <pre ref={layer} aria-hidden="true" className={`pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre text-haze-200 ${text}`}>
        {highlight ? highlight(value + "\n") : <HighlightedSource source={value + "\n"} />}
      </pre>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (!layer.current) return;
          layer.current.scrollTop = e.currentTarget.scrollTop;
          layer.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        maxLength={20000}
        rows={Math.max(minRows, Math.min(maxRows, value.split("\n").length + 1))}
        wrap="off"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ colorScheme: "dark", scrollbarWidth: "thin", scrollbarColor: "#394150 #080B14" }}
        className={`relative block w-full resize-y overflow-auto bg-transparent text-transparent caret-haze-100 selection:bg-gold-400/35 selection:text-transparent focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-gold-300 ${text}`}
      />
    </div>
  );
}
