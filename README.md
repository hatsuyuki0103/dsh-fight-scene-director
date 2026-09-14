# dsh-fight-scene-director

Use the Codex skill **多画风打戏导演 / fight-scene-director** inside DeepSeek Harness.

It turns your characters, weapons, abilities, scene, references, story goal,
duration, and trajectory controls into an **executable AI-video fight prompt** —
action causality and spatial movement first, shots second. Output is structured
Chinese prompts aimed at **Seedance 2.0**, **Seedance 2.5**, and **MiniMax H3**.

> Original skill by **AIZAO Aloong** —
> [ZzzAloong/fight-scene-director](https://github.com/ZzzAloong/fight-scene-director) (MIT).
> This repository is the DeepSeek Harness port. See [NOTICE](./NOTICE) and the
> [port report](./docs/PORT-NOTES.zh.md) for exactly what changed.

## What it does

- Designs a complete fight from a text brief, or revises an existing one.
- Emits image prompts for an initial-position map, a character-trajectory map,
  and a character-plus-camera dual-trajectory map.
- Reads your supplied character / scene / initial-position / trajectory images
  and applies each by its role.
- Adapts action and camera work to melee, ranged, spell, group, summon, and
  transformation encounters.
- Supports 15 s, 30 s, and custom durations, and appends an adjustable
  rhythm panel after the copyable prompt.
- Keeps characters, weapons, abilities, destruction, and spatial position
  continuous across cuts.

## Install

### Option A — straight from GitHub (recommended)

```bash
dsh plugin --profile web add github:hatsuyuki0103/dsh-fight-scene-director
```

`dsh plugin add` forwards to `pnpm add`, and pnpm understands the
`github:user/repo` spec — **no npm account or published package is required.**
Pin a revision when you want reproducibility:

```bash
dsh plugin --profile web add github:hatsuyuki0103/dsh-fight-scene-director#v1.0.0
```

Then restart the harness so the new profile layer is composed.

### Option B — from a local checkout

```bash
git clone https://github.com/hatsuyuki0103/dsh-fight-scene-director.git
dsh plugin --profile web add /absolute/path/to/dsh-fight-scene-director
```

### Option C — manual link

Add the checkout to your profile dependencies and bundle list yourself
(`~/.dsh/profiles/web/package.json`):

```json
{
  "dependencies": {
    "dsh-fight-scene-director": "link:/absolute/path/to/dsh-fight-scene-director"
  },
  "dsh": {
    "profile": {
      "bundles": ["…existing bundles…", "dsh-fight-scene-director"]
    }
  }
}
```

## Verify the install

After restarting, the skill must appear in your session skill catalog:

```bash
dsh plugin --profile web list | grep fight-scene-director
```

Inside a session, ask for a fight scene in plain words — the skill is
model-invocable, so `帮我设计一段 30 秒的剑客对决打戏` is enough. To load it
explicitly, name it:

```
skill fight-scene-director
```

If the skill does **not** appear:

1. confirm the plugin landed as a *bundle layer* — a dependency without
   `dsh.bundle` is installed but never mounted;
2. confirm you restarted the harness (profile bundles compose at boot);
3. check `package.json` → `dsh.bundle.patch` resolves to `cordis.patch.yml`.

## Configure

The plugin accepts inline config in your profile's `cordis.patch.yml` / agent
preset:

```yaml
- id: fsd-skills
  name: dsh-fight-scene-director
  config:
    enableSkills: true          # set false to unmount this package's skill
    extraSkillDirs: []          # additional skill roots served by this provider
    maxSkills: 100              # catalog entry cap
```

## Uninstall

```bash
dsh plugin --profile web remove dsh-fight-scene-director
```

Then restart. Removing the dependency drops the bundle layer on the next boot;
no files are written outside the installed package.

## Repository layout

```
index.mjs                     host plugin entry (name / inject / apply)
lib/skills-provider.mjs       embedded, lazy skill provider
skills/fight-scene-director/  the skill itself (SKILL.md + references/)
cordis.patch.yml              profile bundle patch
test/                         contract + knowledge-fidelity gates
docs/                         port report, upstream copies, repro recipe
```

## Development

```bash
node --test "test/*.test.mjs"
```

No dependencies to install — the tests use Node built-ins only. The suite
enforces two things worth knowing about:

- **`references/*.md` must stay byte-identical to the pinned upstream commit**
  (gate T3.4, hashes in `test/fixtures/upstream-hashes.json`). Changing them on
  purpose means updating that fixture *and* saying so in `CHANGELOG.md`.
- **The provider must reject forged candidates** (gates T2.5–T2.7). Skill
  definitions are borrowed by object identity, so only candidates this provider
  produced can be loaded.

## License

MIT. The port is © 2026 hatsuyuki0103; the original skill is
© 2026 AIZAO Aloong, also MIT. Both license texts ship in this repository
([`LICENSE`](./LICENSE), [`LICENSE.upstream`](./LICENSE.upstream)).
