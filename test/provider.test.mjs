// SPDX-License-Identifier: MIT
// T2 — provider 行为。门禁核心：身份校验必须真的挡得住伪造候选。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  FSD_SKILLS_PROVIDER,
  FSD_SKILLS_RANK,
  discoverSkillFiles,
  fallbackSkillName,
  kebabName,
  makeEmbeddedSkillsProvider,
  parseFrontmatter,
  readSkillFile,
} from '../lib/skills-provider.mjs'
import { SKILLS_DIR, SKILL_DIR, SKILL_FILE, makeTempSkillRoot, skillDoc, writeSkill } from './helpers.mjs'

/** 造一个指向本包真实技能目录的 provider。 */
function makeProvider(extra = {}) {
  return makeEmbeddedSkillsProvider({ roots: [SKILLS_DIR], ...extra })
}

test('T2.1 list() 返回本包技能，名称为 fight-scene-director', async () => {
  const provider = makeProvider()
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].name, 'fight-scene-director')
  assert.ok(candidates[0].description.length > 40)
})

test('T2.2 候选形状满足 DSH 注册契约', async () => {
  const [candidate] = await makeProvider().list()
  assert.equal(candidate.provider, FSD_SKILLS_PROVIDER)
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
  assert.equal(candidate.rank, FSD_SKILLS_RANK)
  assert.equal(candidate.locator.path, SKILL_FILE)
  assert.equal(candidate.path, SKILL_FILE)
  assert.equal(path.dirname(candidate.locator.path), SKILL_DIR)
  // resourceBase 必须是目录：DSH 据此渲染 "Base directory for this skill"
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.equal(candidate.resourceBase.path, SKILL_DIR)
  assert.ok(candidate.metadata && typeof candidate.metadata === 'object')
})

test('T2.3 get() 返回正文（含中文输出契约入口）', async () => {
  const provider = makeProvider()
  const [candidate] = await provider.list()
  const definition = await provider.get(candidate)
  assert.ok(definition, 'get() 必须返回定义')
  assert.equal(definition.name, 'fight-scene-director')
  assert.equal(definition.provider, FSD_SKILLS_PROVIDER)
  assert.ok(definition.content.includes('## Route the Request'))
  assert.ok(definition.content.includes('Non-negotiable Output Rules'))
  assert.equal(definition.path, SKILL_FILE)
  assert.equal(definition.resourceBase.path, SKILL_DIR)
})

test('T2.4 连续 list() 返回同一候选对象身份（身份缓存稳定）', async () => {
  const provider = makeProvider()
  const first = await provider.list()
  const second = await provider.list()
  assert.equal(first[0], second[0], 'list() 每次必须复用同一候选对象，否则 get() 身份校验必然失败')
  assert.ok(await provider.get(second[0]), '复用的候选必须仍可被 get() 接受')
})

test('T2.5 get() 拒绝伪造的同路径候选', async () => {
  const provider = makeProvider()
  await provider.list() // 先让真实候选进入 owned
  const forged = {
    name: 'fight-scene-director',
    description: 'x'.repeat(50),
    locator: { path: SKILL_FILE },
    resourceBase: { kind: 'directory', path: SKILL_DIR },
  }
  assert.equal(await provider.get(forged), undefined, '伪造候选必须被拒绝（否则知识可被越权注入）')
})

test('T2.6 get() 拒绝外来候选与畸形输入', async () => {
  const provider = makeProvider()
  await provider.list()
  const other = makeEmbeddedSkillsProvider({ roots: [SKILLS_DIR], provider: 'other-provider' })
  const [otherCandidate] = await other.list()
  assert.equal(await provider.get(otherCandidate), undefined)
  assert.equal(await provider.get(undefined), undefined)
  assert.equal(await provider.get(null), undefined)
  assert.equal(await provider.get({}), undefined)
  assert.equal(await provider.get({ locator: {} }), undefined)
})

test('T2.7 候选身份随分配名变化而失效', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'alpha', skillDoc('Foo Bar', 'A'.repeat(50)))
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const [first] = await provider.list()
    assert.equal(first.name, 'foo-bar')
    assert.ok(await provider.get(first))

    // 改名 → 分配名变化 → owned 里的身份被替换，旧候选必须失效
    await writeSkill(dir, 'alpha', skillDoc('Foo Baz', 'A'.repeat(50)))
    const [second] = await provider.list()
    assert.equal(second.name, 'foo-baz')
    assert.notEqual(first, second)
    assert.equal(await provider.get(first), undefined, '改名后旧候选必须失效')
    assert.ok(await provider.get(second))
  } finally {
    await cleanup()
  }
})

test('T2.8 非法技能被跳过而不拖垮整个目录', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'good', skillDoc('Good Skill', 'A'.repeat(50)))
    await writeSkill(dir, 'no-desc', '---\nname: no-desc\ndescription:\n---\n\nbody\n')
    await writeSkill(dir, 'empty-desc', '---\nname: empty-desc\ndescription: "   "\n---\n\nbody\n')
    await writeSkill(dir, 'empty-body', '---\nname: empty-body\ndescription: ' + 'C'.repeat(50) + '\n---\n\n   \n')
    await writeSkill(dir, 'no-frontmatter', '# just markdown\n')
    const candidates = await makeEmbeddedSkillsProvider({ roots: [dir] }).list()
    // 只有 good 合法（description 非空 且 正文非空）。
    // no-desc / empty-desc 缺 description；empty-body 正文为空；no-frontmatter 两者皆缺。
    // 目录名 good + frontmatter name "Good Skill" → 候选名取自 frontmatter。
    assert.deepEqual(candidates.map((c) => c.name), ['good-skill'], '只有合法技能可入选，且目录不得整体失败')
  } finally {
    await cleanup()
  }
})

