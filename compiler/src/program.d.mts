// Types for @skillstech/thunderlang/program (src/program.mjs). Results are plain objects; see docs/core.md.
export interface CoreDiagnostic { code: string; line: number; message: string; hint?: string; [k: string]: unknown }
export interface CoreResult { ok: boolean; program?: unknown; info?: unknown; diagnostics: CoreDiagnostic[]; file?: string; module?: string; kind?: string; [k: string]: unknown }
export interface RunOutput { status: number; stdout: string; stderr: string; [k: string]: unknown }
export type ReadText = ((path: string, cwd: string) => string) | null;
export const CORE_VERSION: string;
export const CODES: Record<string, unknown>;
export function compileCore(source: string, options?: { file?: string; imported?: unknown[]; srcModules?: unknown[] }): CoreResult;
export function diagnosticsText(result: CoreResult): string;
export function parseCore(source: string, ...rest: unknown[]): unknown;
export function checkCore(...args: unknown[]): unknown;
export function formatCore(source: string, options?: { width?: number }): unknown;
export function formatDiagnostic(...args: unknown[]): string;
export function runInProcess(options: { entry: CoreResult; cwd: string; deeper?: boolean; readText?: ReadText }): RunOutput;
export function recordedRun(options: { entry: CoreResult; cwd: string; readText?: ReadText }): unknown;
export function testInProcess(options: { results: CoreResult[]; cwd: string; deeper?: boolean; readText?: ReadText }): unknown;
export interface ScreenAppHandle { render(): unknown; readonly screen: string | null; press(label: string, nth?: number): { off: boolean; tree: unknown }; type(label: string, text: string, nth?: number): { tree: unknown } }
/** The same handle, by the name apps expect. */
export type ScreenApp = ScreenAppHandle;
export function screenApp(options: { entry: CoreResult; cwd?: string; readText?: ReadText }): ScreenAppHandle;
export function screenOutline(tree: unknown, indent?: string): string;
export function toPython(program: unknown, info: unknown, options?: { source?: string; imports?: unknown[] }): string;
export function toTypeScript(program: unknown, info: unknown, options?: { source?: string; imports?: unknown[] }): string;
export function toCSharp(program: unknown, info: unknown, options?: { source?: string; module?: string; namespace?: string; imports?: unknown[] }): string;
export function toJava(program: unknown, info: unknown, options?: { source?: string; module?: string; imports?: unknown[]; pkg?: string }): string;
export function toGo(program: unknown, info: unknown, options: { source?: string; module?: string; ns: unknown }): string;
export function goNamespaces(results: CoreResult[]): Map<string, unknown>;
export function toRust(program: unknown, info: unknown, options?: { source?: string; imports?: unknown[] }): string;
export function toReact(program: unknown, info: unknown, options?: { source?: string }): string;
export function hasScreens(info: unknown): boolean;
export function pythonToCore(source: string): { core: string; functions: Array<{ name: string; exact: boolean }>; [k: string]: unknown };
