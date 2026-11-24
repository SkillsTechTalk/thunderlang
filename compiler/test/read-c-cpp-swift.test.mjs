// C, C++, and Swift in Thunder: functions, decisions, steps in plain words, Things, routes, file languages, and
// reading that stays fast on long comment and whitespace runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode, detectLanguage, READ_LANGUAGES } from '../src/read.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { languageForFile, liftSource } from '../src/lift.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

const byName = (r, n) => r.items.find((i) => i.name === n);
const said = (steps) => (steps || []).map((s) => s.says);
const flat = (steps) => (steps || []).flatMap((s) => [s, ...flat(s.children), ...flat(s.otherwise), ...(s.handlers || []).flatMap((h) => flat(h.steps))]);

test('C, C++, and Swift are read languages, by file and by pasted text', () => {
  for (const l of ['c', 'cpp', 'swift']) assert.ok(READ_LANGUAGES.includes(l));
  assert.equal(languageForFile('a.c'), 'c');
  assert.equal(languageForFile('a.cpp'), 'cpp');
  assert.equal(languageForFile('a.swift'), 'swift');
  assert.equal(readableLanguage('src/a.cc'), 'cpp');
  assert.equal(readableLanguage('src/a.h', 'int add(int a, int b);'), 'c');
  assert.equal(readableLanguage('src/a.h', 'namespace x { class A {}; }'), 'cpp');
  // C names such as `template` and `typename`, and C++ lines kept for C++ callers, do not make a header C++.
  assert.equal(readableLanguage('sds.h', '#ifdef __cplusplus\nextern "C" {\n#endif\nsds sdstemplate(const char *template);\n'), 'c');
  assert.equal(detectLanguage('#include <stdio.h>\nint main(void) { printf("hi"); return 0; }'), 'c');
  assert.equal(detectLanguage('#include <vector>\nint f(std::vector<int> v) { return v.size(); }'), 'cpp');
  assert.equal(detectLanguage('func fee(total: Double) -> String {\n  return "A"\n}'), 'swift');
  assert.equal(detectLanguage('func Fee(total float64) string {\n\treturn "A"\n}'), 'go');
  assert.ok(liftSource('func fee(total: Double) -> String { return "A" }', { language: 'swift' }).ok);
});

const C_SRC = `#include <stdlib.h>
#include <string.h>

/* Decide what the heater should do. */
static const char *heater_mode(double temp, int window_open) {
    if (window_open) return "Off";
    if (temp < 18.5) {
        return "Heat";
    }
    return "Idle";
}

char *
copy_name(const char *name)
{
    if (name == NULL) return NULL;
    size_t len = strlen(name);
    char *buf = malloc(len + 1);
    Book *books = calloc(10, sizeof(Book));
    memcpy(buf, name, len + 1);
    memset(books, 0, sizeof(Book) * 10);
    free(books);
    return buf;
}

int count_items(const char *text, int *out) {
    int count = 0;
    for (int i = 0; text[i] != '\\0'; i++) {
        switch (text[i]) {
        case ',':
        case ';':
            count++;
            break;
        case '#':
            count += 2;
        case '!':
            goto done;
        default:
            break;
        }
    }
    do {
        count--;
    } while (count > 100);
    while (1) {
        if (count < 0) break;
        count -= 2;
    }
done:
    *out = count;
    if (strcmp(text, "none") == 0) exit(1);
}
`;

test('C: functions (static, return type on its own line), decisions, and doc comments', () => {
  const r = readCode(C_SRC, { file: 'heat.c' });
  const h = byName(r, 'heater_mode');
  assert.equal(h.kind, 'decision');
  assert.deepEqual(h.rules.map((x) => [x.when, x.result]), [['window_open', 'Off'], ['temp < 18.5', 'Heat']]);
  assert.equal(h.otherwise.result, 'Idle');
  assert.equal(h.doc, 'Decide what the heater should do.');
  const c = byName(r, 'copy_name');
  assert.equal(c.line, 14);
  assert.deepEqual(c.inputs.map((p) => [p.name, p.type]), [['name', 'string']]);
});

