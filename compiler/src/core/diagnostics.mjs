// Thunder Core diagnostics: stable codes, plain words, always a line number.
//
// Codes never change meaning once released. TC1xx = layout and spelling of a line, TC2xx = names,
// TC3xx = kinds of values (types), TC4xx = things Thunder Core does not support yet, TC5xx = runtime
// (reported by the generated program, listed here so the docs and the runtime agree).

export const CODES = {
  TC101: 'Tabs are not used for indentation',
  TC102: 'A line is indented but nothing opens a block above it',
  TC103: 'A line ends with ":" but has nothing indented under it',
  TC104: 'Indentation does not line up with an earlier line',
  TC105: 'A line could not be read',
  TC106: 'Text is missing its closing quote',
  TC107: 'Brackets or parentheses do not match',
  TC108: 'Something is missing from this statement',
  TC109: '"Otherwise" without a "When" or "If" before it',
  TC110: '"If this fails:" without a statement before it',
  TC111: '"Receive" is not the first line of a "To" block',
  TC112: 'Something extra at the end of a line',
  TC113: 'A line under a record or call written as a block is not "name: value"',
  TC114: 'A field or an input is given twice',
  TC115: 'A function called with names has no input of that name (or its inputs are not known)',
  TC116: 'A function called with names is missing an input it needs',
  TC117: 'Lines like "name: value" with no record or function call to give them to',
  TC118: 'A line inside a Screen is not something a screen can show',
  TC119: '"Receive" or "Remember" is not at the top of a Screen',
  TC201: 'Unknown name',
  TC202: 'A name uses a word that belongs to Thunder',
  TC203: 'A name is defined twice',
  TC204: 'A function uses a value from the main program',
  TC205: 'A kept value is changed',
  TC206: 'Unknown field',
  TC207: 'Wrong number of values given to a function',
  TC208: '"Give" outside a "To" block',
  TC209: 'Unknown record',
  TC210: 'A record is missing a field',
  TC211: 'A name is used before it is set',
  TC212: 'Unknown screen',
  TC213: 'An input of a screen is changed',
  TC214: 'A screen is given an input it does not have, or is missing one it needs',
  TC301: 'Money and a plain number are mixed',
  TC302: 'Values of different kinds are compared',
  TC303: 'A name changes kind',
  TC304: 'A condition is not yes/no',
  TC305: 'This kind of value cannot do that',
  TC306: 'Unknown kind of value',
  TC401: 'Thunder Core does not know this action yet',
  TC402: 'Thunder Core does not support this yet',
  TC403: 'A "Never" rule names more than one changing value',
  TC404: 'A default for an input must be a fixed value, after the inputs without one',
  TC405: 'A Python module ("Use") can be used only when compiling to Python',
  TC406: 'A Screen is built only for React (--target react)',
  TC407: 'A step that cannot run when a button is pressed',
  TC408: 'An npm package ("Use … from npm") can be used only when compiling to TypeScript',
  TC409: 'A .NET library ("Use … from .NET" or "from NuGet") can be used only when compiling to C#',
  TC501: 'Divided by zero (runtime)',
  TC502: 'Nothing used where a value was needed (runtime)',
  TC503: 'A field or entry is missing (runtime)',
  TC504: 'A Never rule was broken (runtime)',
  TC505: 'An Expect check failed (runtime)',
  TC506: 'Values of different kinds were mixed (runtime)',
  TC507: 'The program stopped with a message (runtime)',
  TC508: 'Library code used through "Use" failed (runtime)',
  TC509: 'A value could not be converted (runtime)',
};

export class CoreError extends Error {
  constructor(diag) { super(formatDiagnostic(diag)); this.diagnostic = diag; }
}

/** A diagnostic: { code, line, message, hint?, severity }. `message` already reads as a sentence. */
export function diag(code, line, message, hint) {
  return { code, severity: 'error', line: line ?? 1, message, ...(hint ? { hint } : {}) };
}

export function formatDiagnostic(d, file) {
  const where = file ? `${file}, line ${d.line}` : `Line ${d.line}`;
  return `${where}: ${d.message}${d.hint ? `\n  ${d.hint}` : ''}  [${d.code}]`;
}

// Small edit distance, for "did you mean".
export function closest(word, options) {
  let best = null, bestD = Infinity;
  for (const o of options) {
    const d = lev(word, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best && bestD <= Math.max(1, Math.floor(word.length / 3)) ? best : null;
}
function lev(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
