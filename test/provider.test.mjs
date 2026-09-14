// SPDX-License-Identifier: MIT
// T2 — provider 行为。门禁核心：身份校验必须真的挡得住伪造候选。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  FSD_SKILLS_PROVIDER,
  FSD_SKILLS_RANK,
  compareCodePoints,
  discoverSkillFiles,
  fallbackSkillName,
  kebabName,
  kebabNameOrNull,
  makeEmbeddedSkillsProvider,
  normalizeDescription,
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

    // 跳过必须有诊断，否则「技能没出现」在用户侧无从查起
    const skipped = []
    await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push(path.basename(path.dirname(f)) + ':' + r) })
      .list()
    for (const name of ['no-desc', 'empty-desc', 'empty-body', 'no-frontmatter']) {
      assert.ok(
        skipped.some((s) => s.startsWith(name + ':')),
        `${name} 被跳过但没有诊断: ${skipped.join(', ')}`,
      )
    }
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

test('T2.8e normalizeDescription 覆盖 YAML 标量边界', () => {
  assert.equal(normalizeDescription('plain text'), 'plain text')
  assert.equal(normalizeDescription('  padded  '), 'padded')
  assert.equal(normalizeDescription('quoted value'), 'quoted value')
  assert.equal(normalizeDescription('"double quoted"'), 'double quoted')
  assert.equal(normalizeDescription("'single quoted'"), 'single quoted')
  // YAML 里注释以「空白 + #」开始：` #` 之后一律算注释（含引号内联注释的常见写法）
  assert.equal(normalizeDescription('has a comment # gone'), 'has a comment')
  assert.equal(normalizeDescription('has # inline comment'), 'has')
  // 但 `#` 紧贴非空白字符时是值的一部分，URL 与标签不会被切坏
  assert.equal(normalizeDescription('https://example.com/a#b'), 'https://example.com/a#b')
  assert.equal(normalizeDescription('#tag'), '#tag')
  // 引号内的一切都保留，包括看起来像注释的内容
  assert.equal(normalizeDescription('"keeps # this"'), 'keeps # this')
  assert.equal(normalizeDescription('>-'), undefined)
  assert.equal(normalizeDescription('|'), undefined)
  assert.equal(normalizeDescription('|-'), undefined)
  assert.equal(normalizeDescription(''), undefined)
  assert.equal(normalizeDescription('   '), undefined)
  assert.equal(normalizeDescription('""'), undefined)
  assert.equal(normalizeDescription('"unterminated'), undefined)
  // 跨行双引号标量：由后续行续读补全
  assert.equal(normalizeDescription('"first part', ['  second part"']), 'first part\n  second part')
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

test('T2.9b 无法归一化为 kebab 的名字必须被剔除并诊断，而不是共享占位名', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'good', skillDoc('good', 'G'.repeat(50)))
    await writeSkill(dir, 'cjk-one', skillDoc('名字', 'C'.repeat(50)))
    await writeSkill(dir, 'cjk-two', skillDoc('日本語', 'J'.repeat(50)))
    const skipped = []
    const names = (await makeEmbeddedSkillsProvider({
      roots: [dir],
      onSkip: (f, r) => skipped.push(path.basename(path.dirname(f)) + ':' + r),
    }).list()).map((c) => c.name)
    // 旧行为：两者都退回共享常量 "skill"，于是变成 skill / skill-2，
    // 既互相遮蔽又随目录顺序漂移，用户完全看不出发生了什么。
    assert.deepEqual(names, ['good'], '纯 CJK 名字不应进目录，也不应共享占位名')
    assert.equal(
      skipped.filter((s) => s.includes('cannot be normalized')).length,
      2,
      `缺少诊断: ${skipped.join(', ')}`,
    )
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
  assert.deepEqual(parseFrontmatter('no frontmatter'), { meta: {}, raw: {}, body: 'no frontmatter' })
  const lf = parseFrontmatter('---\nname: a\n---\n\nbody\n')
  assert.equal(lf.meta.name, 'a')
  assert.equal(lf.raw.name, 'a')
  assert.equal(lf.body, 'body\n')
  assert.equal(parseFrontmatter('---\nname: "quoted"\n---\n\nx\n').raw.name, 'quoted')
  assert.deepEqual(parseFrontmatter('---\nname: a\n\nunterminated').meta, {}) // 未闭合 → 按无 meta
  assert.equal(kebabName('Fight Scene Director!!'), 'fight-scene-director')
  assert.equal(kebabName(''), 'skill')
  assert.equal(kebabName('---'), 'skill')
  assert.equal(kebabName('a  b'), 'a-b')
  // 纯非 ASCII 名：kebabName 退回 fallback，而 kebabNameOrNull 明确判定不可用
  assert.equal(kebabName('名字'), 'skill')
  assert.equal(kebabNameOrNull('名字'), null, '非 kebab 名必须被识别为不可用')
  assert.equal(kebabNameOrNull('---'), null)
  assert.equal(kebabNameOrNull(''), null)
  assert.equal(kebabNameOrNull('Good-Name'), 'good-name')

  const files = await discoverSkillFiles(SKILLS_DIR)
  assert.ok(files.includes(SKILL_FILE))
  assert.deepEqual(files, [...files].sort(compareCodePoints), 'discoverSkillFiles 必须返回稳定排序')
  assert.deepEqual(await discoverSkillFiles(path.join(SKILLS_DIR, '__nope__')), [])
  const skill = await readSkillFile(SKILL_FILE)
  assert.equal(skill.name, 'fight-scene-director')
  assert.equal(await readSkillFile(path.join(SKILLS_DIR, '__nope__', 'SKILL.md')), null)
})

