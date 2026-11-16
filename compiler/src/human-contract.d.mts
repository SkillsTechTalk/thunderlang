export interface HumanContractPreview {
  schema: 'thunder-human-preview-v1';
  experimental: true;
  origin: 'inferred-code' | 'human-v1' | 'thunderlang';
  mission?: string;
  purpose?: string;
  canonicalSource: string;
  signatureInputs: Array<{ name: string; type?: string }>;
  sourceReferences: string[];
  needsReview: string[];
  unknowns: string[];
  decisions: Array<{ name: string; inputs: string[]; order: string; rules: Array<{ condition: string; readAs: string; outcome: unknown }>; otherwise: unknown }>;
  tests: { total: number; passed: number; failed: number; results: Array<{ case: string; pass: boolean; expected: unknown; actual: unknown; error?: string; note?: string }> };
  application: 'not_checked';
  limitations: string[];
}
export function compileHumanContract(source: string): string;
export function previewHumanContract(source: string): HumanContractPreview;
export function renderHumanContract(report: HumanContractPreview): string;
