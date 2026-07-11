// A tiny, dependency-free, deterministic XML parser , just enough to read the DMN/BPMN we
// emit and reasonably well-formed real-world files. Not a validating parser: it handles
// elements, attributes (single/double quoted), text, self-closing tags, comments, the XML
// declaration, and entity decoding. Namespaces are kept in the raw name; match by localName.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeEntities = (s) =>
  String(s).replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e]);

// Strip the namespace prefix: "dmn:decision" -> "decision".
export const localName = (name) => String(name).split(':').pop();

function parseAttrs(str) {
  const attrs = {};
  const re = /([^\s=/]+)\s*=\s*"([^"]*)"|([^\s=/]+)\s*=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(str))) {
    if (m[1] !== undefined) attrs[m[1]] = decodeEntities(m[2]);
    else attrs[m[3]] = decodeEntities(m[4]);
  }
  return attrs;
}

/** Parse an XML string into a tree of { name, attrs, children, text }. Root is a synthetic node. */
export function parseXml(input) {
  const s = String(input ?? '');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '<') {
      if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i); i = e < 0 ? s.length : e + 3; continue; }
      if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i); i = e < 0 ? s.length : e + 2; continue; }
      if (s.startsWith('<![CDATA[', i)) {
        const e = s.indexOf(']]>', i);
        stack[stack.length - 1].text += s.slice(i + 9, e < 0 ? s.length : e);
        i = e < 0 ? s.length : e + 3; continue;
      }
      if (s.startsWith('<!', i)) { const e = s.indexOf('>', i); i = e < 0 ? s.length : e + 1; continue; }
      const e = s.indexOf('>', i);
      if (e < 0) break;
      if (s[i + 1] === '/') { if (stack.length > 1) stack.pop(); i = e + 1; continue; }
      let raw = s.slice(i + 1, e).trim();
      const selfClose = raw.endsWith('/');
      if (selfClose) raw = raw.slice(0, -1).trim();
      const sp = raw.search(/\s/);
      const name = sp < 0 ? raw : raw.slice(0, sp);
      const node = { name, attrs: parseAttrs(sp < 0 ? '' : raw.slice(sp)), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
      i = e + 1;
    } else {
      const e = s.indexOf('<', i);
      const end = e < 0 ? s.length : e;
      const t = decodeEntities(s.slice(i, end)).trim();
      if (t) stack[stack.length - 1].text += t;
      i = end;
    }
  }
  return root;
}

// ── Tree walk helpers (all match by localName, ignoring namespace prefixes) ──

/** All descendant elements with the given localName (depth-first, document order). */
export function findAll(node, lname) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children || []) {
      if (localName(c.name) === lname) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

/** First descendant with the given localName, or null. */
export function find(node, lname) {
  return findAll(node, lname)[0] || null;
}

/** Direct children with the given localName. */
export function childrenNamed(node, lname) {
  return (node.children || []).filter((c) => localName(c.name) === lname);
}