test('C: memory, copies, switch with fall-through, goto and labels, do … while, and endless loops read plainly', () => {
  const r = readCode(C_SRC, { file: 'heat.c' });
  const c = said(byName(r, 'copy_name').steps);
  assert.ok(c.includes('Sets len to the length of name'), c.join(' | '));
  assert.ok(c.includes('Gets memory for buf'));
  assert.ok(c.includes('Gets memory for 10 books as books'));
  assert.ok(c.includes('Copies name into buf'));
  assert.ok(c.includes('Fills books with zeros'));
  assert.ok(c.includes('Frees books'));
  assert.equal(c[0], 'If name is empty');
  const steps = byName(r, 'count_items').steps;
  const sw = steps[1].children[0];
  assert.equal(sw.says, 'Chooses by text[i]');
  assert.deepEqual(said(sw.children), ["When it is ',' or ';'", "When it is '#', then carries on into the next case", "When it is '!'", 'Otherwise']);
  assert.equal(sw.children[2].children[0].says, 'Jumps to the "done" part');
  assert.equal(steps[2].says, 'Runs once, then repeats while count is more than 100');
  assert.equal(steps[3].says, 'Repeats until a step inside stops it');
  assert.equal(steps[3].children[0].children[0].says, 'Leaves the loop');
  assert.equal(steps[4].says, 'The "done" part starts here');
  assert.equal(steps[5].says, 'Writes count where out points');
  assert.equal(steps[6].says, 'If text is "none"');
  assert.equal(steps[6].children[0].says, 'Stops the program (exit code 1)');
});

test('C: an error return after a check stays what the code says', () => {
  const r = readCode('int open_file(const char *path) {\n    int fd = open(path, 0);\n    if (fd < 0) return -1;\n    use(fd);\n    return 0;\n}\n', { language: 'c' });
  const f = byName(r, 'open_file');
  assert.deepEqual([...(f.guards || []).map((g) => g.says), ...(f.rules || []).map((x) => `${x.when} -> ${x.result}`)].some((x) => /-1/.test(x)), true);
  assert.ok(!JSON.stringify(f).includes('fail'), 'Thunder does not claim -1 means failure');
});

const CPP_SRC = `#include <stdexcept>
#include <string>
#include <vector>

namespace shop {

class Cart {
public:
    explicit Cart(int limit = 10) : limit_(limit) {}
    ~Cart() { items_.clear(); }
    int total() const;
private:
    int limit_;
    std::vector<std::string> items_;
};

int Cart::total() const {
    int sum = 0;
    for (const auto& item : items_) {
        sum += item.size();
    }
    std::sort(items_.begin(), items_.end(), [](const std::string& a, const std::string& b) {
        return a.size() < b.size();
    });
    try {
        validate(sum);
    } catch (const std::invalid_argument& e) {
        std::cerr << e.what() << std::endl;
        throw;
    } catch (...) {
        return -1;
    }
    if (sum > limit_) {
        throw std::runtime_error("too many items");
    }
    Node* n = new Node(3);
    int* arr = new int[10];
    delete n;
    delete[] arr;
    return sum;
}

}  // namespace shop
`;

test('C++: methods in and outside the class, constructors, range-for, lambdas, try/catch by type, new and delete', () => {
  const r = readCode(CPP_SRC, { file: 'cart.cpp' });
  assert.deepEqual(r.items.filter((i) => i.kind === 'function' || i.kind === 'decision').map((i) => i.name), ['Cart', '~Cart', 'total']);
  const t = byName(r, 'total');
  assert.equal(t.qualifier, 'Cart');
  const s = t.steps;
  assert.equal(s[1].says, 'For each item in items');
  assert.equal(s[2].says, 'Calls sort with these steps');
  assert.equal(s[3].kind, 'try');
  assert.deepEqual(s[3].handlers.map((h) => h.says), ['If invalid argument goes wrong', 'If anything goes wrong']);
  assert.deepEqual(said(s[3].handlers[0].steps), ['Writes a log or message: "«e.what()»«std::endl»"', 'Passes the error on']);
  assert.equal(s[4].says, 'If sum is more than limit');
  assert.equal(s[4].children[0].says, 'Fails with runtime error: "too many items"');
  assert.deepEqual(said(s.slice(5, 9)), ['Creates a new Node as n', 'Gets memory for 10 ints as arr', 'Frees n', 'Frees arr']);
});

