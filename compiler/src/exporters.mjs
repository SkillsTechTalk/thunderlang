// Export adapters (founder roadmap, IL-owned interop). The Intent Graph is the source of
// truth; these render slices of it into industry-standard formats so intent can be checked
// by existing tooling without leaving ThunderLang:
//   - toDMN(ast)  , decisions -> DMN 1.3 decision tables (OMG DMN)
//   - toBPMN(ast) , lifecycles -> BPMN 2.0 processes (OMG BPMN)
//   - toSMV(ast)  , lifecycles + temporal -> NuSMV/nuXmv finite-state model + specs
// All three are deterministic and pure (string in, string out). They export ONLY what is
// declared; a mission with no decisions/lifecycles yields an empty-but-valid document.

import { buildLifecycle } from './lifecycle.mjs';
import { toJSONSchema, toOpenAPI } from './data-schema.mjs';
import { toDesignTokens, toCss } from './style.mjs';
import { buildIntentGraph } from './intent-graph.mjs';

export { toDesignTokens, toCss };
export const EXPORT_FORMATS = ['dmn', 'bpmn', 'smv', 'jsonschema', 'openapi', 'tokens', 'mermaid', 'css', 'playwright'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
// A safe XML NCName / SMV identifier from arbitrary text (letters, digits, _; never leading digit).
const xmlId = (s, fallback = 'id') => {
  const v = String(s ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z_]/.test(v) ? v : `${fallback}_${v || '0'}`;
};

// ── DMN 1.3 ──────────────────────────────────────────────────────────────────
/**
 * Render declared decisions (Gap 4) as DMN 1.3 decision tables. Hit policy FIRST:
 * rules are ordered, the first match wins, and the mission `default` becomes the final
 * catch-all rule. The `when` expression lands in the first input column (the rest are
 * "-" / any) so the full condition is preserved verbatim.
 */
export function toDMN(ast) {
  const decisions = ast.decisions || [];
  const defsId = xmlId(ast.mission, 'intent');
  const body = decisions.map((dec) => {
    const decId = xmlId(dec.name, 'decision');
    const inputs = dec.inputs.length ? dec.inputs : ['condition'];
    const inputCols = inputs.map((inp) => `        <input id="in_${decId}_${xmlId(inp)}" label="${esc(inp)}">
          <inputExpression id="ie_${decId}_${xmlId(inp)}" typeRef="string"><text>${esc(inp)}</text></inputExpression>
        </input>`).join('\n');
    const ruleRow = (when, result, id) => {
      const entries = inputs.map((_inp, i) => `          <inputEntry id="ien_${id}_${i}"><text>${esc(i === 0 ? (when ?? '-') : '-')}</text></inputEntry>`).join('\n');
      return `        <rule id="rule_${id}">
${entries}
          <outputEntry id="oen_${id}"><text>${esc(result != null ? `"${result}"` : '-')}</text></outputEntry>
        </rule>`;
    };
    const rules = dec.rules.map((r, i) => ruleRow(r.when, r.result, `${decId}_${i}`)).join('\n');
    const defRule = dec.default != null ? '\n' + ruleRow(null, dec.default, `${decId}_default`) : '';
    return `    <decision id="dec_${decId}" name="${esc(dec.name)}">
      <decisionTable id="dt_${decId}" hitPolicy="FIRST">
${inputCols}
        <output id="out_${decId}" name="result" typeRef="string" />
${rules}${defRule}
      </decisionTable>
    </decision>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="defs_${defsId}" name="${esc(ast.mission || 'intent')}" namespace="https://skillstech.dev/intent/dmn">
${body}
</definitions>
`;
}

// ── BPMN 2.0 ─────────────────────────────────────────────────────────────────
/**
 * Render declared lifecycles (Gap 2) as BPMN 2.0 processes. Each lifecycle state becomes a
 * task, each transition a sequence flow (named after the transition), the initial state is
 * entered from a start event, and terminal states flow to an end event.
 */
export function toBPMN(ast) {
  const procs = (ast.lifecycles || []).map((lc) => {
    const ir = buildLifecycle(lc);
    const pid = xmlId(lc.name, 'process');
    const sid = (s) => `t_${pid}_${xmlId(s)}`;
    const tasks = ir.states.map((s) => `      <task id="${sid(s)}" name="${esc(s)}" />`).join('\n');
    const flows = [];
    if (ir.initial) flows.push(`      <startEvent id="start_${pid}" />`, `      <sequenceFlow id="f_start_${pid}" sourceRef="start_${pid}" targetRef="${sid(ir.initial)}" />`);
    ir.transitions.forEach((t, i) => {
      if (!t.from || !t.to) return;
      flows.push(`      <sequenceFlow id="f_${pid}_${i}" name="${esc(t.name || '')}" sourceRef="${sid(t.from)}" targetRef="${sid(t.to)}" />`);
    });
    const terminals = ir.terminals.length ? ir.terminals : ir.states.filter((s) => (ir.out[s] || []).length === 0);
    if (terminals.length) {
      flows.push(`      <endEvent id="end_${pid}" />`);
      terminals.forEach((s, i) => flows.push(`      <sequenceFlow id="f_end_${pid}_${i}" sourceRef="${sid(s)}" targetRef="end_${pid}" />`));
    }
    return `    <process id="proc_${pid}" name="${esc(lc.name)}" isExecutable="false">
${tasks}
${flows.join('\n')}
    </process>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs_${xmlId(ast.mission, 'intent')}" targetNamespace="https://skillstech.dev/intent/bpmn">
${procs}
</definitions>
`;
}

// ── NuSMV / nuXmv model checking ─────────────────────────────────────────────
/**
 * Render declared lifecycles (Gap 2) as a NuSMV finite-state model, with the transition
 * relation taken faithfully from the state machine. Emits derivable, checkable specs:
 *   - EF(state = T) for each terminal T (the terminal is reachable), and
 *   - a SPEC skeleton for each temporal declaration (always/eventually/until), with the
 *     intent text as a comment and a bound-me boolean, ready for a human to bind the AP.
 * One MODULE per lifecycle (the first is `main` so the file is runnable as-is).
 */
export function toSMV(ast) {
  const lcs = ast.lifecycles || [];
  if (!lcs.length) return '-- no lifecycle declared; nothing to model-check\n';

  const txt = (s) => (typeof s === 'string' ? s : (s.statement || s.text || '')).trim();
  const temporal = [
    ...(ast.always || []).map((s) => ({ kind: 'AG', text: txt(s) })),
    ...(ast.eventually || []).map((s) => ({ kind: 'AF', text: txt(s), within: s.within })),
    ...(ast.until || []).map((s) => ({ kind: 'AU', text: txt(s) })),
  ].filter((t) => t.text);

  return lcs.map((lc, idx) => {
    const ir = buildLifecycle(lc);
    const name = idx === 0 ? 'main' : xmlId(lc.name, 'lifecycle');
    const stateVals = ir.states.map((s) => xmlId(s, 's'));
    const initial = ir.initial ? xmlId(ir.initial, 's') : (stateVals[0] || 's0');
    const cases = ir.states.map((s) => {
      const targets = (ir.out[s] || []).map((t) => xmlId(t, 's'));
      const rhs = targets.length ? (targets.length === 1 ? targets[0] : `{${targets.join(', ')}}`) : xmlId(s, 's'); // self-loop if no outgoing (deadlock modeled)
      return `      state = ${xmlId(s, 's')} : ${rhs};`;
    }).join('\n');
    const reachSpecs = (ir.terminals.length ? ir.terminals : []).map((t) => `-- terminal "${t}" is reachable\nSPEC EF (state = ${xmlId(t, 's')});`).join('\n');
    const tempSpecs = idx === 0 ? temporal.map((t, i) => {
      const op = t.kind === 'AF' ? 'AF' : t.kind === 'AU' ? 'A[ p_bind U q_bind ]' : 'AG';
      const spec = t.kind === 'AU' ? `SPEC ${op};` : `SPEC ${op} (p_${i});`;
      return `-- ${t.kind === 'AF' ? 'eventually' : t.kind === 'AU' ? 'until' : 'always'}: ${t.text}${t.within ? ` (within ${t.within})` : ''}\n-- bind p_${i}/q_bind to the atomic proposition, then check:\n-- ${spec}`;
    }).join('\n') : '';
    return `MODULE ${name}
-- generated from lifecycle "${lc.name}" (intent-graph-v1)
VAR
  state : {${stateVals.join(', ')}};
ASSIGN
  init(state) := ${initial};
  next(state) := case
${cases}
    esac;
${reachSpecs ? '\n' + reachSpecs : ''}${tempSpecs ? '\n' + tempSpecs : ''}`;
  }).join('\n\n') + '\n';
}

/** Dispatch by format name. Returns { format, ext, content } or null for unknown formats. */
// ── Mermaid (full Intent Graph flowchart) ───────────────────────────────────
/**
 * Render the whole Intent Graph as a Mermaid `graph TD` , every canonical node with a
 * shape by category and every typed relationship as a labeled edge. Unlike the mission
 * summary emitted into the build's `.mmd` artifact, this is the complete graph, so it
 * pastes into any Markdown/GitHub/Notion surface as a live diagram. Deterministic.
 */
export function toMermaid(ast) {
  const graph = buildIntentGraph(ast);
  const L = ['graph TD'];
  const mid = (id) => `n_${String(id).replace(/[^A-Za-z0-9]+/g, '_')}`;
  // Mermaid labels break on quotes/brackets/pipes/angles; normalize to plain text.
  const lbl = (s) => String(s ?? '').replace(/"/g, "'").replace(/[[\]{}()<>|#]/g, ' ').replace(/\s+/g, ' ').trim();
  // Node shape by category (rounded = states/lifecycle, hexagon = prohibitions/constraints,
  // rhombus = decisions/rules, rectangle = everything else).
  const shape = (type) => {
    if (/State$/.test(type) || type === 'Lifecycle' || type === 'Journey') return ['(["', '"])'];
    if (type === 'Never' || type === 'Constraint' || type === 'Guarantee') return ['{{"', '"}}'];
    if (type === 'Decision' || type === 'Rule') return ['{"', '"}'];
    return ['["', '"]'];
  };
  for (const n of graph.nodes) {
    const [open, close] = shape(n.type);
    L.push(`  ${mid(n.id)}${open}${lbl(`${n.type}: ${n.title || n.id}`)}${close}`);
  }
  for (const r of graph.relationships) {
    L.push(`  ${mid(r.from)} -->|${lbl(r.type)}| ${mid(r.to)}`);
  }
  return `${L.join('\n')}\n`;
}

// ── Playwright (experience -> E2E test scaffold) ─────────────────────────────
// A SKELETON, not a passing test: declared experiences/journeys/states become structured
// Playwright stubs (describe/test/test.step) with TODOs for selectors + assertions. This is
// the test-plan target for the experience profile , it turns "what the UI must do" into the
// shape of the test that proves it, deterministically. Consistent with the compiler's scope
// (test scaffolds, not production code).
const jsStr = (s) => `'${String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;

export function toPlaywright(ast) {
  const exps = ast.experiences || [];
  const L = [];
  L.push('// Playwright test scaffold generated from experience intent by @skillstech/thunderlang.');
  L.push('// SKELETON: fill in selectors and assertions. It is not a passing test until you do.');
  L.push("import { test, expect } from '@playwright/test';");
  L.push('');
  if (!exps.length) {
    L.push('// No `experience` blocks declared, so there is nothing to scaffold.');
    return `${L.join('\n')}\n`;
  }
  for (const exp of exps) {
    L.push(`test.describe(${jsStr(exp.name || 'experience')}, () => {`);
    if (exp.accessible && exp.accessible.target) {
      L.push(`  // accessibility goal: ${exp.accessible.target} (proposed , verify with an a11y audit, do not assume met)`);
    }
    for (const j of exp.journeys || []) {
      L.push(`  test(${jsStr(j.name || 'journey')}, async ({ page }) => {`);
      if (!(j.steps || []).length) L.push('    // TODO: no steps declared for this journey');
      for (const step of j.steps || []) {
        L.push(`    await test.step(${jsStr(step)}, async () => {`);
        L.push('      // TODO: implement this step');
        L.push('    });');
      }
      L.push('  });');
    }
    for (const st of exp.states || []) {
      if (st.hasRecovery) {
        L.push(`  test(${jsStr(`failure state "${st.name}" offers a recovery path`)}, async ({ page }) => {`);
        L.push(`    // TODO: drive the UI into "${st.name}", assert a recovery action is available`);
        L.push('  });');
      } else {
        L.push(`  test(${jsStr(`reaches state: ${st.name}`)}, async ({ page }) => {`);
        L.push(`    // TODO: drive the UI to "${st.name}" and assert it is shown`);
        L.push('  });');
      }
    }
    L.push('});');
    L.push('');
  }
  return `${L.join('\n')}\n`;
}

export function exportIntent(ast, format) {
  switch (format) {
    case 'dmn': return { format, ext: 'dmn', content: toDMN(ast) };
    case 'bpmn': return { format, ext: 'bpmn', content: toBPMN(ast) };
    case 'smv': return { format, ext: 'smv', content: toSMV(ast) };
    case 'jsonschema': return { format, ext: 'schema.json', content: JSON.stringify(toJSONSchema(ast, { which: 'both' }), null, 2) + '\n' };
    case 'openapi': return { format, ext: 'openapi.json', content: JSON.stringify(toOpenAPI(ast), null, 2) + '\n' };
    case 'tokens': return { format, ext: 'tokens.json', content: JSON.stringify(toDesignTokens(ast), null, 2) + '\n' };
    case 'mermaid': return { format, ext: 'mmd', content: toMermaid(ast) };
    case 'css': return { format, ext: 'css', content: toCss(ast) };
    case 'playwright': return { format, ext: 'spec.ts', content: toPlaywright(ast) };
    default: return null;
  }
}
