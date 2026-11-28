export const EXAMPLES_SCHEMA: 'thunder-examples-v1';
export interface ThunderExample {
  kind: 'expect' | 'case' | 'scenario';
  /** The Test title, or the decision or lifecycle a mission test is for. */
  block: string | null;
  /** The case or scenario name (missions), or null. */
  name: string | null;
  line: number;
  subject: { kind: 'function' | 'decision' | 'lifecycle' | 'expression'; name: string | null };
  /** Core: in order, unnamed. Missions: given name and value. Scenarios: one per event, named "event". */
  inputs: Array<{ name: string | null; text: string }>;
  /** True when a call's inputs could not be cut from the line as written (inputs is then empty). */
  inputsUnread?: boolean;
  /** True when the line was read from its text, not the parser (e.g. a test file calling functions from another file). */
  fromText?: boolean;
  expected: { mode: 'equals' | 'compares' | 'fails' | 'result' | 'state' | 'valid' | 'invalid' | 'none'; comparison: string | null; text: string | null };
  raw: string;
}
export interface ThunderExamples { schema: 'thunder-examples-v1'; kind: 'program' | 'mission'; examples: ThunderExample[]; problems: number }
/** Every example in a Thunder file (Core Test/Expect, mission test/case/scenario), read even when other parts do not compile. */
export function examplesOf(source: string, options?: { file?: string; kind?: 'program' | 'mission' | null }): ThunderExamples;
