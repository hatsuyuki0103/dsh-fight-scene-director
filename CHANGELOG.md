# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-13

Initial DeepSeek Harness port of the Codex skill
`fight-scene-director`.

### Added

- `index.mjs` — host plugin entry (`name` / `inject: ['skills']` / `apply`).
  Registers the bundled skill through the public `skills` service; every
  contribution is disposed with the fiber, so the plugin has no process-level
  side effects.
- `lib/skills-provider.mjs` — embedded, lazy skill provider:
  `<root>/<name>/SKILL.md` discovery, minimal frontmatter parsing, kebab-case
  name normalization with `-2`/`-3` collision suffixes, candidate-identity
  validation in `get()`, and `AbortSignal` support.
- `cordis.patch.yml` + `package.json#dsh.bundle.patch` — profile bundle patch
  so `dsh plugin --profile <name> add` actually mounts the plugin as a layer.
- `skills/fight-scene-director/SKILL.md` — upstream skill body with a
  `DeepSeek Harness Notes` section (how the skill is loaded; how
  `references/...` resolves against the printed skill base directory) and a
  Chinese trigger vocabulary appended to the `description` frontmatter field.
- `skills/fight-scene-director/references/*.md` — the five upstream knowledge
  files, copied **byte-for-byte** from upstream commit
  `6265df37ae701449ef672f46db65ab15c4af9fc2`.
- `test/` — dependency-free `node --test` suite: skill-file contract (T1),
  provider behavior (T2), knowledge fidelity against pinned upstream hashes
  (T3), plugin entry shape (T4), fake-context smoke (T5).
- `docs/` — port report (`PORT-NOTES.zh.md`), upstream file copies for diffing
  (`upstream-SKILL.md`, `upstream-README.md`, `upstream-agents-openai.yaml`),
  and a recipe for reproducing the upstream snapshot
  (`reproduce-upstream.md`).
- `NOTICE`, `THIRD_PARTY_NOTICES.md`, `LICENSE.upstream` — MIT compliance for
  redistributing the original work.

### Changed

- Invocation model: the upstream `$fight-scene-director` prefix is Codex syntax.
  In DeepSeek Harness the skill is discovered from its `description` and loaded
  by the `skill` tool, so `SKILL.md` now documents both the implicit and the
  explicit (`skill fight-scene-director`) path.
- `description` frontmatter gained Chinese triggers (打戏 / 动作导演 / 武打设计 /
  分镜 / 运镜 / 轨迹图 / 站位图 / 变身 / 召唤 / 群战 / 法术对轰) because DSH
  matches skills by description text.
- Removed the redundant `Created by **AIZAO Aloong**.` body line; the same
  credit is carried by `NOTICE`, `README.zh.md`, and `LICENSE.upstream`.

### Not ported

- `agents/openai.yaml` is Codex-specific (`display_name`, `short_description`,
  `default_prompt`, `policy.allow_implicit_invocation`) and has no DSH
  equivalent. It is kept in `docs/` for reference only and is **not** shipped
  as an active artifact. Note one deliberate semantic difference: upstream sets
  `allow_implicit_invocation: false`, while this port is model-invocable so a
  plain "帮我设计一段打戏" request reaches it. Load it explicitly with
  `skill fight-scene-director` if you prefer the stricter behaviour.

### Verification

Recorded on the machine where the port was assembled (Windows, Node 24,
`dsh 0.1.5-rc.1`):

| Check | Result |
|---|---|
| `node --test "test/*.test.mjs"` | see the run log in the release commit / CI |
| `references/*.md` vs pinned upstream commit (T3.4) | byte-identical (5/5) |
| Skill appears in session catalog after install | see `README.md` → Verify the install |
| `dsh plugin --profile web add github:…` | see CI workflow `smoke.yml` |

### Known limitations

- No npm publication: distribution is GitHub-only (`github:user/repo`), by
  design, so no registry account is required.
- The upstream README's WeChat article origin could not be read automatically
  (the platform served a captcha page); the port is based on the upstream
  repository source and a user-confirmed skill identity.
