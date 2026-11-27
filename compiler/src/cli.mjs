#!/usr/bin/env node
// The thunder command. This file only makes starting fast, then loads the CLI (cli-main.mjs).
//
// Node 22.1 and newer can keep the compiled form of Thunder's code on disk (module.enableCompileCache), so a command
// does not parse the whole compiler (about 4 MB of JavaScript) again every time it starts. It must be turned on
// before the CLI's modules load, which is why this file exists. On an older Node it does nothing, and Node's own
// NODE_DISABLE_COMPILE_CACHE=1 turns it off.
import module from 'node:module';

try { module.enableCompileCache?.(); } catch { /* not available: Thunder still runs, it just parses each time */ }
await import('./cli-main.mjs');