test('C++: Big Picture: the class knows its facts and how they start; a method in another file still belongs to it', () => {
  const header = 'class Library {\npublic:\n    explicit Library(int maxBooks = 3) : maxBooks_(maxBooks) {}\n    std::string lateFee(int daysLate) const;\nprivate:\n    int maxBooks_;\n};\n';
  const impl = 'std::string Library::lateFee(int daysLate) const {\n    if (daysLate <= 7) {\n        return "SmallFee";\n    }\n    return "BigFee";\n}\n';
  const m = thunderModel([{ path: 'library.h', source: header }, { path: 'library.cpp', source: impl }]);
  const lib = m.things.find((x) => x.name === 'Library');
  assert.equal(lib.kind, 'thing');
  assert.deepEqual(lib.knows.map((k) => [k.label, k.start]), [['max books', '3 unless told otherwise']]);
  const fee = m.members.find((x) => x.name === 'lateFee');
  assert.equal(fee.owner, lib.id);
  assert.match(modelText(m, lib.id), /Late fee/);
});

const SWIFT_SRC = `import Foundation

enum LibraryError: Error {
    case full
    case notFound(String)
}

func borrow(_ title: String, for user: User?) throws -> Loan {
    guard let user = user else {
        throw LibraryError.notFound("no user")
    }
    guard user.loans.count < 3 else { throw LibraryError.full }
    defer { log("borrow done") }
    for i in 0..<3 {
        print(i)
    }
    if let book = catalog.find(title), book.available {
        book.available = false
    } else {
        print("missing")
    }
    do {
        try save(user)
    } catch let error as DatabaseError {
        print(error)
    } catch {
        throw error
    }
    return Loan(title: title, user: user)
}

func tier(points: Int) -> Plan {
    if points >= 100 { return .gold }
    return .basic
}
`;

test('Swift: guard as a Stop, if let as "is set", defer, ranges, do/try/catch by type, and new values', () => {
  const r = readCode(SWIFT_SRC, { file: 'Library.swift' });
  const b = byName(r, 'borrow');
  assert.deepEqual(b.inputs.map((p) => [p.name, p.type]), [['title', 'string'], ['user', 'User?']]);
  const s = b.steps;
  assert.equal(s[0].says, 'If not: user is set');
  assert.equal(s[0].children[0].says, 'Fails with LibraryError (not found): "no user"');
  assert.equal(s[1].says, 'If not: user.loans.count is less than 3');
  assert.equal(s[1].children[0].kind, 'fail');
  assert.equal(s[2].says, 'At the end, runs these steps');
  assert.equal(s[3].says, 'Counts i from 0 to 2');
  assert.equal(s[4].says, 'If book is set and book is available');
  assert.equal(s[4].otherwise.length, 1);
  assert.equal(s[5].kind, 'try');
  assert.deepEqual(s[5].handlers.map((h) => h.says), ['If DatabaseError goes wrong', 'If anything goes wrong']);
  assert.equal(s[5].handlers[1].steps[0].says, 'Passes the error on');
  assert.equal(s[6].says, 'Returns a new Loan');
  assert.ok(b.guards.some((g) => /user is not set/.test(g.says)));
  const t = byName(r, 'tier');
  assert.equal(t.kind, 'decision');
  assert.deepEqual(t.rules.map((x) => x.result), ['gold']);
  assert.equal(t.otherwise.result, 'basic');
});

