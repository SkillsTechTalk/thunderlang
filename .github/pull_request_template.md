## Change summary


## Publication gate (open-core)

Confirm before merge (see CLASSIFICATION.md):

- [ ] This is OPEN-tier (language/compiler/CLI/runtime/spec/docs), not proprietary
      federation/discovery/hosting/verification internals.
- [ ] No open module imports a proprietary module.
- [ ] No vault/confidential material (keys, IP dossiers, internal strategy) is included.
- [ ] "IntentLang" brand usage follows the trademark policy (no unregistered ® claims).
- [ ] Tests pass (`node --test compiler`) and the repo gate is green (`node scripts/intent-check.mjs`).