test('T2.14 CRLF 文件必须与 LF 文件被同等对待（回归门禁）', async () => {
  // 回归：head.split(/\r?\n/) 会给最后一行留 `\r`，而 JS 的 `.` 不匹配 `\r`，
  // 于是 CRLF 技能的 description 匹配失败 → 整个技能静默消失。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'lf-skill', skillDoc('lf-skill', 'L'.repeat(50)))
    await writeSkill(dir, 'crlf-skill', skillDoc('crlf-skill', 'C'.repeat(50)).replace(/\n/g, '\r\n'))
    const skills = await makeEmbeddedSkillsProvider({ roots: [dir] }).list()
    assert.deepEqual(
      skills.map((c) => c.name),
      ['crlf-skill', 'lf-skill'],
      'CRLF 技能不得因行尾被丢弃',
    )
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const [first] = await provider.list()
    const def = await provider.get(first)
    assert.ok(def.content.length > 0)
    assert.ok(!def.content.includes('\r'), '正文中的 CRLF 也应被归一化')
  } finally {
    await cleanup()
  }
})

test('T2.15 YAML 块标量描述被拒绝，而不是当成字面量发布', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'good', skillDoc('good', 'G'.repeat(50)))
    await writeSkill(dir, 'folded', '---\nname: folded\ndescription: >-\n  a long folded line\n---\n\nbody\n')
    await writeSkill(dir, 'literal', '---\nname: literal\ndescription: |\n  a long literal line\n---\n\nbody\n')
    await writeSkill(dir, 'quoted-ok', '---\nname: quoted-ok\ndescription: "a fine description that is long enough"\n---\n\nbody\n')
    await writeSkill(
      dir,
      'multiline-quoted',
      '---\nname: multiline-quoted\ndescription: "first part\n  second part of a long description"\n---\n\nbody\n',
    )
    const names = (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => c.name)
    assert.deepEqual(names, ['good', 'multiline-quoted', 'quoted-ok'])
    // 诊断必须留下痕迹：跳过不是静默的
    const skipped = []
    await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push([path.basename(path.dirname(f)), r]) })
      .list()
    const reasons = skipped.map(([d, r]) => `${d}:${r.startsWith('description is not') ? 'block-scalar' : r}`)
    assert.ok(reasons.includes('folded:block-scalar'), `folded 未被诊断: ${reasons.join(', ')}`)
    assert.ok(reasons.includes('literal:block-scalar'), `literal 未被诊断: ${reasons.join(', ')}`)
  } finally {
    await cleanup()
  }
})

test('T2.16 description 变化必须产生新候选（防止目录行永久陈旧）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'changing', skillDoc('changing', 'A'.repeat(50)))
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const [first] = await provider.list()
    assert.ok(first.description.startsWith('AAA'))
    let invalidations = 0
    const provider2 = makeEmbeddedSkillsProvider({ roots: [dir], invalidate: () => { invalidations += 1 } })
    const [a] = await provider2.list()
    await writeSkill(dir, 'changing', skillDoc('changing', 'B'.repeat(50)))
    const [b] = await provider2.list()
    assert.notEqual(a, b, 'description 变了就必须换新候选对象，否则注册表一直用旧目录行')
    assert.ok(b.description.startsWith('BBB'))
    assert.ok(invalidations >= 1, '变化时必须调用 invalidate()')
    // 未变化时保持同一身份，get() 才可能通过校验
    const [c] = await provider2.list()
    assert.equal(b, c)
  } finally {
    await cleanup()
  }
})

test('T2.17 rank 必须低于用户技能根（用户同名技能可覆盖本包）', async () => {
  // dsh-skill 同层内 rank 升序取先者；官方文件系统提供方：项目 100/200、
  // 自定义 300、用户 400/500、打包 600。本包属于「打包来的技能」，故取 600。
  assert.equal(FSD_SKILLS_RANK, 600)
  assert.ok(FSD_SKILLS_RANK > 500, 'rank 必须大于用户根 500，否则会反向遮蔽用户自己的同名技能')
  const [candidate] = await makeProvider().list()
  assert.equal(candidate.rank, 600)
})

test('T2.18 分配结果与文件系统遍历顺序无关', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    // 三个都归一化到同一个 basename，后缀分配必须由码位序决定
    await writeSkill(dir, 'zzz', skillDoc('collide', 'Z'.repeat(50)))
    await writeSkill(dir, 'aaa', skillDoc('Collide!!', 'A'.repeat(50)))
    await writeSkill(dir, 'mmm', skillDoc('COLLIDE', 'M'.repeat(50)))
    const first = (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => [c.name, path.basename(path.dirname(c.locator.path))])
    const second = (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => [c.name, path.basename(path.dirname(c.locator.path))])
    assert.deepEqual(first, second, '两次独立发现必须得到相同分配')
    assert.equal(new Set(first.map(([n]) => n)).size, 3)
    // 目录名 aaa < mmm < zzz（码位序），因此 collide 归 aaa
    assert.deepEqual(first.filter(([n]) => n === 'collide').map(([, d]) => d), ['aaa'])
  } finally {
    await cleanup()
  }
})
