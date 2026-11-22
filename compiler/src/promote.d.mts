import type { ReadItem } from './read.mjs';
export const PROMOTE_SCHEMA: 'thunder-promotion-v1';
export type Promotion =
  | { schema: 'thunder-promotion-v1'; ok: true; name: string; source: string; examples: number; notes: string[] }
  | { ok: false; reason: string };
export function promoteDecision(item: ReadItem & { file?: string }, options?: { file?: string }): Promotion;
