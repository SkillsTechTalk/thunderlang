// thunder-model-v1: the one meaning every Thunder view is drawn from (see src/model.mjs).
import type { Does } from './visual.mjs';
import type { Expr } from './meaning.mjs';
export const MODEL_SCHEMA: 'thunder-model-v1';
export const THING_LANGUAGES: string[];
export interface FlowNode { id: string; kind: 'start' | 'decision' | 'step' | 'loop' | 'stop' | 'end' | 'code'; text: string; line?: number; lane: number; row: number; does: Does; uses?: string; /** Set when `uses` is a member in another file (calls across files). */ usesFile?: string; answer?: boolean; otherwise?: boolean; value?: string; code?: boolean; /** A decision with several cases (see FlowBlock.cases). */ cases?: true;
  /** The step's full meaning (thunder-expr-v1). */ expr?: Expr;
  /** What the short words leave out, one level down: "with: order, { validate: false }". Shown in Details and the full Thunder Text. */ detail?: string }
export interface FlowEdge { from: string; to: string; label?: 'yes' | 'no' | 'each' | 'next' | 'done' | 'error' | 'case' | 'nested'; /** On a 'case' edge: the case it takes ("When it is from 90 to 100", "Otherwise", "None of these"). */ text?: string }
export interface FlowBlock { id: string; yes?: FlowBlock[]; no?: FlowBlock[]; each?: FlowBlock[]; body?: FlowBlock[];
  /** A choice among several cases (switch, when, match, select): one side per case, in order. The decision node has `cases: true`. */
  cases?: { label: string; line?: number; blocks: FlowBlock[] }[];
  /** The body is an inner function (a hook, a callback, go/defer): its own sub-flow; the outer flow continues from this step. */
  nested?: true; handlers?: { id: string; blocks: FlowBlock[] }[]; always?: { id: string; blocks: FlowBlock[] } }
/** nodes/edges: the flow as a graph. blocks: the same nodes as a tree, which views draw from. */
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[]; blocks: FlowBlock[] }
export interface Thing { id: string; kind: 'thing' | 'record' | 'choices'; name: string; label: string; doc?: string; file: string; lines: [number, number]; knows: { name: string; label: string; kind: string | null; start: string | null; line: number | null }[]; choices: string[]; can: string[] }
export interface Member { id: string; kind: 'action' | 'rule' | 'steps' | 'setup' | 'not-read'; name: string; label: string; owner?: string; file: string; language: string; lines: [number, number]; doc?: string; route?: string;
  /** JS/TS: what the function is assigned to (`exports.normalizeType`, `View.prototype.lookup`, `res.json`). */ assignedTo?: string;
  /** JS/TS: an anonymous function passed to a call (named `<parent> › callback at line N`); `passedTo` is the call. */ callback?: true; passedTo?: string; youGive: string[]; /** Each input's kind in words, by its label, when the code says it. */ inputKinds?: Record<string, string>; youGetBack?: string; rule?: unknown; question?: string; yesNo?: boolean; flow: Flow }
/**
 * A link from a member's flow node to another member. 'uses': a call (in the same file, or with `crossFile` through an
 * import, a declared type, or the same package). 'sends-to': an HTTP request to the route that handles its method and
 * path (`method`, `path`, `route`), an event or queue message to its listener (`event`), or a task to its worker (`task`).
 */
export interface ModelLink { from: string; to: string; kind: 'uses' | 'sends-to'; node: string; /** The target's file. */ file?: string; /** The calling step's line. */ line?: number | null; crossFile?: true; method?: string; path?: string; route?: string; event?: string; task?: string }
/** A call, request, event, or import worth linking that was not linked, and why (dynamic import, computed URL, external package, two routes match, an interface). */
export interface NotLinked { from?: string; node?: string; file: string | null; line: number | null; call?: string; import?: string; why: string; /** For an external package: how many imports of it. */ files?: number }
export interface ThunderModel { schema: 'thunder-model-v1'; name: string; files: { path: string; language: string; purpose?: string }[]; things: Thing[]; members: Member[]; links: ModelLink[]; unknowns: { id?: string; file: string; line: number; why: string }[]; notLinked?: NotLinked[] }
/** Which areas (folders, two levels deep) call which, from cross-file and service links. */
export interface AreaCalls { from: string; to: string; calls: number; sends: number; examples: { from: string; to: string; says: string }[] }
/** Where a link goes, as views show it. */
export interface LinkFacts { kind?: 'sends-to'; file?: string; crossFile?: true; line?: number; service?: string; route?: string }
/** Files may include go.mod, package.json, and tsconfig/jsconfig.json: they say which imports are this repo's own. */
export function thunderModel(files: { path: string; source: string }[], options?: { name?: string }): ThunderModel;
export function flowOf(steps: unknown[], options?: { start?: string; memberIndex?: Map<string, string>; memberLabel?: Map<string, string> }): Flow;
export function ruleFlow(item: unknown, start: string): Flow;
export function askAsQuestion(step: { says: string; code?: string }, ruleLabel?: string): { text: string; flip: boolean };
export function stepDoes(step: unknown): Does;
/** Thunder Text for a Thing or member; `full` shows every argument and value after the short words. */
export function modelText(model: ThunderModel, id: string, options?: { full?: boolean }): string;
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
  actions?: LevelItem[]; rules?: LevelItem[]; loose?: LevelItem[]; unknowns?: ThunderModel['unknowns'];
  /** Big Picture, whole app: which areas call which (the app's map), and what could not be linked. */
  calls?: AreaCalls[]; notLinked?: NotLinked[];
  route?: string; doc?: string; owner?: { id: string; label: string }; youGive?: string[]; youGetBack?: string;
  uses?: ({ id: string; label: string } & LinkFacts)[]; usedBy?: ({ id: string; label: string } & LinkFacts)[];
  // Flow
  flow?: Flow;
  // Details
  steps?: { id: string; text: string; does: Does; mark: string; line: number | null; depth: number; via?: string; notExplained?: true;
    /** The step's full meaning tree. */ expr?: Expr;
    /** What the short words leave out ("with: order, { validate: false }"), and the whole sentence ("Calls save — with: …"). */ detail?: string; full?: string }[];
  notExplained?: number; tryable?: boolean; rule?: unknown; source?: string;
  /** Details: what goes in, and the lines where each fact is used. */
  inputs?: { label: string; lines: number[]; /** Its kind in words when the code says it: "a number", "a PingResource". */ kind?: string }[];
  /** Details: the data it changes, what it saves or sends, and the answers that lead there. */
  changes?: { text: string; line: number | null; does: Does; when: When[] }[];
  /** Details: every way it can stop, with the error, the message people see, and the answers that lead there. */
  stops?: { error: string; message?: string; line: number | null; when: When[] }[];
  /** Details: what it gives back, and when. */
  givesBack?: { text: string; line: number | null; when: When[] }[];
  /** Details: each action or rule it relies on, summarized. */
  reliesOn?: ({ id: string; label: string; symbol: string; says: string } & LinkFacts)[];
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
export function readLevel(model: ThunderModel, level: LevelId, focus?: string, options?: { full?: boolean }): LevelView;
