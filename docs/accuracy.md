# How accurate is Thunder?

Thunder is only useful if people can trust it: a picture that is wrong gives a false sense of security. This page
measures it on real open-source code, with `compiler/scripts/accuracy.mjs`, and is updated as the reader changes.

```
node compiler/scripts/accuracy.mjs <repo>... [--io] [--failures] [--samples out.md --per-language 40]
```

## What is measured

1. **Round trip (exact).** A rule is read into a Thunder card, written back as code in every language Thunder
   writes (TypeScript, Python, Go, Rust, C#, Java), read again, and both are run on every edge case. "Same" means the
   same answer everywhere. "Different" would mean Thunder changed what a rule decides.
2. **What a step keeps.** Every number and quoted text in Thunder's wording must appear in the code ("invented"
   counts the steps where one does not), and how many of the code's names the wording mentions ("names kept").
   Steps Thunder shows as code are honest but not explained.
3. **Big Picture against an independent count.** Classes, routes, and methods counted by a separate, simple scan:
   classes drawn, routes drawn, and methods owned by the wrong Thing.
4. **Inputs and outputs.** Parameter names and values read from a request, against "You give it"; functions whose
   code returns, sends, or throws something, against whether Thunder shows an ending.

## Latest results (eleven repositories, nine languages)

| Repo | rules | round trips same | steps explained | names kept | steps with an invented value | classes drawn | routes drawn | methods misplaced | inputs shown | endings shown |
|---|---|---|---|---|---|---|---|---|---|---|
| JakeWharton__timber | 0 | n/a (0/0) | 95.1% | 48.5% | 0 of 503 | 100% (10/10) | 0/0 | 0 of 96 | 81% (128/158) | 100% |
| expressjs__express | 3 | 33.3% (6/18) | 90.8% | 58.9% | 0 of 738 | n/a (0/0) | 51/68 | 0 of 143 | 100% (99/99) | 86.1% |
| google__gson | 12 | 8.3% (6/72) | 89.1% | 64.5% | 0 of 5064 | 100% (164/164) | 0/0 | 0 of 1214 | 100% (909/909) | 96.2% |
| guzzle__guzzle | 16 | 17.7% (17/96) | 84.8% | 59.2% | 0 of 3833 | 96.2% (51/53) | 0/0 | 0 of 714 | 99.8% (646/647) | 97% |
| jaredpalmer__formik | 3 | 66.7% (12/18) | 86.9% | 63.1% | 0 of 1051 | 100% (7/7) | 0/0 | 0 of 202 | 98.5% (197/200) | 97.3% |
| jbogard__MediatR | 4 | 75% (18/24) | 92.5% | 46.2% | 0 of 986 | 100% (90/90) | 0/0 | 0 of 228 | 82.1% (261/318) | 96.9% |
| psf__requests | 3 | 0% (0/18) | 92.2% | 68.1% | 0 of 1453 | 100% (40/40) | 0/0 | 0 of 268 | 99% (293/296) | 98.9% |
| rust-lang__log | 1 | 0% (0/6) | 87.6% | 45.2% | 0 of 863 | 100% (30/30) | 0/0 | 0 of 412 | 75.9% (202/266) | 100% |
| sinatra__sinatra | 17 | 0% (0/102) | 77.4% | 47.9% | 0 of 1429 | 100% (44/44) | 3/4 | 0 of 542 | 78.3% (394/503) | 95.2% |
| sindresorhus__ky | 1 | 0% (0/6) | 92.4% | 63.3% | 0 of 658 | 0% (0/2) | 0/7 | 0 of 117 | 95.6% (130/136) | 100% |
| spf13__cobra | 2 | 50% (6/12) | 95.6% | 60.5% | 0 of 5198 | 100% (9/9) | 0/0 | 0 of 589 | 99.7% (646/648) | 81.4% |

All: round trips same 17.5% (65/372; different 0, not read back 114, cannot run 193, not written 0); steps explained 89.3%; names kept 59%; steps with an invented value 0

## What the numbers say

- **No invented values and no changed answers.** No step shows a number or text the code does not contain, and no
  rule gave a different answer after the round trip.
- **The round trip is mostly unchecked, not wrong.** Most rules cannot yet be written back or run on both sides
  (string comparisons, calls, and rules that use facts the class keeps), so they are counted as not checked. That
  is coverage to win, and it is never reported as "same".
- **Inputs and endings are near complete** for Java, Go, PHP, Python, TypeScript, and JavaScript; Rust, Ruby,
  Kotlin, and C# miss some inputs, and some Go and Express endings are missed.
- **Names kept** is about how much detail the wording carries ("Calls save" without what it saves); it is the main
  place Thunder still loses information on purpose to stay short, and the next target.

This is measured on code, not by watching people read it. A person's own check of hundreds of sampled readings is
the next step.
