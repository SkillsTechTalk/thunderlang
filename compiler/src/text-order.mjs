// One order for text everywhere in the compiler: by character code, the same on every machine.
// Not localeCompare: its order depends on the machine's locale (so the same input could sort differently), and its
// first call loads the whole Unicode collation data (about a quarter of a second at every start).

/** Compare two texts by character code: a negative number, 0, or a positive number, for Array.prototype.sort. */
export const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
