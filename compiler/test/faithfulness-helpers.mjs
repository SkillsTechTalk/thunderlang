// Shared by the faithfulness tests: Thunder Text for a snippet, and which side of a question a step is on.
import assert from 'node:assert/strict';
import { readFiles } from '../src/read-repo.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

/** Thunder Text for every member of one file. */
export function thunderText(path, source) {
  const model = thunderModel(readFiles([{ path, source }]), { name: 'x' });
  return model.members.map((m) => modelText(model, m.id)).join('\n');
}

/**
 * Which answer of the question matching `ask` leads to the step matching `step`: 'yes', 'no', or null when the
 * step is not inside that question. This is the end-to-end polarity check: the Stop must be on the side where the
 * code takes it.
 */
export function sideOf(text, ask, step) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => ask.test(l));
  assert.ok(i >= 0, `no question matching ${ask} in:\n${text}`);
  const indent = lines[i].search(/\S/);
  let side = null;
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    const d = l.search(/\S/);
    if (d < 0) continue;
    if (d <= indent) break;
    const m = l.trim().match(/^(Yes|No):/);
    if (m && d === indent + 2) side = m[1].toLowerCase();
    if (step.test(l)) return side;
  }
  return null;
}
