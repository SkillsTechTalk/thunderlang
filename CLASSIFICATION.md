# Classification and Publication Gate

ThunderLang is developed **open-core**. The language itself is open so it can become an
industry standard; the commercial moat lives in a separate proprietary layer. This file
records what is open, what is not, and the checkpoint that keeps proprietary work from
being published by accident.

Owner entity: **Skills Tech Talk, LLC.** This is a governance document, not legal
advice.

## Tiers

- **OPEN** , published here and to npm. The language and its tooling: the spec, the
  compiler/IR, the CLI, the LSP, the runtime, the standard library, the conformance
  suite, the SDK, the Atlas schema, and the package spec. Open components must not
  depend on proprietary ones.
- **PROPRIETARY** , kept in a separate, non-public repository. The commercial layer:
  cross-application Atlas **federation** and keyless **discovery** internals, hosted
  services, the verification/evidence pipeline beyond the open interfaces, and any
  managed-registry / publisher-verification infrastructure.
- **CONFIDENTIAL** , vault only, never in any repo: the IP asset registry, invention
  dossiers, trade-secret registry, and any legal/employment material.

## What lives in this (open) repo

The compiler (`compiler/src`), the CLI, the runtime, the canonical `intent-graph-v1`
schema, the docs, and the examples. These are OPEN on purpose: a standard needs an open
reference implementation. Novelty in these components is protected by trademark, the
canonical-steward role, and the proprietary layer above, not by hiding the source.

## Publication review checkpoint

Before adding or publishing new material, confirm:

1. **Tier.** Is this OPEN? If it touches federation/discovery internals, hosted
   services, or the verification pipeline beyond published interfaces, it is
   PROPRIETARY and does not belong in this repo.
2. **Dependency rule.** Does any open module import a proprietary one? It must not.
3. **Confidential leakage.** Does it embed anything from the vault (keys, IP dossiers,
   internal strategy)? If so, stop.
4. **Brand usage.** Use "ThunderLang" per the trademark-usage policy. Do not claim a
   registered mark (®) unless registration is confirmed.

New mechanisms whose commercial value depends on secrecy should be assessed by IP
counsel **before** first public disclosure. Trademark applications, license selection,
and any patent filing are counsel-owned and are tracked outside this repo.

## Trademark

"ThunderLang" and the ThunderLang marks are held by Skills Tech Talk, LLC. Use of the
name to refer to the language is welcome; use that implies endorsement, official
status, or a compatible/"certified" claim is not permitted without written permission.
