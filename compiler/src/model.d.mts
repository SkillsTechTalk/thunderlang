// thunder-model-v1: the one meaning every Thunder view is drawn from (see src/model.mjs).
import type { Does } from './visual.mjs';
export const MODEL_SCHEMA: 'thunder-model-v1';
export const THING_LANGUAGES: string[];
export interface FlowNode { id: string; kind: 'start' | 'decision' | 'step' | 'loop' | 'stop' | 'end' | 'code'; text: string; line?: number; lane: number; row: number; does: Does; uses?: string; answer?: boolean; otherwise?: boolean; value?: string; code?: boolean }
export interface FlowEdge { from: string; to: string; label?: 'yes' | 'no' | 'each' | 'next' | 'done' | 'error' }
export interface FlowBlock { id: string; yes?: FlowBlock[]; no?: FlowBlock[]; each?: FlowBlock[]; body?: FlowBlock[]; handlers?: { id: string; blocks: FlowBlock[] }[]; always?: { id: string; blocks: FlowBlock[] } }
/** nodes/edges: the flow as a graph. blocks: the same nodes as a tree, which views draw from. */
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[]; blocks: FlowBlock[] }
export interface Thing { id: string; kind: 'thing' | 'record' | 'choices'; name: string; label: string; doc?: string; file: string; lines: [number, number]; knows: { name: string; label: string; kind: string | null; start: string | null; line: number | null }[]; choices: string[]; can: string[] }
export interface Member { id: string; kind: 'action' | 'rule' | 'steps' | 'setup' | 'not-read'; name: string; label: string; owner?: string; file: string; language: string; lines: [number, number]; doc?: string; route?: string; youGive: string[]; youGetBack?: string; rule?: unknown; question?: string; yesNo?: boolean; flow: Flow }
export interface ThunderModel { schema: 'thunder-model-v1'; name: string; files: { path: string; language: string; purpose?: string }[]; things: Thing[]; members: Member[]; links: { from: string; to: string; kind: 'uses'; node: string }[]; unknowns: { id?: string; file: string; line: number; why: string }[] }
export function thunderModel(files: { path: string; source: string }[], options?: { name?: string }): ThunderModel;
export function flowOf(steps: unknown[], options?: { start?: string; memberIndex?: Map<string, string>; memberLabel?: Map<string, string> }): Flow;
export function ruleFlow(item: unknown, start: string): Flow;
export function askAsQuestion(step: { says: string; code?: string }, ruleLabel?: string): { text: string; flip: boolean };
export function stepDoes(step: unknown): Does;
export function modelText(model: ThunderModel, id: string): string;
export type LevelId = 'big-picture' | 'flow' | 'details' | 'text' | 'original';
export interface LevelItem { id: string; label: string; symbol: string; route?: string }
export interface LevelView {
  level: LevelId; name: string; question: string;
  scope: 'app' | 'thing' | 'member'; id: string | null; title: string; symbol: string; file: string | null; lines: [number, number] | null;
  /** Flow and Details without an action or rule: choose one of these. */
  needsFocus?: true; says?: string; choose?: LevelItem[];
  // Big Picture
  purpose?: string; things?: { id: string; label: string; doc?: string; knows: { label: string; start?: string }[]; can: LevelItem[] }[];
  data?: { id: string; label: string; symbol: string; choices?: string[]; knows: string[] }[];
  actions?: LevelItem[]; rules?: LevelItem[]; loose?: LevelItem[]; unknowns?: ThunderModel['unknowns'];
  route?: string; doc?: string; owner?: { id: string; label: string }; youGive?: string[]; youGetBack?: string;
  uses?: { id: string; label: string }[]; usedBy?: { id: string; label: string }[];
  // Flow
  flow?: Flow;
  // Details
  steps?: { id: string; text: string; does: Does; mark: string; line: number | null; depth: number; via?: string; notExplained?: true }[];
  notExplained?: number; tryable?: boolean; rule?: unknown; source?: string;
  // Text
  text?: string;
  // Original
  language?: string | null;
}
/** What one reading level (LEVELS) shows for the whole model, a Thing, or one action or rule. */
export function readLevel(model: ThunderModel, level: LevelId, focus?: string): LevelView;
