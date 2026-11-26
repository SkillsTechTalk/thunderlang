// Common libraries, read as what they do. Most of what an app does is calls into well-known libraries (an ORM, an
// HTTP client, a cache, a payment service). Read by name alone they say nothing ("Calls find unique"); read with their
// arguments they say what happens: "Finds the user whose id is id". Each entry matches a call written the way the
// library's own documentation writes it, and only says what the call itself makes plain. Unknown calls are left to
// the general reader. Browser-safe, no dependencies.

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-$]+/g, ' ').toLowerCase().trim();
const singular = (w) => w.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1');
const plural = (w) => (/(s|sh|ch|x)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs.at(-1)}`);

/** Split at top-level commas. */
function splitTop(text) {
  const out = []; let d = 0, cur = '', q = null;
  for (const c of String(text)) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) d++;
    if (')]}'.includes(c)) d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** The text inside the outermost (…) after position `open`. */
function inside(text, open) {
  for (let i = open, d = 0, q = null; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === q && text[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(' || c === '{' || c === '[') d++;
    else if ((c === ')' || c === '}' || c === ']') && --d === 0) return text.slice(open + 1, i);
  }
  return null;
}
/** A value in words: user.id -> "the user's id", 'paid' -> "\"paid\"", 3 -> "3". */
function valueWords(v) {
  const t = String(v).trim().replace(/^\$/, '');
  if (/^["'`]([^"'`]*)["'`]$/.test(t)) return `"${t.slice(1, -1)}"`;
  if (/^-?\d+(\.\d+)?$/.test(t) || /^(true|false)$/i.test(t)) return /^true$/i.test(t) ? 'yes' : /^false$/i.test(t) ? 'no' : t;
  if (/^(null|None|nil)$/i.test(t)) return 'empty';
  // What the request carries: params[:email] (Rails), request.form['email'], req.body.email -> "the email it was sent".
  let rq;
  if ((rq = t.match(/^params\s*\[\s*[:'"]([\w]+)['"]?\s*\]$/)) || (rq = t.match(/^(?:req|request)\s*\.\s*(?:body|form|json|data)\s*(?:\.\s*(\w+)|\[\s*['"](\w+)['"]\s*\])$/))) return `the ${words(rq[1] || rq[2])} it was sent`;
  if ((rq = t.match(/^(?:req|request)\s*\.\s*(?:query|params|args)\s*(?:\.\s*(\w+)|\[\s*['"](\w+)['"]\s*\]|\.get\(\s*['"](\w+)['"]\s*\))$/))) return `the ${words(rq[1] || rq[2] || rq[3])} in the address`;
  const parts = t.split(/\.|->/).filter((p) => p && !/^(self|this)$/.test(p));
  if (parts.length === 2 && /^[A-Za-z_]\w*$/.test(parts[0]) && /^[A-Za-z_]\w*$/.test(parts[1])) return `the ${words(parts[0])}'s ${words(parts[1])}`;
  if (/^[A-Za-z_][\w.]*$/.test(t)) return words(parts.at(-1) ?? t);
  return 'a worked-out value';
}
/** Conditions from an object literal or keyword arguments: { id, email: e } / id=x, email=e -> "whose id is id and email is e". */
function whoseFrom(text) {
  const t = String(text || '').trim();
  const body = /^\{/.test(t) ? inside(t, 0) ?? '' : t;
  const parts = splitTop(body).map((p) => {
    const kv = p.match(/^["']?([A-Za-z_]\w*)["']?\s*(?::|=>|=(?!=))\s*(.+)$/s);
    if (kv) {
      const v = kv[2].trim();
      if (/^\{/.test(v)) return null; // nested operators ({ gt: 3 }) are not read here
      return `${words(kv[1].replace(/__(\w+)$/, ''))} is ${valueWords(v)}`;
    }
    return /^[A-Za-z_]\w*$/.test(p) ? `${words(p)} is ${words(p)}` : null;
  }).filter(Boolean);
  return parts.length ? `whose ${parts.join(' and ')}` : '';
}
/** `where: { … }` inside a Prisma/Sequelize options object. */
function whereOf(args) {
  const m = String(args).match(/\bwhere\s*:\s*\{/);
  if (!m) return '';
  return whoseFrom(`{${inside(args, m.index + m[0].length - 1) ?? ''}}`);
}
const URL_WORDS = (u) => {
  const t = String(u || '').trim();
  if (/^["'`]/.test(t)) return t.slice(1, -1).replace(/\$\{[^}]*\}/g, '…');
  return /^[A-Za-z_][\w.]*$/.test(t) ? `the ${words(t.split('.').pop()).replace(/\burl\b/, 'URL')}` : 'an address worked out by the code';
};

/** A file path in words: a quoted path as written, a name as "at <name>" ("Reads the file at config path"). */
const FILE_WORDS = (u) => {
  const t = String(u || '').trim();
  if (/^["'`]/.test(t)) return t.slice(1, -1).replace(/\$\{[^}]*\}/g, '…');
  return /^[A-Za-z_][\w.]*$/.test(t) ? `at ${t.includes('.') ? `the ${words(t.split('.').pop())}` : words(t)}` : 'at a path worked out by the code';
};

// Spring Data / Rails-style derived query names: findByEmailAndActive -> "whose email is … and active is …".
function derivedWhose(name, args) {
  const m = name.match(/^(?:find|get|read|query|search|stream|count|exists|delete|remove)(?:All|First|Top\d*|One)?By(\w+)$/);
  if (!m) return null;
  const fields = m[1].split(/And|Or/).map((f) => words(f.replace(/(IgnoreCase|OrderBy\w*)$/, '')));
  const vals = splitTop(args);
  return `whose ${fields.map((f, i) => `${f} is ${vals[i] ? valueWords(vals[i]) : '…'}`).join(/Or/.test(m[1]) ? ' or ' : ' and ')}`;
}

/** Each entry: re on the whole call (after `await`), and say(match, call) -> { says, does }. */
const CATALOG = [
  // ── HTTP clients ──
  { re: /^fetch\s*\(/, say: (m, c) => { const a = splitTop(inside(c, c.indexOf('(')) ?? ''); const method = (a[1]?.match(/method\s*:\s*["'`](\w+)/i) || [])[1]?.toUpperCase() ?? 'GET'; return { says: `Sends a ${method} request to ${URL_WORDS(a[0])}`, does: 'ask' }; } },
  { re: /^(?:axios|http|httpClient|client|api|ky|got|superagent|request)\s*\.\s*(get|post|put|patch|delete|head)\s*\(/i, say: (m, c) => ({ says: `Sends a ${m[1].toUpperCase()} request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },
  { re: /^(?:requests|httpx|session|self\.session|aiohttp\.ClientSession\(\))\s*\.\s*(get|post|put|patch|delete)\s*\(/, say: (m, c) => ({ says: `Sends a ${m[1].toUpperCase()} request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },
  { re: /^(?:this\.)?(?:_?[Hh]ttp(?:Client)?|_?client|\w*HttpClient|_?\w+Client)\s*\.\s*(Get|Post|Put|Patch|Delete)(?:AsJson|FromJson|String)?Async\s*\(/, say: (m, c) => ({ says: `Sends a ${m[1].toUpperCase()} request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },
  { re: /^(?:restTemplate|webClient)\s*\.\s*(get|post|put|delete|patch)(?:ForObject|ForEntity)?\s*\(/, say: (m, c) => ({ says: `Sends a ${m[1].toUpperCase()} request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },
  { re: /^http\s*\.\s*(Get|Post|Head)\s*\(/, say: (m, c) => ({ says: `Sends a ${m[1].toUpperCase()} request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },
  { re: /^reqwest\s*::\s*get\s*\(/, say: (m, c) => ({ says: `Sends a GET request to ${URL_WORDS(splitTop(inside(c, c.indexOf('(')) ?? '')[0])}`, does: 'ask' }) },

  // ── Prisma ──
  { re: /^(?:this\.)?prisma\s*\.\s*(\w+)\s*\.\s*(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate)\s*\(/, say: (m, c) => {
    const thing = words(m[1]), args = inside(c, c.indexOf('(', m.index + m[0].length - 1)) ?? '', whose = whereOf(args);
    const S = { findUnique: `Finds the ${thing} ${whose}`, findUniqueOrThrow: `Finds the ${thing} ${whose} (stops if there is none)`, findFirst: `Finds the first ${thing} ${whose}`, findFirstOrThrow: `Finds the first ${thing} ${whose} (stops if there is none)`, findMany: `Finds the ${plural(thing)} ${whose}`, create: `Saves a new ${thing}`, createMany: `Saves new ${plural(thing)}`, update: `Changes the ${thing} ${whose}`, updateMany: `Changes the ${plural(thing)} ${whose}`, upsert: `Saves the ${thing} ${whose} (adds it if it is new)`, delete: `Removes the ${thing} ${whose}`, deleteMany: `Removes the ${plural(thing)} ${whose}`, count: `Counts the ${plural(thing)} ${whose}`, aggregate: `Adds up the ${plural(thing)} ${whose}` };
    return { says: S[m[2]].trim(), does: /^(find|count|aggregate)/.test(m[2]) ? 'find' : 'save' };
  } },
  // ── Mongoose / Sequelize / Eloquent / ActiveRecord / Django (Model.method) ──
  { re: /^([A-Z]\w*)\s*\.\s*(findById|findByPk|find_by_id)\s*\(/, say: (m, c) => ({ says: `Finds the ${words(m[1])} whose id is ${valueWords(splitTop(inside(c, c.indexOf('(')) ?? '')[0] ?? '…')}`, does: 'find' }) },
  { re: /^([A-Z]\w*)\s*(?:\.|::)\s*find\s*\(/, say: (m, c) => { const a = splitTop(inside(c, c.indexOf('(')) ?? ''); return a.length === 1 && !/^\{/.test(a[0]) ? { says: `Finds the ${words(m[1])} whose id is ${valueWords(a[0])}`, does: 'find' } : { says: `Finds the ${plural(words(m[1]))} ${whoseFrom(a[0] ?? '')}`.trim(), does: 'find' }; } },
  { re: /^([A-Z]\w*)\s*\.\s*(findOne|find_by|findFirst)\s*\(/, say: (m, c) => ({ says: `Finds the ${words(m[1])} ${whereOf(inside(c, c.indexOf('(')) ?? '') || whoseFrom(inside(c, c.indexOf('(')) ?? '')}`.trim(), does: 'find' }) },
  { re: /^([A-Z]\w*)\s*(?:\.|::)\s*where\s*\(\s*["']([\w.]+)["']\s*,\s*(?:["'](?:=|==)["']\s*,\s*)?([^)]+?)\s*\)\s*(?:->|\.)\s*(first|get|firstOrFail|count|exists)\s*\(\s*\)$/, say: (m) => ({ says: `${{ first: 'Finds the first', firstOrFail: 'Finds the first', get: 'Finds the', count: 'Counts the', exists: 'Checks whether there are' }[m[4]]} ${m[4] === 'first' || m[4] === 'firstOrFail' ? words(m[1]) : plural(words(m[1]))} whose ${words(m[2])} is ${valueWords(m[3])}${m[4] === 'firstOrFail' ? ' (stops if there is none)' : ''}`, does: 'find' }) },
  { re: /^([A-Z]\w*)\s*\.\s*(findAll|where|all|filter)\s*\(/, say: (m, c) => ({ says: `Finds the ${plural(words(m[1]))} ${whereOf(inside(c, c.indexOf('(')) ?? '') || whoseFrom(inside(c, c.indexOf('(')) ?? '')}`.trim(), does: 'find' }) },
  // A model class (not a language built-in: Object.create makes an object, it saves nothing).
  { re: /^(?!(?:Object|Array|Promise|Symbol|Reflect|Proxy|JSON|Math|Date|Error|URL|String|Number|Map|Set|WeakMap|Stream|Path|Paths|File|Files|Thread|Task|Channel|Pattern|List|Collections|Optional|Executors|Duration|Instant|UUID|Uri|Logger|Http\w*|Request|Response|Headers|Blob|Intl|React|Vue|Ember|Ext|Class)\b)([A-Z]\w*)\s*(?:\.|::)\s*(create|insert|insertMany|bulkCreate|create!)\s*\((?!\s*\))/, say: (m, c) => { const w = whoseFrom(inside(c, c.indexOf('(')) ?? '').replace(/^whose /, ''); return { says: `Saves a new ${words(m[1])}${w ? ` with ${w.replace(/ is /g, ' ').replace(/ and /g, ', ')}` : ''}`, does: 'save' }; } },
  { re: /^([A-Z]\w*)\s*\.\s*(updateOne|updateMany|findByIdAndUpdate|findOneAndUpdate|update_all)\s*\(/, say: (m) => ({ says: `Changes ${/Many|all/.test(m[2]) ? `the ${plural(words(m[1]))}` : `a ${words(m[1])}`}`, does: 'save' }) },
  { re: /^([A-Z]\w*)\s*\.\s*(deleteOne|deleteMany|findByIdAndDelete|destroy|destroy_all|delete_all)\s*\(/, say: (m) => ({ says: `Removes ${/Many|all/.test(m[2]) ? `the ${plural(words(m[1]))}` : `a ${words(m[1])}`}`, does: 'save' }) },
  { re: /^([A-Z]\w*)\s*\.\s*(countDocuments|count)\s*\(/, say: (m) => ({ says: `Counts the ${plural(words(m[1]))}`, does: 'find' }) },
  { re: /^([A-Z]\w*)\.objects\s*\.\s*(get|filter|exclude|create|all|count|get_or_create|update_or_create)\s*\(/, say: (m, c) => {
    const thing = words(m[1]), args = inside(c, c.indexOf('(', m.index + m[0].length - 1)) ?? '', whose = whoseFrom(args);
    const S = { get: `Finds the ${thing} ${whose}`, filter: `Finds the ${plural(thing)} ${whose}`, exclude: `Finds the ${plural(thing)} except those ${whose}`, create: `Saves a new ${thing}`, all: `Finds all the ${plural(thing)}`, count: `Counts the ${plural(thing)}`, get_or_create: `Finds the ${thing} ${whose}, or saves a new one`, update_or_create: `Changes the ${thing} ${whose}, or saves a new one` };
    return { says: S[m[2]].trim(), does: /^(get|filter|exclude|all|count)$/.test(m[2]) ? 'find' : 'save' };
  } },
  // ── SQLAlchemy ──
  { re: /^(?:self\.)?(?:db\.)?session\s*\.\s*query\s*\(\s*([A-Z]\w*)\s*\)(.*)$/, say: (m) => { const f = m[2].match(/\.filter(?:_by)?\s*\((.*?)\)\s*\.\s*(first|one|all|count|one_or_none|scalar)\s*\(\s*\)\s*$/); const thing = words(m[1]); const cond = f ? f[1].replace(/\b[A-Z]\w*\.(\w+)\s*==\s*/g, '$1=') : ''; const whose = whoseFrom(cond); return { says: f ? ({ first: `Finds the first ${thing} ${whose}`, one: `Finds the ${thing} ${whose}`, one_or_none: `Finds the ${thing} ${whose}, if there is one`, all: `Finds the ${plural(thing)} ${whose}`, count: `Counts the ${plural(thing)} ${whose}`, scalar: `Finds the ${thing} ${whose}` }[f[2]]).trim() : `Finds ${plural(thing)}`, does: 'find' }; } },
  { re: /^(?:self\.)?(?:db\.)?session\s*\.\s*(add|add_all|delete|merge)\s*\(\s*([\w.]+)/, say: (m) => ({ says: `${{ add: 'Adds', add_all: 'Adds', delete: 'Marks', merge: 'Adds' }[m[1]]} ${valueWords(m[2])} ${m[1] === 'delete' ? 'to be removed' : 'to be saved'}`, does: 'save' }) },
  { re: /^(?:self\.)?(?:db\.)?session\s*\.\s*commit\s*\(\s*\)$/, say: () => ({ says: 'Saves the changes to the database', does: 'save' }) },
  { re: /^(?:self\.)?(?:db\.)?session\s*\.\s*rollback\s*\(\s*\)$/, say: () => ({ says: 'Throws away the unsaved changes', does: 'save' }) },
  { re: /^(?:self\.)?(?:db\.)?session\s*\.\s*(?:get)\s*\(\s*([A-Z]\w*)\s*,\s*(.+)\)$/, say: (m) => ({ says: `Finds the ${words(m[1])} whose id is ${valueWords(m[2])}`, does: 'find' }) },
  // ── Spring Data / JPA / repositories ──
  { re: /^(?:this\.)?(\w*[Rr]epo(?:sitory)?)\s*\.\s*(findById|getById|getReferenceById|existsById|deleteById|findAll|save|saveAll|delete|deleteAll|count|(?:find|get|read|query|search|stream|count|exists|delete|remove)(?:All|First|Top\d*|One)?By\w+)\s*\(/, say: (m, c) => {
    const thing = words(m[1].replace(/^_/, '').replace(/[Rr]epo(?:sitory)?$/, '')) || 'item', args = inside(c, c.indexOf('(', m.index + m[0].length - 1)) ?? '';
    const derived = derivedWhose(m[2], args);
    if (derived) return { says: `${/^count/.test(m[2]) ? 'Counts' : /^exists/.test(m[2]) ? 'Checks whether there is a' : /^(delete|remove)/.test(m[2]) ? 'Removes the' : 'Finds the'} ${/^count/.test(m[2]) ? plural(thing) : thing} ${derived}`.replace('Counts ', 'Counts the ').replace('Checks whether there is a ', 'Checks whether there is a '), does: /^(delete|remove)/.test(m[2]) ? 'save' : 'find' };
    const S = { findById: `Finds the ${thing} whose id is ${valueWords(args)}`, getById: `Finds the ${thing} whose id is ${valueWords(args)}`, getReferenceById: `Finds the ${thing} whose id is ${valueWords(args)}`, existsById: `Checks whether there is a ${thing} whose id is ${valueWords(args)}`, deleteById: `Removes the ${thing} whose id is ${valueWords(args)}`, findAll: `Finds all the ${plural(thing)}`, save: `Saves ${valueWords(args)}`, saveAll: `Saves ${valueWords(args)}`, delete: `Removes ${valueWords(args)}`, deleteAll: `Removes all the ${plural(thing)}`, count: `Counts the ${plural(thing)}` };
    return { says: S[m[2]], does: /^(find|get|exists|count)/.test(m[2]) ? 'find' : 'save' };
  } },
  // ── Entity Framework (C#) ──
  { re: /^(?:_?(?:context|db|dbContext|ctx))\s*\.\s*(\w+)\s*\.\s*(Add|AddAsync|Remove|Update|AddRange|RemoveRange)\s*\(\s*([\w.]+)/, say: (m) => ({ says: `${/Add/.test(m[2]) ? 'Adds' : /Remove/.test(m[2]) ? 'Marks' : 'Marks'} ${valueWords(m[3])} ${/Add/.test(m[2]) ? `to be saved in ${words(m[1])}` : /Remove/.test(m[2]) ? 'to be removed' : 'as changed'}`, does: 'save' }) },
  { re: /^(?:_?(?:context|db|dbContext|ctx))\s*\.\s*SaveChanges(?:Async)?\s*\(/, say: () => ({ says: 'Saves the changes to the database', does: 'save' }) },
  { re: /^(?:_?(?:context|db|dbContext|ctx))\s*\.\s*(\w+)\s*\.\s*FindAsync\s*\(\s*(.+?)\s*\)$|^(?:_?(?:context|db|dbContext|ctx))\s*\.\s*(\w+)\s*\.\s*Find\s*\(\s*(.+?)\s*\)$/, say: (m) => ({ says: `Finds the ${singular(words(m[1] ?? m[3]))} whose id is ${valueWords(m[2] ?? m[4])}`, does: 'find' }) },
  { re: /^(?:_?(?:context|db|dbContext|ctx))\s*\.\s*(\w+)\s*(?:\.\s*(?:Include|AsNoTracking)\s*\([^)]*\)\s*)*\.\s*(Where|FirstOrDefault(?:Async)?|First(?:Async)?|SingleOrDefault(?:Async)?|Single(?:Async)?|Any(?:Async)?|Count(?:Async)?|ToList(?:Async)?)\s*\(\s*(?:\w+\s*=>\s*)?(.*?)\)/, say: (m) => {
    const thing = words(m[1]), cond = (m[3] || '').replace(/\b\w+\.(\w+)\s*==\s*/g, '$1=').replace(/&&/g, ',');
    const whose = cond ? whoseFrom(cond) : '';
    const v = m[2].replace(/Async$/, '');
    const S = { Where: `Finds the ${thing} ${whose}`, FirstOrDefault: `Finds the first ${singular(thing)} ${whose}, if there is one`, First: `Finds the first ${singular(thing)} ${whose}`, SingleOrDefault: `Finds the ${singular(thing)} ${whose}, if there is one`, Single: `Finds the ${singular(thing)} ${whose}`, Any: `Checks whether there are ${thing} ${whose}`, Count: `Counts the ${thing} ${whose}`, ToList: `Finds all the ${thing}` };
    return { says: S[v].replace(/\s+,/, ',').trim(), does: 'find' };
  } },
  // ── GORM / database/sql (Go) ──
  { re: /^(?:\w+\.)?(?:db|DB|tx|gormDB)\s*\.\s*(First|Find|Take|Last)\s*\(\s*&?(\w+)(?:\s*,\s*(.+))?\)/, say: (m) => ({ says: `Finds ${m[1] === 'Find' ? 'the' : `the ${m[1] === 'Last' ? 'last' : 'first'}`} ${words(m[2])}${m[3] ? ` whose id is ${valueWords(m[3])}` : ''}`, does: 'find' }) },
  { re: /^(?:\w+\.)?(?:db|DB|tx)\s*\.\s*(Create|Save|Delete|Updates?)\s*\(\s*&?(\w+)/, say: (m) => ({ says: `${{ Create: 'Saves a new', Save: 'Saves', Delete: 'Removes', Update: 'Changes', Updates: 'Changes' }[m[1]]} ${words(m[2])}`, does: 'save' }) },
  { re: /^(?:\w+\.)?(?:db|DB|tx|conn|pool)\s*\.\s*(QueryRow|Query|QueryContext|QueryRowContext|Exec|ExecContext)\s*\(\s*(?:ctx\s*,\s*)?["'`]\s*(\w+)\s+(?:\*|[\w, ]+\s+)?(?:FROM\s+|INTO\s+)?(\w+)?/i, say: (m) => { const verb = m[2].toUpperCase(); const t = m[3] ? words(m[3]) : 'the database'; return { says: verb === 'SELECT' ? `Finds ${/Row/.test(m[1]) ? 'one row' : 'rows'} in ${t}` : verb === 'INSERT' ? `Saves a new row in ${t}` : verb === 'UPDATE' ? `Changes rows in ${t}` : verb === 'DELETE' ? `Removes rows from ${t}` : 'Runs a database query', does: verb === 'SELECT' ? 'find' : 'save' }; } },
  // ── Laravel query builder ──
  { re: /^DB\s*::\s*table\s*\(\s*["']([\w.]+)["']\s*\)(.*)$/, say: (m) => ({ says: /->(insert|insertGetId)\(/.test(m[2]) ? `Saves a new row in ${words(m[1])}` : /->update\(/.test(m[2]) ? `Changes rows in ${words(m[1])}` : /->delete\(/.test(m[2]) ? `Removes rows from ${words(m[1])}` : `Finds rows in ${words(m[1])}`, does: /->(insert|update|delete)/.test(m[2]) ? 'save' : 'find' }) },
  // ── Saving an object you already have (ORM instance) ──
  { re: /^(\$?[a-z_]\w*)\s*(?:\.|->)\s*(save|save!|delete|destroy)\s*\(\s*\)$/, say: (m) => ({ says: `${{ save: 'Saves', 'save!': 'Saves', delete: 'Removes', destroy: 'Removes' }[m[2]]} ${words(m[1])}`, does: 'save' }) },

  // ── Caches ──
  { re: /^(?:this\.)?(?:redis|cache|client|redisClient|_cache)\s*\.\s*(get|set|setex|del|exists|expire|incr|hget|hset)\s*\(\s*(.*)$/i, say: (m, c) => { const a = splitTop(inside(c, c.indexOf('(')) ?? ''); const k = a[0] ? valueWords(a[0]) : 'a key'; const S = { get: `Reads ${k} from the cache`, set: `Keeps ${k} in the cache`, setex: `Keeps ${k} in the cache for a while`, del: `Removes ${k} from the cache`, exists: `Checks whether ${k} is in the cache`, expire: `Sets when ${k} leaves the cache`, incr: `Adds 1 to ${k} in the cache`, hget: `Reads ${k} from the cache`, hset: `Keeps ${k} in the cache` }; return { says: S[m[1].toLowerCase()], does: /^(get|exists|hget)$/i.test(m[1]) ? 'find' : 'save' }; } },

  // ── Sign-in tokens and passwords ──
  { re: /^jwt\s*\.\s*(sign|encode)\s*\(/, say: () => ({ says: 'Makes a sign-in token', does: 'calculate' }) },
  { re: /^jwt\s*\.\s*(verify|decode)\s*\(/, say: (m) => ({ says: m[1] === 'verify' ? 'Checks the sign-in token (stops if it is not valid)' : 'Reads the sign-in token', does: 'check' }) },
  { re: /^bcrypt\s*\.\s*(hash|hashSync|hashpw|generate_password_hash)\s*\(|^generate_password_hash\s*\(/, say: () => ({ says: 'Scrambles the password so it can be stored safely', does: 'calculate' }) },
  { re: /^bcrypt\s*\.\s*(compare|compareSync|checkpw)\s*\(|^check_password_hash\s*\(/, say: () => ({ says: 'Checks the password against its scrambled copy', does: 'check' }) },

  // ── Payments, email, queues ──
  { re: /^(?:this\.)?stripe\s*\.\s*(\w+)\s*\.\s*(create|retrieve|update|list|del|cancel|confirm|capture)\s*\(/, say: (m) => ({ says: `${{ create: 'Creates', retrieve: 'Gets', update: 'Changes', list: 'Lists', del: 'Removes', cancel: 'Cancels', confirm: 'Confirms', capture: 'Captures' }[m[2]]} a Stripe ${singular(words(m[1]))}`, does: 'ask' }) },
  { re: /^(?:\w+\.)?(?:transporter|mailer|sgMail|mail|resend\.emails|ses)\s*\.\s*(sendMail|send|send_mail|send_email)\s*\(/, say: () => ({ says: 'Sends an email', does: 'send' }) },
  { re: /^send_mail\s*\(/, say: () => ({ says: 'Sends an email', does: 'send' }) },
  { re: /^(\w+)\s*\.\s*(delay|apply_async)\s*\(/, say: (m) => ({ says: `Starts ${words(m[1])} in the background`, does: 'send' }) },
  { re: /^(?:\w+\.)?(?:queue|producer|channel)\s*\.\s*(add|send|publish|enqueue|basic_publish|sendMessage)\s*\(/, say: () => ({ says: 'Puts a message on the queue', does: 'send' }) },

  // ── JSON, files, time ──
  { re: /^JSON\s*\.\s*parse\s*\(\s*(.+)\)$/, say: (m) => ({ says: `Reads ${valueWords(m[1])} as JSON`, does: 'calculate' }) },
  { re: /^JSON\s*\.\s*stringify\s*\(\s*([^,]+)/, say: (m) => ({ says: `Turns ${valueWords(m[1])} into JSON text`, does: 'calculate' }) },
  { re: /^json\s*\.\s*(loads|load)\s*\(\s*(.+)\)$/, say: (m) => ({ says: `Reads ${valueWords(m[2])} as JSON`, does: 'calculate' }) },
  { re: /^json\s*\.\s*(dumps|dump)\s*\(\s*([^,)]+)/, say: (m) => ({ says: `Turns ${valueWords(m[2])} into JSON text`, does: 'calculate' }) },
  { re: /^json\s*\.\s*Marshal\s*\(\s*(.+)\)$/, say: (m) => ({ says: `Turns ${valueWords(m[1])} into JSON`, does: 'calculate' }) },
  { re: /^json\s*\.\s*Unmarshal\s*\(\s*[^,]+,\s*&?(\w+)\s*\)$/, say: (m) => ({ says: `Reads the JSON into ${words(m[1])}`, does: 'calculate' }) },
  { re: /^json\s*\.\s*NewDecoder\s*\(\s*r\.Body\s*\)\s*\.\s*Decode\s*\(\s*&?(\w+)\s*\)$/, say: (m) => ({ says: `Reads what it was sent into ${words(m[1])}`, does: 'calculate' }) },
  { re: /^(?:fs|fsp|fs\.promises)\s*\.\s*(readFile|readFileSync)\s*\(\s*([^,)]+)/, say: (m) => ({ says: `Reads the file ${FILE_WORDS(m[2])}`, does: 'find' }) },
  { re: /^(?:fs|fsp|fs\.promises)\s*\.\s*(writeFile|writeFileSync|appendFile|appendFileSync)\s*\(\s*([^,)]+)/, say: (m) => ({ says: `${/append/.test(m[1]) ? 'Adds to' : 'Writes'} the file ${FILE_WORDS(m[2])}`, does: 'save' }) },
  { re: /^(?:fs|fsp|fs\.promises)\s*\.\s*(unlink|unlinkSync|rm|rmSync)\s*\(\s*([^,)]+)/, say: (m) => ({ says: `Removes the file ${FILE_WORDS(m[2])}`, does: 'save' }) },
  { re: /^(?:Date\.now|datetime\.now|datetime\.utcnow|time\.Now|DateTime\.Now|DateTime\.UtcNow|Instant\.now|LocalDateTime\.now|Time\.now)\s*\(?\s*\)?$/, say: () => ({ says: 'the current time', does: 'calculate', value: true }) },
];

/**
 * Read a call with the library catalog. `expr` is the call as written (an `await` in front is fine). Gives
 * { says, does } (does: find, save, ask, send, check, calculate), or null for calls the catalog does not know.
 */
export function sayLibraryCall(expr) {
  const c = String(expr).trim().replace(/^await\s+/, '').replace(/^(?:return\s+)/, '').replace(/[;]\s*$/, '').replace(/\.(?:exec|lean|then\(.*\)|unwrap\(\)|expect\(.*\)|get\(\))\s*\(\s*\)\s*$/, '').replace(/\s*\?$/, '');
  for (const entry of CATALOG) {
    const m = c.match(entry.re);
    if (!m) continue;
    try {
      const r = entry.say(m, c);
      // A yes/no field reads as a mark: "whose published is yes" -> "marked published".
      if (r?.says && !/\b(undefined|null)\b/.test(r.says)) return { ...r, says: r.says.replace(/\bwhose (\w+(?: \w+)?) is yes\b/g, 'marked $1').replace(/\bwhose (\w+(?: \w+)?) is no\b/g, 'not marked $1').replace(/ and (\w+(?: \w+)?) is yes\b/g, ' and marked $1').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim() };
    } catch { /* a call the entry cannot read stays with the general reader */ }
  }
  return null;
}

export const LIBRARY_CATALOG_SIZE = CATALOG.length;
