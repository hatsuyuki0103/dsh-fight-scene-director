# Third-Party Notices

This package redistributes one third-party work and links against none at
runtime.

## 1. fight-scene-director (original skill)

| | |
|---|---|
| Author | AIZAO Aloong |
| Source | https://github.com/ZzzAloong/fight-scene-director |
| Pinned commit | `6265df37ae701449ef672f46db65ab15c4af9fc2` |
| License | MIT — Copyright (c) 2026 AIZAO Aloong |
| License text | [`LICENSE.upstream`](./LICENSE.upstream) (verbatim) |

Redistributed files:

| Path in this package | Relationship to upstream |
|---|---|
| `skills/fight-scene-director/references/choreography-and-camera.md` | byte-identical |
| `skills/fight-scene-director/references/examples.md` | byte-identical |
| `skills/fight-scene-director/references/interaction-routing.md` | byte-identical |
| `skills/fight-scene-director/references/output-format.md` | byte-identical |
| `skills/fight-scene-director/references/trajectory-workflow.md` | byte-identical |
| `skills/fight-scene-director/SKILL.md` | semantically unchanged; DSH harness notes + Chinese triggers added |
| `docs/upstream-SKILL.md` | byte-identical (reference copy for diffing) |
| `docs/upstream-README.md` | byte-identical (reference copy for diffing) |
| `docs/upstream-agents-openai.yaml` | byte-identical (reference copy; not an active artifact) |

Byte-identity is enforced by `test/knowledge.test.mjs` (T3.4) against
`test/fixtures/upstream-hashes.json`. If you intentionally modify a reference
file you must update that fixture and say so in `CHANGELOG.md`; otherwise the
test suite will fail by design.

See [`NOTICE`](./NOTICE) for the full list of what was ported, what was added,
and what was deliberately not redistributed.

## 2. Runtime dependencies

None. The plugin imports only Node.js built-ins (`node:fs/promises`,
`node:path`, `node:url`) and consumes the DeepSeek Harness `skills` service
through Cordis dependency injection. `@deepseek-ai/cordis` is declared as an
optional peer dependency and is supplied by the harness itself.
