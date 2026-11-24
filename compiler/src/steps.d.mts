export const STEPS_SCHEMA: 'thunder-steps-v1';
import type { Expr } from './meaning.mjs';
export function classifyStatement(raw: string, opts?: { inner?: number }): { kind: string; says: string; code: string; expr: Expr };
/** A statement's meaning tree, read in the language of the function being read. */
export function statementExpr(raw: string): Expr;
/** The language of the function being read ('' outside one). */
export function readingLanguage(): string;
