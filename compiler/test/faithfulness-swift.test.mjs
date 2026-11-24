// Faithfulness for Swift: each case is a minimal copy of a function graded false (D) or misleading (C) in a hand
// review of Alamofire and vapor readings; the sample is in the test name. Text with values inside keeps its literal
// parts exactly and shows each value as a «placeholder» (docs/spec.md, "Text with values inside").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';

test('vapor#18: `guard let v = Int(s) else { throw … }` stops when there is no v (not when there is one)', () => {
  const t = thunderText('a.swift', 'struct P {\n    private static func int(_ s: String, _ original: String) throws -> Int {\n        guard let v = Int(s) else { throw ParseError.invalidFormat(original) }\n        return v\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: Is v set\?/, /Stop: ParseError/), 'no');
});

test('Alamofire#4/#9/#10/#14/#15/#16, vapor#4/#7/#17/#20/#21/#22: a one-expression body gives back its value', () => {
  const t = thunderText('a.swift', 'struct H {\n    public static func authorization(bearerToken: String) -> HTTPHeader {\n        authorization("Bearer \\(bearerToken)")\n    }\n    public func patch(_ url: URI) async throws\n        -> ClientResponse\n    {\n        try await self.send(.patch, to: url)\n    }\n    public var successDescription: String? {\n        self.makeDescription(not: false)\n    }\n    func write(_ value: Value) {\n        write { $0 = value }\n    }\n}\n');
  assert.match(t, /Authorization \(H\)[^]*Gives back the result of authorization/);
  assert.match(t, /Patch \(H\)[^]*Gives back the result of send/);
  assert.match(t, /Success description \(H\)[^]*Gives back the result of make description/);
  assert.match(t, /Write \(H\)\n  You give it: value\n  - Calls write/);
});

test('vapor#8/#9, Alamofire#11: a one-expression body with a trailing closure gives back what the last call makes, closure kept', () => {
  const t = thunderText('a.swift', 'struct H {\n    public var accept: [HTTPMediaTypePreference] {\n        self.parseDirectives(name: .accept).compactMap {\n            HTTPMediaTypePreference(directives: $0)\n        }\n    }\n    public func httpResponses(policy: Policy = .unbounded) -> StreamOf<HTTPURLResponse> {\n        stream(bufferingPolicy: policy) { [unowned self] continuation in\n            continuation.yield(1)\n        }\n    }\n}\n');
  assert.match(t, /Calls compact map with these steps.*\n    - Calls httpmedia type preference.*\n  - Gives back the result of compact map/);
  assert.match(t, /Calls stream with these steps.*\n    - Calls yield.*\n  - Gives back the result of stream/);
});

test('Alamofire#15: an Apple C function named like a type is a call, not a new value', () => {
  const t = thunderText('a.swift', 'struct H {\n    public static func hostname(_ hostname: String) -> SecPolicy {\n        SecPolicyCreateSSL(true, hostname as CFString)\n    }\n}\n');
  assert.match(t, /Gives back the result of sec policy create ssl/);
  assert.doesNotMatch(t, /a new SecPolicyCreateSSL/);
});

test('Alamofire#1: code shown as "not explained" is the code exactly as written', () => {
  const t = thunderText('a.swift', 'class A {\n    func application(_ application: UIApplication) -> Bool {\n        let splitViewController = window!.rootViewController as! UISplitViewController\n        return true\n    }\n}\n');
  assert.match(t, /`let splitViewController = window!\.rootViewController as! UISplitViewController`/);
});

test('Alamofire#3: `guard case let .stream(result) = event` asks about event, not "it"', () => {
  const t = thunderText('a.swift', 'struct S {\n    public var result: Result<Int, Error>? {\n        guard case let .stream(result) = event else { return nil }\n        return result\n    }\n}\n');
  assert.equal(sideOf(t, /Ask: Is event stream\?/, /Gives back nil/), 'no');
});

test('vapor#16: a value made in the function is not one "it is given"', () => {
  const t = thunderText('a.swift', 'struct E {\n    func singleValueContainer() -> any SingleValueEncodingContainer {\n        let container = SingleValueContainer(codingPath: codingPath)\n        self.container = container\n        return container\n    }\n    init(container: C) {\n        self.container = container\n    }\n}\n');
  assert.match(t, /Keeps container as its own container  \(line 4\)/);
  assert.match(t, /Keeps the container it is given  \(line 8\)/);
});

test('vapor#1: `for _ in xs` repeats once per item (no blank name)', () => {
  const t = thunderText('a.swift', 'func bench() {\n    for _ in benchmark.scaledIterations {\n        blackHole(1)\n    }\n}\n');
  assert.match(t, /Repeats once for each item in the benchmark's scaled iterations/);
  assert.doesNotMatch(t, /For each  in/);
});

test('text with values inside: Swift interpolation keeps the literal and shows each value as a placeholder', () => {
  const t = thunderText('a.swift', 'func hello(name: String) -> String {\n    let s = "Hello, \\(name)! You have \\(count + 1) items"\n    print("Saying \\(s) now")\n    return "Hi \\(name)"\n}\n');
  assert.match(t, /Sets s to "Hello, «name»! You have «count \+ 1» items"/);
  assert.match(t, /Writes a log or message: "Saying «s» now"/);
  assert.match(t, /Gives back "Hi «name»"/);
});

test('vapor (fresh sample) Request+Body reason: a String property holding text is not a yes/no rule', () => {
  const t = thunderText('a.swift', 'struct F {\n    public var reason: String { "The request body could not be read: \\(self.underlying)" }\n}\n');
  assert.doesNotMatch(t, /a rule|Answer: Yes/);
  assert.match(t, /Gives back "The request body could not be read: «self\.underlying»"/);
});

test('vapor (fresh sample) entrypoint: `Logger(label: …)` makes a logger; it does not write a message', () => {
  const t = thunderText('a.swift', 'struct E {\n    static func main() async throws {\n        var logger = Logger(label: "codes.vapor.app")\n        logger.logLevel = .debug\n    }\n}\n');
  assert.match(t, /Creates a new Logger as logger/);
  assert.doesNotMatch(t, /Writes a log or message/);
});

test('vapor (fresh sample) CharacterSet: a tuple with a range is two values, not "whether"', () => {
  const t = thunderText('a.swift', 'struct C {\n    var invalid: [(Int, Int)] {\n        self.strings.compactMap { offset, string in\n            return (offset, idx..<scalars.index(after: idx))\n        }\n    }\n}\n');
  assert.doesNotMatch(t, /whether offset/);
});

test('vapor (fresh sample) Directive: an input typed as an array (`[Character]`) is shown', () => {
  const t = thunderText('a.swift', 'struct D {\n    private func firstIndex(matchingAnyOf characters: [Character]) -> Int? {\n        guard characters.isEmpty == false else { return nil }\n        return 1\n    }\n}\n');
  assert.match(t, /You give it: characters/);
});

test('vapor (fresh sample) BasicCodingKey: a switch that is the whole body gives back each case\'s value', () => {
  const t = thunderText('a.swift', 'enum K {\n    public var debugDescription: String {\n        switch self {\n        case .index(let index): String(reflecting: index)\n        case .key(let key): String(reflecting: key)\n        }\n    }\n}\n');
  assert.doesNotMatch(t, /Calls string/);
  assert.match(t, /When it is index:.*\n\s+- Gives back/);
});
