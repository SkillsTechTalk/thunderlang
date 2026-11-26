import type { ThunderModel, Thing, Member } from './model.d.mts';

export const READING_LAYOUT_SCHEMA: 'thunder-reading-layout-v1';
export const READING_LABELS: Readonly<{
  thing: string; knows: string; can: string; starts: (label: string) => string; startsWithKnows: (label: string) => string;
  record: string; choices: string; recordSymbol: string; choicesSymbol: string; things: string; data: string;
  give: string; getBack: string; stops: string; givesNothing: string; getsNothing: string; partOf: (label: string) => string; io: string;
}>;
export type ThunderSymbolId = 'app' | 'area' | 'file' | 'thing' | 'data' | 'record' | 'choices' | 'action' | 'rule' | 'steps' | 'setup' | 'stop' | 'not-read' | 'resource' | 'permission';
export interface KnowsLine { name: string; label: string; detail: string | null; secret?: true; line: number | null }
export interface ThingCardLayout {
  kind: 'thing'; id: string; label: string; doc: string | null; heading: string; symbol: 'thing';
  knows: { heading: string; items: KnowsLine[] };
  can: { heading: string; items: { id: string; label: string; symbol: ThunderSymbolId }[] };
  /** id: the setup member to open, or null when a new one starts with what it knows. */
  starts: { id: string | null; text: string };
}
export interface DataCardLayout {
  kind: 'record' | 'choices'; id: string; label: string; doc: string | null; heading: string;
  symbol: 'record' | 'choices'; symbolLabel: string; choices: string[]; knows: KnowsLine[];
}
export interface IOBoxesLayout {
  kind: 'io'; id: string; label: string; doc: string | null; symbol: ThunderSymbolId;
  give: { heading: string; items: { label: string; kind: string | null }[]; empty: string };
  getBack: { heading: string; text: string | null; empty: string };
  stops: { heading: string; items: { text: string; line: number | null }[] };
  /** The Thing it belongs to, to link back to its card. */
  partOf: { id: string; text: string } | null;
}
export interface ReadingLayout {
  schema: 'thunder-reading-layout-v1';
  focus: { kind: 'app' | 'file' | 'thing' | 'member' | 'unknown'; id: string | null };
  sections: Array<{ id: 'things'; heading: string; cards: ThingCardLayout[] } | { id: 'data'; heading: string; cards: DataCardLayout[] } | { id: 'io'; heading: string; cards: IOBoxesLayout[] }>;
}
export function memberSymbolId(member: { kind: string }): ThunderSymbolId;
export function thingCard(model: ThunderModel, thing: Thing): ThingCardLayout;
export function dataCard(thing: Thing): DataCardLayout;
export function ioBoxes(model: ThunderModel, member: Member): IOBoxesLayout;
/** The Big Picture, zoomed by focus: none or a file (Things, then records, then choices), a Thing (its card, then its file's Data), or an action/rule (its IO boxes). */
export function readingLayout(model: ThunderModel, options?: { focus?: string | null }): ReadingLayout;
