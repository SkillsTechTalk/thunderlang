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
