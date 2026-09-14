# Changelog

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] — 2026-09-14

Follow-up from a second, mutation-driven review of 1.1.0. Two things were
outright wrong: a shipped CI gate was red, and the 1.1.0 changelog made a
promise about catalogue refresh that the harness cannot keep.

### Fixed

- **The end-to-end install gate was red.** `.github/workflows/smoke.yml` still
  grepped the composed profile tree for `fsd-skills`, the provider's *internal*
  name, which 1.1.0 deliberately removed from the patch row. Under
  `set -euo pipefail` that step exited 1, so the project's only real
  install-and-mount verification never passed. The assertion now greps
  `id: dsh-fight-scene-director` / `name: dsh-fight-scene-director`, and
  additionally fails if the internal name ever leaks back into a row id. Gated
  by T4.5, which mutation-testing showed was previously unguarded.
- **`description: >- # note` still published the literal `>-`.** The block-scalar
  test ran *before* comment stripping, so a trailing YAML comment made an
  otherwise-valid indicator look like ordinary text. The comment is now stripped
  first. The indicator pattern also missed the bare chomping forms `>-` / `>+`
  (and `|-2`-style orderings), all of which are legal YAML and were being
  published verbatim. Gated by T2.8f and T2.15 (six indicator spellings).
- **A deleted or unreadable skill stayed in the catalogue forever.** `get()`
  returned `undefined` without dropping the cached entry, so the catalogue kept
  advertising a skill whose every load failed — visible to the model as a skill
  that exists but never works. It now drops the entry and requests
  invalidation, mirroring the rename/mismatch branch. Gated by T2.20.
- **`get()` still echoed `resourceBase` and `source` from the mutable
  candidate.** The 1.1.0 fix covered `name` and `description` but not these, so
  rewriting `candidate.resourceBase` redirected the harness's
  `Base directory for this skill:` hint to any directory of the caller's
  choosing — which the model would then read as skill resources. Both are now
  re-derived from the file on disk. Gated by T2.19.
- **Invocation policy was ignored, and `whenToUse` was fabricated.** The
  official filesystem provider honours `disable-model-invocation` and
  `user-invocable` and rejects the legacy camelCase spellings; this provider
  hardcoded `{modelInvocable: true, userInvocable: true}` and derived
  `whenToUse` from a non-standard `argument-hint`. A skill mounted through
  `extraSkillDirs` that opted out of model invocation was therefore
  force-advertised. The frontmatter contract now matches the official provider:
  `whenToUse` is read from its own key, both policy booleans are parsed with the
  official accepted spellings (`true`/`yes`/`on`/`1`, `false`/`no`/`off`/`0`),
  and legacy camelCase keys are rejected with a diagnostic instead of being
  silently ignored. Gated by T2.8h, T2.8i, T2.8j, T2.21.
- **A missing skill root produced no diagnostic**, so a typo in
  `extraSkillDirs` silently contributed nothing. Root-level read failures now
  warn. Gated by T2.8l.
- **Every non-skill subdirectory produced a bogus warning.** `assets/`,
  `node_modules/`, `.git/` and friends each emitted
  `skipped … (unreadable: ENOENT)`. Directory discovery now only admits
  subdirectories that actually contain `SKILL.md`. Gated by T2.8k.
- **An inline comment leaked into the skill name.** `name: my-skill # a note`
  published `my-skill-comment`. Trailing comments are now stripped from every
  frontmatter scalar, not just from the description. Gated by T2.8g.

### Changed

- **Corrected a false claim from 1.1.0.** That entry said an added skill
  "appears without a harness restart". It does not, and it cannot: the skill
  registry caches the collected catalogue and only re-invokes `list()` after an
  invalidation, while the provider can only invalidate *from inside* a call the
  registry has already made. What invalidation genuinely covers is a skill that
  is **edited or removed** while a candidate is live — `get()` notices the drift
  and forces a recollection. Adding a brand-new skill still requires a harness
  restart, and the README and `lib/skills-provider.mjs` now say so.
- The `source` field returned by `get()` is the literal `'fsd'` rather than an
  echo of the candidate.
- `README.md` gives both the POSIX `grep` and the PowerShell `Select-String`
  form for the composed-tree check (the previous `| grep` pipeline failed on
  Windows).
- `docs/reproduce-upstream.md` no longer leads with `[IO.File]::WriteAllBytes`,
  which is rejected in sandboxed ConstrainedLanguage PowerShell; the recipe
  routes bytes through Node instead.
- `index.mjs` imports `FSD_SKILLS_PROVIDER` instead of repeating the literal —
  a divergence there would make the registry reject every candidate and take the
  whole catalogue down.

### Verification

- `node --test "test/*.test.mjs"` — 68 gates, all passing.
- 13 targeted mutations of the changes above, run in throwaway copies: **13/13
  caught** (including reintroducing the red `smoke.yml` grep, which T4.5 now
  catches).
- The packed artifact was installed into a clean consumer and exercised end to
  end against a real skill provider contract: rank 600, 426-character
  description, 5/5 references resolving against `resourceBase`, forged
  candidate refused.

