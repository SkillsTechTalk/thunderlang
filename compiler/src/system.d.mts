// The whole system: calls across files and services (see src/system.mjs).
import type { ThunderModel, AreaCalls } from './model.d.mts';
/** Add cross-file 'uses' links, 'sends-to' service links, and `notLinked` to a model (thunderModel does this). */
export function linkSystem(model: ThunderModel, files: { path: string; source: string }[]): ThunderModel;
/** Which areas call which. */
export function callsSummary(model: ThunderModel): AreaCalls[];
/** A file's area: its folder, two levels deep, or "(top)". */
export function areaOf(file: string): string;
/** Every call in a meaning tree, outside the bodies of functions written in it. */
export function callsIn(expr: unknown): { kind: 'call'; callee: unknown; args: unknown[]; new?: true }[];
/** `a.b.c` -> ['a', 'b', 'c']; null when the callee is not a plain path. */
export function calleePath(expr: unknown): string[] | null;
