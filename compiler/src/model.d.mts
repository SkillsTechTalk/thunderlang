// thunder-model-v1: the one meaning every Thunder view is drawn from (see src/model.mjs).
import type { Does } from './visual.mjs';
export const MODEL_SCHEMA: 'thunder-model-v1';
export const THING_LANGUAGES: string[];
export interface FlowNode { id: string; kind: 'start' | 'decision' | 'step' | 'loop' | 'stop' | 'end' | 'code'; text: string; line?: number; lane: number; row: number; does: Does; uses?: string; answer?: boolean; otherwise?: boolean; value?: string; code?: boolean; /** A decision with several cases (see FlowBlock.cases). */ cases?: true }
export interface FlowEdge { from: string; to: string; label?: 'yes' | 'no' | 'each' | 'next' | 'done' | 'error' | 'case' | 'nested'; /** On a 'case' edge: the case it takes ("When it is from 90 to 100", "Otherwise", "None of these"). */ text?: string }
export interface FlowBlock { id: string; yes?: FlowBlock[]; no?: FlowBlock[]; each?: FlowBlock[]; body?: FlowBlock[];
  /** A choice among several cases (switch, when, match, select): one side per case, in order. The decision node has `cases: true`. */
  cases?: { label: string; line?: number; blocks: FlowBlock[] }[];
  /** The body is an inner function (a hook, a callback, go/defer): its own sub-flow; the outer flow continues from this step. */
  nested?: true; handlers?: { id: string; blocks: FlowBlock[] }[]; always?: { id: string; blocks: FlowBlock[] } }
/** nodes/edges: the flow as a graph. blocks: the same nodes as a tree, which views draw from. */
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[]; blocks: FlowBlock[] }
export interface Thing { id: string; kind: 'thing' | 'record' | 'choices' | 'resource'; name: string; label: string; doc?: string; file: string; lines: [number, number];
  knows: { name: string; label: string; kind: string | null; start: string | null; line: number | null; /** Worked out when it runs, is built, or is applied. */ computed?: true; /** A secret: named only, its value never shown. */ secret?: true; setting?: true }[]; choices: string[]; can: string[];
  /** Resources (spec section 12): the type exactly as written ('docker-image', 'azurerm_storage_account'). */ resourceType?: string;
  /** Resources: a stable address that matches the same resource across versions ('image:api/Dockerfile'). */ address?: string }
/** Who can do what to which resource (spec section 12). `wide` and `why` are the compiler's call. */
export interface Permission { id: string; who: string; can: string; on: string; wide: boolean; why?: string; says?: string; file: string; line: number }
/** A value the app or infrastructure is given, and where it comes from. Never a secret's value. */
export interface Setting { name: string; source: 'parameter' | 'variable' | 'secret' | 'literal' | 'computed'; secret: boolean; computed?: true; file: string; line: number }
/** What a file says, not advice; a tool decides how serious each one is. */
export interface Fact { id: string; kind: 'write-all-permissions' | 'untrusted-trigger-with-secrets' | 'action-pinned-by-tag' | 'image-not-pinned' | 'runs-as-root' | 'secret-in-plain-env' | 'public-ingress'; says: string; file: string; line: number; /** action-pinned-by-tag: an action made by GitHub itself. */ firstParty?: boolean }
export type LinkKind = 'uses' | 'runs-in' | 'reads-from' | 'sends-to';
export interface Link { from: string; to: string; kind: LinkKind; node?: string; file?: string; line?: number }
export interface Member { id: string; kind: 'action' | 'rule' | 'steps' | 'setup' | 'not-read' | 'pipeline' | 'image-build'; /** Pipelines: when it runs, in words. */ when?: string; name: string; label: string; owner?: string; file: string; language: string; lines: [number, number]; doc?: string; route?: string; youGive: string[]; youGetBack?: string; rule?: unknown; question?: string; yesNo?: boolean; flow: Flow }
export interface ThunderModel { schema: 'thunder-model-v1'; name: string; files: { path: string; language: string; purpose?: string; category: 'application' | 'infrastructure' | 'delivery'; /** Why this file could not be read. */ skipped?: string }[]; things: Thing[]; members: Member[]; links: Link[]; unknowns: { id?: string; file: string; line: number; why: string }[]; permissions: Permission[]; settings: Setting[]; facts: Fact[] }
export function thunderModel(files: { path: string; source: string }[], options?: { name?: string }): ThunderModel;
export function flowOf(steps: unknown[], options?: { start?: string; memberIndex?: Map<string, string>; memberLabel?: Map<string, string> }): Flow;
export function ruleFlow(item: unknown, start: string): Flow;
export function askAsQuestion(step: { says: string; code?: string }, ruleLabel?: string): { text: string; flip: boolean };
export function stepDoes(step: unknown): Does;
export function modelText(model: ThunderModel, id: string): string;
/** One answer on the way to a step: the question, and Yes, No, For each, or Otherwise. */
export interface When { question: string; answer: string }
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
  /** Big Picture: the resources and how they connect; at app scope, the permissions, settings, and facts too. */
  resources?: { id: string; label: string; symbol: 'resource'; resourceType?: string; address?: string; file: string; knows: { label: string; value: string | null; computed?: true; secret?: true; line: number | null }[]; links: { from: string; to: string; kind: LinkKind; line?: number }[] }[];
  permissions?: Permission[]; settings?: Setting[]; facts?: Fact[];
  actions?: LevelItem[]; rules?: LevelItem[]; loose?: LevelItem[]; unknowns?: ThunderModel['unknowns'];
  route?: string; doc?: string; owner?: { id: string; label: string }; youGive?: string[]; youGetBack?: string;
  uses?: { id: string; label: string }[]; usedBy?: { id: string; label: string }[];
  // Flow
  flow?: Flow;
  // Details
  steps?: { id: string; text: string; does: Does; mark: string; line: number | null; depth: number; via?: string; notExplained?: true }[];
  notExplained?: number; tryable?: boolean; rule?: unknown; source?: string;
  /** Details: what goes in, and the lines where each fact is used. */
  inputs?: { label: string; lines: number[] }[];
  /** Details: the data it changes, what it saves or sends, and the answers that lead there. */
  changes?: { text: string; line: number | null; does: Does; when: When[] }[];
  /** Details: every way it can stop, with the error, the message people see, and the answers that lead there. */
  stops?: { error: string; message?: string; line: number | null; when: When[] }[];
  /** Details: what it gives back, and when. */
  givesBack?: { text: string; line: number | null; when: When[] }[];
  /** Details: each action or rule it relies on, summarized. */
  reliesOn?: { id: string; label: string; symbol: string; says: string }[];
  /** Details, for a rule: its answers in words, in order (the last may be "otherwise"). */
  answers?: { answer: string; when: string }[];
  /** Details, for a rule with one whole-number fact: its exact limits, found by running it. from/to null = "or less"/"or more". */
  limits?: { fact: string; ranges: { from: number | null; to: number | null; answer: string }[] };
  /** Details: questions the code can't answer (what a number means, why the rule exists). */
  openQuestions?: string[];
  // Text
  text?: string;
  // Original
  language?: string | null;
}
/** What one reading level (LEVELS) shows for the whole model, a Thing, or one action or rule. */
export function readLevel(model: ThunderModel, level: LevelId, focus?: string): LevelView;