## [1.1.0] — 2026-09-14

Fixes from an independent adversarial review of 1.0.0. Two of these were
correctness defects that could make the skill absent or effectively invisible,
so this is a minor bump rather than a patch: the provider's frontmatter parsing
and the skill's catalog description both changed behaviour.

### Fixed

- **CRLF skill files were silently dropped.** `parseFrontmatter` split the head
  on `/\r?\n/`, which leaves a trailing `\r` on the last line; because `.` does
  not match `\r`, that line never matched the `key: value` pattern. With the
  usual `name` → `description` order this lost `description`, so `readSkillFile`
  returned `null` and the skill vanished with no diagnostic. Line endings are
  now normalised before parsing. Gated by T2.14, which asserts a CRLF file and
  its LF twin are treated identically.
- **The skill's recall anchors never reached the model.** The description was
  604 characters, while `dsh-tool-skill` renders the catalog line as
  `slice(0, 497) + '...'` (DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500). The
  cut landed mid-word and dropped `Seedance`, `MiniMax`, and every Chinese
  trigger term, so the frontmatter additions advertised in 1.0.0 did nothing.
  The description is rewritten to 426 characters with the trigger terms and
  model anchors front-loaded. Gated by T1.8, which asserts the description fits
  the visible budget *and* that each anchor survives inside it.
- **An edited skill never invalidated the catalog.** The provider now
  compares the visible catalog snapshot (name, description, `whenToUse`, and
  invocation policy) between discovery passes and calls `control.invalidate()`
  only when it actually differs, so an edited skill is republished. Scope
  correction: see 1.1.1 — this does **not** make a newly added skill appear,
  because the registry only re-invokes `list()` after an invalidation. Gated by
  T5.7.
- **An edited `description` kept serving the stale catalog line.** Candidate
  identity was cached on `(path, assignedName)`, so a changed description reused
  the old candidate object for the life of the process. Identity now also covers
  the description. Gated by T2.16.
- **Invalid `maxSkills` silently emptied the catalog.** `maxSkills: 0` passed
  `Number.isInteger`, mounted the plugin, and published zero skills. Config is
  now validated and rejected loudly: `maxSkills` must be an integer `>= 1`,
  `extraSkillDirs` must be an array of non-empty strings, and `enableSkills`
  must be a boolean. Gated by T5.5.
- **YAML block scalars were published as literal text.** `description: >-`
  produced the literal string `">-"`, which was then served as the catalog line.
  Block scalars are now rejected (the skill is skipped with a diagnostic),
  inline comments are stripped per YAML rules, and multi-line double-quoted
  scalars are supported. Gated by T2.15.
- **Skill rank inverted the intended precedence.** The provider used 275, which
  outranks the user's own skill roots (400/500) within a layer — so a user's
  same-named skill was silently shadowed, the opposite of what the source
  comment claimed. It now uses `BUNDLED_SKILL_RANK` (600), the documented rank
  for packaged providers. Gated by T2.17.

- **`apply(ctx, null)` threw.** An explicit `null` config bypassed the default
  parameter and crashed on property access, while every other malformed value
  was tolerated. `null`, scalars, and arrays now all mean "use defaults".
- **Names that cannot become kebab-case shared a single placeholder.** A pure
  CJK name such as `名字` normalized to nothing and fell back to the constant
  `skill`, so several such skills collided, shadowed each other, and were
  renamed `skill-2`/`skill-3` by directory order. They are now rejected before
  name allocation with a diagnostic naming the offending value.
- **`get()` echoed the candidate's own fields.** A caller that mutated the
  candidate object could make `get()` return a name or description that never
  existed on disk. Both are now re-derived from the freshly parsed file.

### Added

- **Diagnostics for skipped skills.** Read/parse rejections now surface through
  `ctx.logger.warn` as `dsh-fight-scene-director: skipped <file> (<reason>)`,
  deduplicated per file and reason. A skill that does not appear should be
  traceable in the log instead of vanishing. Gated by T2.8 and T5.8.
- **Deterministic name allocation.** Discovered files are sorted with a
  code-point comparator before `-2`/`-3` suffixes are assigned, and the result
  list uses the same comparator, so allocation no longer depends on filesystem
  iteration order. Gated by T2.18.
- Gated byte-identity for the vendored upstream copies in `docs/` and
  `LICENSE.upstream` (T3.6) — `THIRD_PARTY_NOTICES.md` claims they match
  upstream, and a claim without a gate drifts.
- T3.7 — reference integrity in the loaded skill body: every
  `references/...` path it mentions must exist on disk. (This checks the
  repository's `references/` directory; the *installed-copy* check against the
  provider-reported `resourceBase` is done end-to-end by `smoke.yml`, and by
  T2.19 which asserts `resourceBase` is re-derived rather than echoed.)
- T1.9 — the documented explicit invocation must be `/fight-scene-director`,
  not the non-existent `skill fight-scene-director`.

### Changed

