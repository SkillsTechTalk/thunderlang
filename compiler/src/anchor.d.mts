export const ANCHOR_SCHEMA: 'thunder-anchor-v1';
export interface Span { startLine: number; endLine: number; start?: number; end?: number; exact: 'offset' | 'lines' }
export function spanRange(source: string, span: Span): [number, number];
export function spanText(source: string, span: Span): string;
export function replaceSpan(source: string, span: Span, replacement: string): string;
export function editStep(args: { source: string; language?: string; file?: string; functionName: string; line?: number | null; path: number[]; replacement: string }):
  | { ok: true; source: string; problems: []; change: { startLine: number; endLine: number; before: string; after: string; startOffset: number; linesBefore: number }; reread: { kind: string; says: string } }
  | { ok: false; source: string; problems: string[] };
export function anchorReport(source: string, opts?: { language?: string; file?: string }): {
  schema: 'thunder-anchor-v1'; language: string; coverage: number;
  functions: Array<{ name: string; line: number; coverage: number; codeLines: number; missing: number[]; steps: Array<{ path: string; kind: string; says: string; span: Span }> }>;
};
