// thunder format for Thunder Core: two spaces per block level, no trailing spaces, at most one blank line in a
// row, and a newline at the end. It changes only layout, never words, so it cannot change what a program means.

export function formatCore(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const stack = [0]; // original indents of open blocks
  let blank = 0;
  for (const raw of lines) {
    const text = raw.replace(/\s+$/, '');
    if (!text.trim()) { blank++; continue; }
    const indent = text.match(/^ */)[0].length;
    while (stack.length > 1 && indent < stack[stack.length - 1]) stack.pop();
    if (indent > stack[stack.length - 1]) stack.push(indent);
    if (blank && out.length) out.push('');
    blank = 0;
    out.push(`${'  '.repeat(stack.length - 1)}${text.trim()}`);
  }
  return out.length ? `${out.join('\n')}\n` : '';
}
