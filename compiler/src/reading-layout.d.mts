import type { ThunderModel, Thing, Member } from './model.d.mts';

export const READING_LAYOUT_SCHEMA: 'thunder-reading-layout-v1';
export const READING_LABELS: Readonly<{
  thing: string; knows: string; can: string; starts: (label: string) => string; startsWithKnows: (label: string) => string;
  record: string; choices: string; recordSymbol: string; choicesSymbol: string; things: string; data: string;
  give: string; getBack: string; stops: string; givesNothing: string; getsNothing: string; partOf: (label: string) => string; io: string; actions: string;
  edges: Readonly<Record<'yes' | 'no' | 'each' | 'done' | 'error' | 'nested' | 'case', string>>;
  openLine: (line: number) => string; openRule: string;
  details: Readonly<{
    stops: string; noStops: string; noInputs: string; nothingBack: string; changes: string; answers: string; limits: (fact: string) => string;
    limitsHow: string; steps: string; reliesOn: string; usedBy: string; openQuestions: string; always: string; otherwise: string;
    when: (w: string) => string; usedOn: string; atAGlance: string;
  }>;
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
  /** text: what the code declares; items: that, else the Flow's end steps (what to draw). */
  getBack: { heading: string; text: string | null; items: string[]; empty: string };
  stops: { heading: string; items: { text: string; line: number | null }[] };
  /** The Thing it belongs to, to link back to its card. */
  partOf: { id: string; text: string } | null;
}
/** An action or rule that belongs to no Thing (a plain function), listed in the Big Picture as a door to open. */
export interface MemberEntryLayout { kind: 'member'; id: string; label: string; symbol: ThunderSymbolId; doc: string | null }
export interface ReadingLayout {
  schema: 'thunder-reading-layout-v1';
  focus: { kind: 'app' | 'file' | 'thing' | 'member' | 'unknown'; id: string | null };
  sections: Array<{ id: 'things'; heading: string; cards: ThingCardLayout[] } | { id: 'data'; heading: string; cards: DataCardLayout[] } | { id: 'io'; heading: string; cards: IOBoxesLayout[] } | { id: 'actions'; heading: string; cards: MemberEntryLayout[] }>;
}
export interface When { question: string; answer: string }
export interface DetailsLayout {
  id: string | null; title: string | null; heading: string;
  stats: { id: 'inputs' | 'steps' | 'stops' | 'changes' | 'reliesOn' | 'notExplained'; count: number; text: string }[];
  give: { heading: string; items: { label: string; lines: number[] }[]; empty: string } | null;
  getBack: { heading: string; items: { text: string; line: number | null; when: When[] | null }[]; empty: string } | null;
  stops: { heading: string; items: { error: string; message: string | null; line: number | null; when: When[] }[]; empty: string } | null;
  changes: { heading: string; items: { text: string; does: string | null; line: number | null; when: When[] }[] } | null;
  answers: { heading: string; items: { answer: string; when: string }[] } | null;
  limits: { heading: string; note: string; items: { range: string; answer: string }[] } | null;
  steps: { heading: string; items: { id: string; text: string; does: string | null; mark: string | null; depth: number; line: number | null; notExplained: boolean; via: string | null }[] } | null;
  reliesOn: { heading: string; items: { id: string; label: string; symbol: ThunderSymbolId; says: string }[] } | null;
  usedBy: { heading: string; items: { id: string; label: string }[] } | null;
  openQuestions: { heading: string; items: string[] } | null;
  source: string | null;
}
/** What a Flow edge says, or null for a plain next step. */
export function flowEdgeLabel(edge: { label?: string | null; text?: string }): string | null;
/** Details sorted for drawing; `view` is readLevel(model, 'details', memberId). */
export function detailsLayout(view: Record<string, any>): DetailsLayout;
export function memberSymbolId(member: { kind: string }): ThunderSymbolId;
export function thingCard(model: ThunderModel, thing: Thing): ThingCardLayout;
export function dataCard(thing: Thing): DataCardLayout;
export function ioBoxes(model: ThunderModel, member: Member): IOBoxesLayout;
/** The Big Picture, zoomed by focus: none or a file (Things, then records, then choices), a Thing (its card, then its file's Data), or an action/rule (its IO boxes). */
export function readingLayout(model: ThunderModel, options?: { focus?: string | null }): ReadingLayout;