- **`cordis.patch.yml` row id is now package-scoped** (`dsh-fight-scene-director`
  instead of `fsd-skills`). Cordis loader entry ids are global to the composed
  tree and a duplicate id fails at **boot** (`duplicate loader entry id`) while
  `--dump-config` still exits 0 — so a collision used to brick the profile with
  no warning at inspection time. Using the package name makes the only reachable
  collision "this plugin is mounted twice", which is the case that should be
  loud. **If you installed 1.0.0, remove and re-add the plugin** so the old row
  id is not left with a dead link target.
- A second in-process mount now degrades with a warning instead of failing the
  whole composition (a duplicate provider registration is caught and reported;
  every other error still propagates).
- `docs/` now ships in the packed tarball (`files`), because `README.md`,
  `README.zh.md`, and `NOTICE` all link into it; the previous 1.0.0 tarball had
  17 entries and no `docs/`, so those links were dead for installed copies.
- `@deepseek-ai/cordis` is now declared as an **optional** peer dependency
  (`peerDependenciesMeta`). Nothing in this package imports it, and without that
  flag a plain `npm install` pulled a duplicate copy into the consumer project.
- `get()` now re-derives the skill's name and description from the file on every
  load instead of echoing the fields on the mutable candidate object, so mutating
  a candidate cannot inject a name or description that was never on disk. A file
  that changed under a live candidate invalidates that entry and returns
  `undefined` rather than serving stale text.
- Verification instructions now use `dsh --profile <p> --dump-config` to prove
  the plugin row is composed, instead of `dsh plugin list`, which only proves a
  dependency exists.
- T3.4 asserts the fixture's own coverage (key set, byte sizes, and that
  `references/` contains nothing beyond the fixture). Its
  `FSD_SKIP_UPSTREAM_HASH` escape hatch was removed: the gate needs no network,
  so the only thing the switch could do was silently disable it.
- Removed a tautological assertion that `cordis.patch.yml` contains the package
  name — it was satisfied by the file's own comment header. T4.4 now parses the
  `insert:` block instead.

### Documentation

- Corrected the invocation gesture (`/fight-scene-director`), the tarball file
  count, and the claim that the `github:` install path is covered by
  `smoke.yml` — that workflow now actually exercises it.
- Documented that this plugin must be mounted at most once per profile, and that
  `dsh plugin remove` leaves the `node_modules` link behind (remove the profile
  entry first if you installed from a local checkout and then move the checkout,
  or the profile will not boot).

## [1.0.0] — 2026-09-13

Initial DeepSeek Harness port of the Codex skill `fight-scene-director`.

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
  `references/...` resolves against the printed skill base directory) and
  Chinese trigger vocabulary in the `description` frontmatter field.
- `skills/fight-scene-director/references/*.md` — the five upstream knowledge
  files, copied **byte-for-byte** from upstream commit
  `6265df37ae701449ef672f46db65ab15c4af9fc2`.
- `test/` — dependency-free `node --test` suite covering the skill-file
  contract, provider behavior, knowledge fidelity against pinned upstream
  hashes, plugin entry shape, and fake-context smoke checks.
- `docs/` — port report (`PORT-NOTES.zh.md`), upstream file copies for diffing
  (`upstream-SKILL.md`, `upstream-README.md`, `upstream-agents-openai.yaml`),
  and a recipe for reproducing the upstream snapshot
  (`reproduce-upstream.md`).
- `NOTICE`, `THIRD_PARTY_NOTICES.md`, `LICENSE.upstream` — MIT compliance for
  redistributing the original work.

### Changed

- Invocation model: the upstream `$fight-scene-director` prefix is Codex syntax.
  In DeepSeek Harness the skill is discovered from its `description` and invoked
  with the `/fight-scene-director` gesture, so `SKILL.md` documents both paths.
- `description` frontmatter gained Chinese triggers because DSH matches skills
  by description text. (In 1.0.0 these were placed past the catalog truncation
  point and therefore never reached the model — see 1.1.0.)
- The single-line `Created by **AIZAO Aloong**.` body line from upstream was
  replaced by an attribution sentence naming the author, the license, and the
  upstream URL; the same credit also appears in `NOTICE`, `README.zh.md`, and
  `LICENSE.upstream`.

### Not ported

- `agents/openai.yaml` is Codex-specific (`display_name`, `short_description`,
  `default_prompt`, `policy.allow_implicit_invocation`) and has no DSH
  equivalent. It is kept in `docs/` for reference only and is **not** shipped as
  an active artifact. Note one deliberate semantic difference: upstream sets
  `allow_implicit_invocation: false`, while this port is model-invocable so a
  plain "帮我设计一段打戏" request reaches it. Invoke it explicitly with
  `/fight-scene-director` if you prefer the stricter behaviour.

### Known limitations

- No npm publication: distribution is GitHub-only (`github:user/repo`), by
  design, so no registry account is required.
- The upstream README's WeChat article origin could not be read automatically
  (the platform served a captcha page); the port is based on the upstream
  repository source and a user-confirmed skill identity.