test('T2.8b 未声明 name 时回退为目录名（目录名本身即合法 kebab 名）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(
      dir,
      'dir-derived',
      '---\ndescription: ' + 'D'.repeat(50) + '\n---\n\n# body\n',
    )
    const candidates = await makeEmbeddedSkillsProvider({ roots: [dir] }).list()
    assert.deepEqual(
      candidates.map((c) => c.name),
      ['dir-derived'],
      'SKILL.md 无 name 时必须回退到目录名，而不是退化成 "skill"',
    )
  } finally {
    await cleanup()
  }
})

test('T2.8c 扁平布局 <name>.md 回退为文件名', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeFile(
      path.join(dir, 'flat-skill.md'),
      '---\ndescription: ' + 'E'.repeat(50) + '\n---\n\n# body\n',
      'utf8',
    )
    const candidates = await makeEmbeddedSkillsProvider({ roots: [dir] }).list()
    assert.deepEqual(candidates.map((c) => c.name), ['flat-skill'])
    // 扁平的 README.md / MEMORY.md 不得被当作技能
    await writeFile(path.join(dir, 'README.md'), '# readme\n', 'utf8')
    await writeFile(path.join(dir, 'MEMORY.md'), '# memory\n', 'utf8')
    const again = await makeEmbeddedSkillsProvider({ roots: [dir] }).list()
    assert.deepEqual(again.map((c) => c.name), ['flat-skill'])
  } finally {
    await cleanup()
  }
})

test('T2.8d fallbackSkillName 覆盖两种布局与大小写', () => {
  assert.equal(fallbackSkillName(path.join('x', 'my-skill', 'SKILL.md')), 'my-skill')
  assert.equal(fallbackSkillName(path.join('x', 'my-skill', 'skill.md')), 'my-skill')
  assert.equal(fallbackSkillName(path.join('x', 'flat.md')), 'flat')
})

test('T2.9 重名技能归一化后仍唯一', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'a', skillDoc('Fight Scene Director!!', 'A'.repeat(50)))
    await writeSkill(dir, 'b', skillDoc('fight-scene-director', 'B'.repeat(50)))
    await writeSkill(dir, 'c', skillDoc('Fight Scene Director', 'C'.repeat(50)))
    const names = (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => c.name)
    assert.deepEqual(names, ['fight-scene-director', 'fight-scene-director-2', 'fight-scene-director-3'])
    assert.equal(new Set(names).size, names.length)
  } finally {
    await cleanup()
  }
})

test('T2.10 根目录缺失 / 不存在时安全返回空', async () => {
  const provider = makeEmbeddedSkillsProvider({ roots: [path.join(SKILLS_DIR, '__nope__')] })
  assert.deepEqual(await provider.list(), [])
})

test('T2.11 maxSkills 上限生效', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    for (let i = 0; i < 5; i++) await writeSkill(dir, `s${i}`, skillDoc(`skill-${i}`, 'D'.repeat(50)))
    const candidates = await makeEmbeddedSkillsProvider({ roots: [dir], maxSkills: 2 }).list()
    assert.equal(candidates.length, 2)
  } finally {
    await cleanup()
  }
})

test('T2.12 abort signal 被尊重', async () => {
  const provider = makeProvider()
  await assert.rejects(() => provider.list({ signal: AbortSignal.abort() }))
})

test('T2.13 纯函数行为：parseFrontmatter / kebabName / discoverSkillFiles', async () => {
  assert.deepEqual(parseFrontmatter('no frontmatter'), { meta: {}, body: 'no frontmatter' })
  assert.deepEqual(parseFrontmatter('---\nname: a\n---\n\nbody\n'), { meta: { name: 'a' }, body: 'body\n' })
  assert.deepEqual(parseFrontmatter('---\nname: "quoted"\n---\n\nx\n').meta, { name: 'quoted' })
  assert.deepEqual(parseFrontmatter('---\nname: a\n\nunterminated').meta, {}) // 未闭合 → 按无 meta
  assert.equal(kebabName('Fight Scene Director!!'), 'fight-scene-director')
  assert.equal(kebabName(''), 'skill')
  assert.equal(kebabName('---'), 'skill')
  assert.equal(kebabName('a  b'), 'a-b')

  const files = await discoverSkillFiles(SKILLS_DIR)
  assert.ok(files.includes(SKILL_FILE))
  assert.deepEqual(await discoverSkillFiles(path.join(SKILLS_DIR, '__nope__')), [])
  const skill = await readSkillFile(SKILL_FILE)
  assert.equal(skill.name, 'fight-scene-director')
  assert.equal(await readSkillFile(path.join(SKILLS_DIR, '__nope__', 'SKILL.md')), null)
})
