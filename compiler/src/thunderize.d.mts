// thunderize-v1: a whole app written in Thunder Text (see src/thunderize.mjs).
export const THUNDERIZE_SCHEMA: 'thunderize-v1';
export const THUNDER_TEXT_EXT: '.thunder-text';
export interface ThunderizedFile {
  path: string; language: string; out: string; text: string;
  counts: { actions: number; rules: number; functions: number; notReadYet: number; failures: number };
  items: { name: string; line: number; element: string; title: string; route?: string }[];
}
export function thunderizeFile(path: string, source: string, language?: string): ThunderizedFile;
export function thunderizeFiles(files: { path: string; source: string; size?: number }[], options?: { name?: string }): {
  schema: 'thunderize-v1'; name: string; languages: string[]; index: string; files: ThunderizedFile[];
  counts: { files: number; actions: number; rules: number; functions: number; notReadYet: number };
  skipped: { path: string; reason: string }[];
};
