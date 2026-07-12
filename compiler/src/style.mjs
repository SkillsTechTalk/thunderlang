// Style Intent (intent-style-v1) , brand + visual language as a governed, deterministic
// extension of the Experience profile. IL owns the canonical token address space and the
// accessibility-target vocabulary so ST (Studio), STW (theming), and every renderer bind
// to ONE schema instead of forking their own token trees.
//
// Two load-bearing rules, enforced here (no AI):
//   1. Tokens address a CANONICAL, lockable namespace. An off-namespace path is a typo or
//      a private fork , flagged, so the design system stays a closed vocabulary.
//   2. `accessibility_target` is ALWAYS a PROPOSED claim. IL never lets a StyleIntent
//      assert it is `verified`/compliant , conformance is OT's verdict after real testing.

import { slug } from './parse.mjs';

export const STYLE_SCHEMA = 'intent-style-v1';

// Canonical, lockable design-token address space. A StyleIntent may only bind these paths
// (plus the non-token brand.* addresses below). Extending the set is a request to IL, not a
// private addition , that is what keeps themes portable across Studio, storefronts, and docs.
export const TOKEN_PATHS = [
  'color.primary', 'color.accent', 'color.surface', 'color.text',
  'color.feedback.success', 'color.feedback.warning', 'color.feedback.error', 'color.feedback.info',
  'typography.scale', 'typography.headingWeight',
  'typography.families.heading', 'typography.families.body', 'typography.families.mono',
  'shape.radius', 'shape.borders', 'shape.elevation',
  'density', 'mode',
];

// Non-token, lockable brand addresses (assets, not scalar tokens).
export const BRAND_PATHS = ['brand.logo'];

// The full lockable address space a StyleIntent may bind.
export const STYLE_ADDRESS_SPACE = [...TOKEN_PATHS, ...BRAND_PATHS];

// Accessibility targets IL recognizes. Always a GOAL (classification `proposed`), never a
// proof of conformance. `mode` token values are constrained separately.
export const ACCESSIBILITY_TARGETS = ['WCAG_2_1_AA', 'WCAG_2_2_AA', 'WCAG_2_2_AAA'];

// Legal values for the `mode` token.
export const MODE_VALUES = ['light', 'dark', 'auto', 'both'];

/** IL's stance: an accessibility target is a proposed goal, never IL-verified. */
export const ACCESSIBILITY_CLASSIFICATION = 'proposed';

const isKnownPath = (p) => STYLE_ADDRESS_SPACE.includes(p);

/**
 * Deterministic diagnostics for every `style_intent` block. Returns an array of
 * { ruleId, severity, blocks, message, styleIntent, line } , the same shape the rest of
 * the compiler emits, so it composes into `intent check` with no special-casing.
 */
export function styleDiagnostics(ast) {
  const out = [];
  const styles = ast.styleIntents || [];
  const experienceNames = new Set((ast.experiences || []).map((e) => slug(e.name || '')));

  for (const si of styles) {
    const where = si.line;
    const label = si.name || '(unnamed)';

    // IL-STYLE-001 , off-namespace token path (typo or private fork of the token tree).
    for (const t of si.tokens) {
      if (!isKnownPath(t.path)) {
        out.push({
          ruleId: 'IL-STYLE-001', severity: 'warning', blocks: [],
          message: `Style intent "${label}" binds unknown token "${t.path}". Use a canonical address (see intent-style-v1) or request the extension from IL.`,
          styleIntent: label, line: t.line ?? where,
        });
      }
    }

    // IL-STYLE-002 , unrecognized accessibility target.
    if (si.accessibilityTarget && !ACCESSIBILITY_TARGETS.includes(si.accessibilityTarget)) {
      out.push({
        ruleId: 'IL-STYLE-002', severity: 'warning', blocks: [],
        message: `Style intent "${label}" declares unknown accessibility_target "${si.accessibilityTarget}". Expected one of: ${ACCESSIBILITY_TARGETS.join(', ')}.`,
        styleIntent: label, line: where,
      });
    }

    // IL-STYLE-003 , no accessibility target declared. A style intent should state the
    // conformance goal it is designing toward (as a proposed claim), so OT can later verify it.
    if (!si.accessibilityTarget) {
      out.push({
        ruleId: 'IL-STYLE-003', severity: 'info', blocks: [],
        message: `Style intent "${label}" declares no accessibility_target. State the goal (e.g. WCAG_2_2_AA) , it is a proposed claim OT verifies, never assumed met.`,
        styleIntent: label, line: where,
      });
    }

    // IL-STYLE-004 , invalid `mode` token value.
    for (const t of si.tokens) {
      if (t.path === 'mode' && t.value && !MODE_VALUES.includes(t.value)) {
        out.push({
          ruleId: 'IL-STYLE-004', severity: 'warning', blocks: [],
          message: `Style intent "${label}" sets mode "${t.value}"; expected one of: ${MODE_VALUES.join(', ')}.`,
          styleIntent: label, line: t.line ?? where,
        });
      }
    }

    // IL-STYLE-005 , applies_to references an experience that isn't declared here.
    if (si.appliesTo && experienceNames.size && !experienceNames.has(slug(si.appliesTo))) {
      out.push({
        ruleId: 'IL-STYLE-005', severity: 'info', blocks: [],
        message: `Style intent "${label}" applies_to "${si.appliesTo}", which is not a declared experience in this file.`,
        styleIntent: label, line: where,
      });
    }
  }
  return out;
}

/**
 * A structured, deterministic view of the style intents in a document , the payload
 * Studio/renderers consume. Tokens are resolved against the canonical address space and
 * the accessibility target is stamped with its (always proposed) classification.
 */
export function analyzeStyle(ast) {
  const styles = (ast.styleIntents || []).map((si) => ({
    id: `style.${slug(si.name || 'style')}`,
    name: si.name,
    appliesTo: si.appliesTo,
    purpose: si.purpose,
    audience: si.audience,
    surfaces: si.surfaces,
    scope: si.scope,
    accessibility: si.accessibilityTarget
      ? { target: si.accessibilityTarget, classification: ACCESSIBILITY_CLASSIFICATION, verified: false }
      : null,
    tokens: si.tokens.map((t) => ({ path: t.path, value: t.value, canonical: isKnownPath(t.path) })),
  }));
  return {
    schema: STYLE_SCHEMA,
    styleIntents: styles,
    diagnostics: styleDiagnostics(ast),
    addressSpace: STYLE_ADDRESS_SPACE,
    accessibilityTargets: ACCESSIBILITY_TARGETS,
  };
}
