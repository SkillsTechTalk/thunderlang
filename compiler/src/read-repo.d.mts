import type { ReadItem, ReadKind } from './read.mjs';
export interface RepoItem extends ReadItem { file: string; language: string }
export interface RepoFacet { name: string; decisions: string[] }
export interface RepoReading {
  schema: 'thunder-repo-reading-v1';
  files: Array<{ path: string; language: string; counts: Record<ReadKind | 'partial', number> }>;
  items: RepoItem[];
  counts: Record<ReadKind | 'partial' | 'guarded' | 'route', number>;
  languages: Record<string, number>;
  folders: Record<string, number>;
  answers: RepoFacet[];
  inputs: RepoFacet[];
  skipped: Array<{ path: string; reason: string }>;
}
export interface RepoFilter { query?: string; kinds?: Array<ReadKind | 'route' | 'guard'>; status?: string[]; languages?: string[]; path?: string; answer?: string; input?: string }
export const READ_REPO_SCHEMA: 'thunder-repo-reading-v1';
export const READ_SKIP_DIRS: Set<string>;
export function readableLanguage(path: string, source?: string): string | null;
/** The language or format Thunder reads for a file, from its path and (when needed) its source: its first ~2 KB for a format known by its content, and a `.h` header is C++ when it uses classes, namespaces, templates, or `::`. */
export function readableFile(path: string, source?: string): string | null;
export const READ_DOT_DIRS: Set<string>;
export function isShellScript(source: string): boolean;
export function readRepo(files: Array<{ path: string; source: string; size?: number }>, options?: { maxFileBytes?: number; maxFiles?: number }): RepoReading;
export function searchRepo(index: RepoReading, filter?: RepoFilter): RepoItem[];
export function groupByFile(items: RepoItem[]): Array<{ file: string; language: string; items: RepoItem[] }>;

/** A file, optionally carrying the reading readFiles attached (or the error reading it gave). */
export interface ReadableFile { path: string; source?: string; size?: number; reading?: import('./read.d.mts').Reading; readError?: string }
/** Read every file once; thunderModel, thunderizeFiles, and sameMeaning reuse each file's `reading`. */
export function readFiles<T extends ReadableFile>(files: T[]): (T & { reading?: import('./read.d.mts').Reading; readError?: string })[];
/** A file's reading: the attached one, or a fresh one. */
export function readingOf(file: ReadableFile, language?: string): import('./read.d.mts').Reading;
