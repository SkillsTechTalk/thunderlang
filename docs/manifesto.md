# The Thunder Manifesto

For decades, humans have learned to speak the languages of computers. We learned their syntax, their rules, their
abstractions and their limitations.

Then AI changed the way software is written. Machines can now generate code in almost any programming language.

But humans still need to understand what that code does, decide what it should do and take responsibility for the
software they create.

We believe programming should evolve accordingly.

**Humans should not have to learn a new programming language every time they want to use a different technology.**

Thunder is a human-native programming language designed for the AI era. Write software in clear, structured
language. Understand it through words and visuals. Verify its behavior. Compile it to the ecosystem that best serves
your application.

Python for artificial intelligence. TypeScript for the web. Java and C# for enterprise software. Go for distributed
systems. Rust for systems programming. One language for the humans building them.

Thunder is designed to work in both directions. Read existing software in Thunder, or create new software directly
in Thunder.

AI helps us build. Compilers preserve precision. Humans retain understanding and control.

No unnecessary syntax. No hidden behavior. No proprietary execution ecosystem.

Our ambition is simple: **Make software understandable to everyone and make programming accessible to anyone.**

Thunder. Programming, made human.

## Where Thunder is today

We advertise each compilation capability only once it works. Today:

| Capability | Status |
| --- | --- |
| Read existing code in Thunder: seventeen languages (Python, TypeScript, JavaScript, Java, C#, Go, Rust, Kotlin, PHP, Ruby, SQL, C, C++, Swift, R, shell, PowerShell) plus infrastructure files | Available <!-- capability:thunderedRead --> |
| Change existing code from Thunder: the compiler writes and proves the patch in TypeScript, JavaScript, Python, and Go; other languages are handed to an AI agent and labeled AI-written | Available <!-- capability:thunderedEdit --> |
| Compile decisions and rules written in Thunder to TypeScript, Python, Go, Rust, C#, and Java, and run their examples against the generated code | Available <!-- capability:decisionTargets --> |
| Write whole programs in Thunder (Thunder Core) and run them as Python | Available <!-- capability:thunderCore --> |
| Compile Thunder Core programs to Java, C#, TypeScript, Go, and Rust | Planned <!-- capability:coreTargets --> |

The same labels appear on [thunderlang.dev](https://thunderlang.dev/#status) and come from the compiler's own data.
For every language on every axis, see the [language support matrix](/docs/language-support-matrix).

## Thunder and OpenThunder

Thunder is the language: open source under Apache 2.0, usable on its own in the browser, the terminal, VS Code, and
any AI agent that speaks MCP. OpenThunder is the IDE for AI-written code, where Thunder is most at home. Think Python
and PyCharm.

## AI-era, not AI-magic

The deterministic compiler must work without AI. Every optional AI action produces metadata: provider, model, prompt
hash, input and output hashes, verification result, and human approval status. Code an AI wrote is labeled
AI-written and checked by the same proof as code the compiler wrote. Humans approve, verify, and own the result.

## Prompt is temporary. Meaning is durable.

A prompt is a conversation:

> Build a secure invoice creation flow that prevents duplicates, audits every invoice, and never logs payment tokens.

That is useful, but it is not durable. It is not a contract. It is not cleanly version-controlled. It is not
automatically verifiable. Written in Thunder, the same intent becomes something a team can review, version, test,
explain, compile, and verify, and it stays readable after the conversation is gone.

## What Thunder is not

- Not a prompt format.
- Not magic AI code generation.
- Not a new runtime. Thunder compiles to the ecosystems people already use and gives access to their libraries
  rather than recreating them.
- Not finished. The compiler is real, deterministic, and tested, and the language is still growing. Writing whole
  programs in Thunder is not available yet. Honest work, in the open.

## Drift

Drift happens when the implementation no longer does what the team decided it should: a rule exists but no test
checks it, a limit moves in one service but not another, or an AI change alters behavior nobody asked for.
Generating code is cheap; keeping code faithful to what people decided is the hard, valuable part. Thunder makes
that decision readable, and the compiler checks every change, by a person or an AI, against it.
