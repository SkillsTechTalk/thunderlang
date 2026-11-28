// @skillstech/thunderlang/program: write and run Thunder Core anywhere, including in a browser. Compile a program,
// run it on the Thunder engine, show its screens, and turn it into Python, TypeScript, C#, Java, Go, Rust, or React.
// Everything here is browser-safe (no node: imports; test/program-entry.test.mjs checks the whole import graph).
// Files are read only through the `readText` you pass, so a browser can hand in its own.
export { compileCore, diagnosticsText, parseCore, checkCore, formatCore, CODES, formatDiagnostic, CORE_VERSION } from './core/index.mjs';
export { runInProcess, recordedRun, testInProcess, screenApp, screenOutline } from './core/engine-core.mjs';
export { toPython } from './core/target-python.mjs';
export { toTypeScript } from './core/target-typescript.mjs';
export { toCSharp } from './core/target-csharp.mjs';
export { toJava } from './core/target-java.mjs';
export { toGo, goNamespaces } from './core/target-go.mjs';
export { toRust } from './core/target-rust.mjs';
export { toReact, hasScreens } from './core/target-react.mjs';
export { pythonToCore } from './core/from-python.mjs';
export { examplesOf, EXAMPLES_SCHEMA } from './examples.mjs';
export { coreChanges, affectedBy, CORE_CHANGES_SCHEMA, AFFECTED_SCHEMA } from './core-changes.mjs';