test('Swift: Vapor routes, closures and use: handlers, with Abort read as HTTP refusals', () => {
  const src = 'import Vapor\n\nfunc routes(_ app: Application) throws {\n    app.get("orders", ":id") { req async throws -> Order in\n        guard let order = try await Order.find(req.parameters.get("id"), on: req.db) else {\n            throw Abort(.notFound)\n        }\n        return order\n    }\n    let todos = app.grouped("todos")\n    todos.post(use: create)\n}\n\nfunc create(req: Request) async throws -> Todo {\n    let todo = try req.content.decode(Todo.self)\n    return todo\n}\n';
  const r = readCode(src, { file: 'routes.swift' });
  const get = r.items.find((i) => i.route?.method === 'GET');
  assert.equal(get.route.path, '/orders/:id');
  assert.equal(get.steps[0].children[0].says, 'Fails with 404 Not Found');
  assert.deepEqual(byName(r, 'create').route, { method: 'POST', path: '/todos' });
  assert.deepEqual(said(byName(r, 'routes').steps), ['Handles GET /orders/:id with these steps', 'Works out todos from grouped', 'Handles POST under todos with create']);
});

test('Swift: Big Picture: an extension in another file belongs to the type; a protocol is not a Thing', () => {
  const m = thunderModel([
    { path: 'Library.swift', source: 'protocol Lending { func lend() }\n\nstruct Library {\n    var maxBooks = 3\n    var overflow: [Book] = []\n    var isFull: Bool { overflow.count >= maxBooks }\n}\n' },
    { path: 'Library+Fees.swift', source: 'extension Library {\n    func lateFee(daysLate: Int) -> String {\n        if daysLate <= 7 { return "SmallFee" }\n        return "BigFee"\n    }\n}\n' },
  ]);
  assert.deepEqual(m.things.map((t) => t.name), ['Library']);
  const lib = m.things[0];
  assert.equal(lib.kind, 'thing');
  assert.deepEqual(lib.knows.map((k) => [k.label, k.kind, k.start]), [['max books', null, '3 at first'], ['overflow', 'a list of Books', 'empty at first']]);
  assert.ok(m.members.find((x) => x.name === 'lateFee').owner === lib.id);
  assert.ok(m.members.find((x) => x.name === 'isFull').owner === lib.id);
});

test('reading stays fast on long comment, whitespace, and declaration runs (no backtracking blow-up)', () => {
  const big = [
    `/*${' word'.repeat(40000)} */\nint f(int x) {\n${'    \n'.repeat(20000)}    return x;\n}\n`,
    `${'// note\n'.repeat(20000)}${' '.repeat(50000)}\nstatic int g(void) { return 1; }\n`,
    `func a(x: Int) -> Int {\n${'        \n'.repeat(20000)}    return x\n}\n/// ${'doc '.repeat(30000)}\nprotocol P { func p() -> Int\n${'  \n'.repeat(10000)}}\n`,
  ];
  for (const [i, src] of big.entries()) {
    const t0 = performance.now();
    const r = readCode(src, { language: i === 2 ? 'swift' : i === 1 ? 'c' : 'cpp' });
    assert.ok(r.items.length >= 1);
    assert.ok(performance.now() - t0 < 3000, `case ${i} took ${Math.round(performance.now() - t0)} ms`);
  }
});

test('a classic switch in an older reader is one question with each case holding its steps (the faithfulness gate)', () => {
  const r = readCode('function k(x) {\n  switch (x) {\n    case 1:\n      log("a");\n      break;\n  }\n}\n', { language: 'javascript' });
  assert.deepEqual(said(byName(r, 'k').steps[0].children), ['When it is 1']);
  assert.deepEqual(said(byName(r, 'k').steps[0].children[0].children), ['Writes a log or message: a']);
  assert.ok(flat(byName(r, 'k').steps).length >= 3);
});
