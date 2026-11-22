import { Fragment } from "react";
import { tokenizeLine } from "./thunder-tokens";
import { tokenizeCode, type CodeLang } from "./code-tokens";
import { tokenizePlain } from "./plain-tokens";

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

/** Plain ThunderLang (.thunder-plain), colored by kind of word. */
export function HighlightedPlain({ source }: { source: string }) {
  return (
    <>
      {tokenizePlain(source).map((line, i) => (
        <Fragment key={i}>
          {i > 0 && "\n"}
          {render(line)}
        </Fragment>
      ))}
    </>
  );
}

/** One phrase colored with the vocabulary of a whole plain contract (input names, outcomes). */
export function HighlightedPlainPhrase({ context, phrase }: { context: string; phrase: string }) {
  const lines = tokenizePlain(`${context}\n  ${phrase}`);
  const last = lines[lines.length - 1];
  return <>{render(last.length && !last[0].text.trim() ? last.slice(1) : last)}</>;
}
