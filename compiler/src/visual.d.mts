// thunder-visual-v1: the visual grammar of Thunder V1 (see src/visual.mjs and docs/spec.md).
import type { ReadItem, ReadStep } from './read.mjs';

export const VISUAL_SCHEMA: 'thunder-visual-v1';
export const PRINCIPLE: string;
export type ColorRole = 'structure' | 'question' | 'fact' | 'comparison' | 'amount' | 'outcome' | 'name' | 'failure' | 'pass' | 'fail' | 'unread';
export type ElementKind = 'app' | 'area' | 'file' | 'data-shape' | 'action' | 'decision' | 'function' | 'not-read' | 'error' | 'test' | 'event' | 'source' | 'resource' | 'permission' | 'setting' | 'pipeline' | 'image-build';
export type Provenance = 'from-code' | 'confirmed' | 'authors-note' | 'ai-summary' | 'not-read';
export type Status = 'available' | 'partial' | 'planned';

export const FORMS: { id: 'picture' | 'text' | 'meaning' | 'source'; name: string; role: 'main' | 'detail' | 'model' | 'evidence'; says: string }[];
export const ZOOM: { level: 0 | 1 | 2 | 3 | 4 | 5; name: string; from: string; element: ElementKind; atlas: 'Z0' | 'Z1' | 'Z2' | 'Z3' | 'Z4' }[];
export const COLORS: Record<ColorRole, { hex: string; name: string; for: string }>;
export const LINES: { solid: string; dashed: string };
export const PROVENANCE: Record<Provenance, { label: string; line: 'solid' | 'dashed'; says: string }>;
export const STEP_MARKS: Record<ReadStep['kind'] | 'restates', { mark: string; label: string; color: ColorRole; show: 'words' | 'code'; line?: 'dashed' }>;
export const ELEMENTS: Record<ElementKind, { zoom: number; name: string; shape: string; status: Status; shows: string; text: string; badge?: string; mark?: string; color?: ColorRole; line?: 'dashed' }>;
export const LANGUAGES: Record<string, { name: string; status: Status; action: string; decision: string; doc: string; 'data-shape'?: string; event?: string; steps?: string; category?: 'application' | 'infrastructure' | 'delivery'; resource?: string; permission?: string; setting?: string }>;
export const RULES: string[];

export interface Visual {
  element: ElementKind; shape: string; line: 'solid' | 'dashed'; title: string;
  provenance: Provenance; mark?: string; color?: ColorRole; note?: string;
  badge?: { kind: 'route' | 'when'; text: string };
  doc?: { text: string; provenance: 'authors-note' };
}
export function visualFor(item: ReadItem): Visual;
export function visualForStep(step: ReadStep): { mark: string; label: string; color: ColorRole; show: 'words' | 'code'; line: 'solid' | 'dashed'; text: string };
export function thunderText(item: ReadItem): string;
export type SymbolId = 'app' | 'area' | 'file' | 'thing' | 'data' | 'record' | 'choices' | 'action' | 'rule' | 'steps' | 'setup' | 'stop' | 'not-read' | 'resource' | 'permission';
export const SYMBOLS: Record<SymbolId, { name: string; says: string; color: ColorRole; paths: string[]; circles?: [number, number, number][]; fill?: boolean; dashed?: boolean; beginner?: boolean; group?: string }>;
export type Does = 'start' | 'find' | 'keep-only' | 'check' | 'decide' | 'calculate' | 'save' | 'send' | 'redirect' | 'ask' | 'repeat' | 'answer' | 'stop' | 'do' | 'code' | 'when';
export const DOES: Record<Does, { label: string; mark: string; color: ColorRole; dashed?: boolean; symbol?: SymbolId }>;
export const BEGINNER: SymbolId[];
/** The five reading levels, in order: how deep you read something. */
export const LEVELS: { id: 'big-picture' | 'flow' | 'details' | 'text' | 'original'; name: string; question: string; shows: string; form: 'picture' | 'words' | 'evidence' }[];
/** Places: where you are in an app (App, Area, File, Action, Rule, Original). Same as ZOOM. */
export const PLACES: typeof ZOOM;
export const THUNDER_VISUAL: {
  schema: 'thunder-visual-v1'; principle: string; forms: typeof FORMS; levels: typeof LEVELS; places: typeof ZOOM; zoom: typeof ZOOM; colors: typeof COLORS; lines: typeof LINES;
  provenance: typeof PROVENANCE; steps: typeof STEP_MARKS; elements: typeof ELEMENTS; languages: typeof LANGUAGES; rules: string[];
  symbols: typeof SYMBOLS; does: typeof DOES; beginner: SymbolId[];
};
export function thunderTokens(line: string): { text: string; role: ColorRole | null }[];
