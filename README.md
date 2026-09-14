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
Append `#<tag>` to pin a revision for reproducibility:

```bash
dsh plugin --profile web add github:hatsuyuki0103/dsh-fight-scene-director#v1.1.2
```

Then restart the harness so the new profile layer is composed.

### Option A2 — prebuilt tarball (no git, no build step)

Every release attaches the packed artifact, which pnpm installs directly:

```bash
dsh plugin --profile web add https://github.com/hatsuyuki0103/dsh-fight-scene-director/releases/download/v1.1.2/dsh-fight-scene-director-1.1.2.tgz
```

Use this when git-over-HTTPS is blocked on your network, or when you want a
byte-pinned artifact rather than a branch.

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

After restarting, confirm the plugin joined the profile's bundle layers — this
is the check that actually distinguishes "installed" from "installed and
mounted":

```bash
# 1. the dependency is present
dsh plugin --profile web list

# 2. the composed profile tree carries the plugin's row
dsh --profile web --dump-config > tree.yml
grep -B1 -A2 'id: dsh-fight-scene-director' tree.yml     # macOS / Linux
Select-String 'id: dsh-fight-scene-director' tree.yml -Context 1,2   # Windows PowerShell
```

Step 2 must print the row with `id: dsh-fight-scene-director` and
`name: dsh-fight-scene-director`. A dependency without a composed row is
installed but never mounted. (The skill provider's own internal name is
`fsd-skills`; that appears in logger output, never as a patch row id.)

Inside a session, ask for a fight scene in plain words — the skill is
model-invocable, so `帮我设计一段 30 秒的剑客对决打戏` is enough. To invoke it
explicitly, type the skill as its own word:

```
/fight-scene-director
```

If the skill does **not** appear:

1. confirm the plugin landed as a *bundle layer* (step 2 above) — a dependency
   without `dsh.bundle` is installed but never mounted;
2. confirm you restarted the harness (profile bundles compose at boot);
3. check `package.json` → `dsh.bundle.patch` resolves to `cordis.patch.yml`;
4. look for `dsh-fight-scene-director: skipped …` warnings in the harness log —
   a skill file that fails the frontmatter contract is skipped with a reason
   rather than silently dropped.

### Adding or changing skills needs a restart

The skill registry caches the collected catalogue, and the provider can only ask
for a re-collection from *inside* a call the registry has already made. So:

- **Editing or removing** the bundled skill while a session is live is picked up
  automatically — the next load notices the file changed, drops the stale entry,
  and asks the registry to re-collect.
- **Adding a brand-new skill file** (including via `extraSkillDirs`) does **not**
  appear until you restart the harness. There is no filesystem watcher in this
  provider; it reads the directory only when the registry asks it to.

## Configure

The plugin accepts inline config in your profile's `cordis.patch.yml` / agent
preset. The row id is the package name:

```yaml
- id: dsh-fight-scene-director
  name: dsh-fight-scene-director
  config:
    enableSkills: true          # set false to unmount this package's skill
    extraSkillDirs: []          # additional skill roots served by this provider
    maxSkills: 100              # catalog entry cap, integer >= 1
```

Invalid values are rejected loudly rather than ignored: `maxSkills` must be an
integer `>= 1` (`0` would silently empty the catalog), `extraSkillDirs` must be
an array of non-empty strings, and `enableSkills` must be a boolean. `null` or a
missing config means "use defaults".

## Uninstall

```bash
dsh plugin --profile web remove dsh-fight-scene-director
```

Then restart. Removing the dependency drops the bundle layer on the next boot;
no files are written outside the installed package.

Two caveats worth knowing:

- **Do not mount this plugin more than once per profile.** Cordis loader entry
  ids are global to the composed tree, so a second row with the same id fails at
  boot. The id is the package name precisely so that this is the only reachable
  collision.
- Installing from a local checkout (`link:`) then **moving or deleting that
  directory** leaves the profile unable to boot (`cannot resolve profile
  bundle`). Remove the profile entry first, or install from GitHub instead.
- `dsh plugin remove` removes the dependency and the bundle layer but can leave
  the `node_modules` link behind; it is inert once the bundle layer is gone.

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
