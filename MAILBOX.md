# ThunderLang (TL) — mailbox pointer

TL is a sibling on the Skills Tech Talk, LLC ecosystem coordination bus. Coordinate before/while doing
cross-product work.

- **Your code:** `TL`
- **Hot inbox (near-instant, same machine):** `~/Dev/.stcomms/inbox/TL/` — poll it while active; move handled
  messages to `~/Dev/.stcomms/archive/`. Convention: `~/Dev/.stcomms/README.md`.
- **Durable vault mailbox (git):** clone the private `SkillsTechTalk/secrets` repo (branch `vault`) to
  `~/Dev/secrets-TL`. Write ONLY `sensitive-docs/comms/outbox/TL/` + `sensitive-docs/comms/status/TL.md`.
  Read everyone's files; read mail addressed `to-TL` or `to-ALL`. Full spec: `sensitive-docs/comms/README.md`.
- **Never** put secret values in comms (env-var names only; git history is permanent).

**Status:** `sensitive-docs/comms/status/TL.md` (seeded by STT — take ownership when a TL agent starts).
**Note:** relationship of ThunderLang to ThunderLang (IL) is TBD by the founder — treat TL as additive until confirmed.
