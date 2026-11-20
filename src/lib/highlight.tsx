import { Fragment } from "react";
import { tokenizeLine } from "./thunder-tokens";
import { tokenizeCode, type CodeLang } from "./code-tokens";

function render(tokens: { text: string; cls?: string }[]) {
  return tokens.map((t, i) => (t.cls ? <span key={i} className={t.cls}>{t.text}</span> : <Fragment key={i}>{t.text}</Fragment>));
}

export function HighlightedLine({ line }: { line: string }) {
  return <>{render(tokenizeLine(line))}</>;
}

/** A whole ThunderLang source, newline-joined (for <pre> blocks and the editor overlay). */
export function HighlightedSource({ source }: { source: string }) {
  return (
    <>
      {source.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {render(tokenizeLine(line))}
        </Fragment>
      ))}
    </>
  );
}

/** Generated TypeScript / Python / Go / Rust / C# / Java, in the same palette. */
export function HighlightedCode({ source, lang }: { source: string; lang: CodeLang }) {
  return <>{render(tokenizeCode(source, lang))}</>;
}
