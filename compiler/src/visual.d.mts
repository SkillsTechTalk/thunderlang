// thunder-visual-v1: the visual grammar of Thunder V1 (see src/visual.mjs and docs/spec.md).
import type { ReadItem, ReadStep } from './read.mjs';

export const VISUAL_SCHEMA: 'thunder-visual-v1';
export const PRINCIPLE: string;
export type ColorRole = 'structure' | 'question' | 'fact' | 'comparison' | 'amount' | 'outcome' | 'name' | 'failure' | 'pass' | 'fail' | 'unread';
export type ElementKind = 'app' | 'area' | 'file' | 'data-shape' | 'endpoint' | 'decision' | 'function' | 'not-read' | 'error' | 'test' | 'event' | 'source';
export type Provenance = 'read-from-code' | 'confirmed' | 'author-says' | 'ai-summary' | 'not-read';
export type Status = 'available' | 'partial' | 'planned';

export const FORMS: { id: 'picture' | 'text' | 'source'; name: string; role: 'main' | 'detail' | 'evidence'; says: string }[];
export const ZOOM: { level: 0 | 1 | 2 | 3 | 4; meaning: string; code: string; element: ElementKind }[];
export const COLORS: Record<ColorRole, { hex: string; name: string; for: string }>;
export const LINES: { solid: string; dashed: string };
export const PROVENANCE: Record<Provenance, { label: string; line: 'solid' | 'dashed'; says: string }>;
export const STEP_MARKS: Record<ReadStep['kind'] | 'restates', { mark: string; label: string; color: ColorRole; show: 'words' | 'code'; line?: 'dashed' }>;
export const ELEMENTS: Record<ElementKind, { zoom: number; name: string; shape: string; status: Status; shows: string; text: string; badge?: string; mark?: string; color?: ColorRole; line?: 'dashed' }>;
export const LANGUAGES: Record<string, { name: string; status: Status; endpoint: string; decision: string; doc: string; 'data-shape': string; event?: string; steps?: string }>;
export const RULES: string[];

export interface Visual {
  element: ElementKind; shape: string; line: 'solid' | 'dashed'; title: string;
  provenance: Provenance; mark?: string; color?: ColorRole; note?: string;
  badge?: { kind: 'route'; text: string };
  doc?: { text: string; provenance: 'author-says' };
}
export function visualFor(item: ReadItem): Visual;
export function visualForStep(step: ReadStep): { mark: string; label: string; color: ColorRole; show: 'words' | 'code'; line: 'solid' | 'dashed'; text: string };
export function thunderText(item: ReadItem): string;
export const THUNDER_VISUAL: {
  schema: 'thunder-visual-v1'; principle: string; forms: typeof FORMS; zoom: typeof ZOOM; colors: typeof COLORS; lines: typeof LINES;
  provenance: typeof PROVENANCE; steps: typeof STEP_MARKS; elements: typeof ELEMENTS; languages: typeof LANGUAGES; rules: string[];
};
