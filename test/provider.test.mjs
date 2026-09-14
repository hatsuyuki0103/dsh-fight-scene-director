// SPDX-License-Identifier: MIT
// T2 — provider 行为。门禁核心：身份校验必须真的挡得住伪造候选。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import {
  FSD_SKILLS_PROVIDER,
  FSD_SKILLS_RANK,
  compareCodePoints,
  discoverSkillFiles,
  fallbackSkillName,
  frontmatterBoolean,
  kebabName,
  kebabNameOrNull,
  makeEmbeddedSkillsProvider,
  normalizeDescription,
  parseFrontmatter,
  parseInvocationPolicy,
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
  // 但 `#` 紧贴非空白字符时是值的一部分，URL 不会被切坏
  assert.equal(normalizeDescription('https://example.com/a#b'), 'https://example.com/a#b')
  // 而整个值就是注释时，YAML 得到 null，必须拒绝（否则发布一条 "#tag" 描述）
  assert.equal(normalizeDescription('#tag'), undefined)
  assert.equal(normalizeDescription('# a note'), undefined)
  // 引号内的一切都保留，包括看起来像注释的内容
  assert.equal(normalizeDescription('"keeps # this"'), 'keeps # this')
})

test('T2.8f 块标量必须先剥注释再判定，且两种指示符顺序都算块标量', () => {
  // 回归：先判块标量再剥注释时，`>- # note` 会因为尾部注释不匹配而漏网，
  // 于是字面量 ">-" 被当成描述发布出去。
  for (const bad of ['>- # note', '| # note', '> # note', '|- # x', '|+ # x', '>2+ # x', '|2- # x', '|2 # x']) {
    assert.equal(normalizeDescription(bad), undefined, `块标量漏网: ${JSON.stringify(bad)}`)
  }
  // 两种顺序都合法：chomping 在前（`|-`）或缩进数在前（`|-2`）
  for (const bad of ['>-', '|', '|-', '|+', '>+', '|2-', '>2+', '|2', '>2', '|-2', '>+2']) {
    assert.equal(normalizeDescription(bad), undefined, `块标量漏网: ${JSON.stringify(bad)}`)
  }
  // 正常文本不受影响；但以非引号的 | 或 > 开头一律按块标量头拒绝
  assert.equal(normalizeDescription('>not a block scalar'), undefined, '非引号 > 开头即块标量头，必须拒绝')
  assert.equal(normalizeDescription('|not a block scalar'), undefined)
  assert.equal(normalizeDescription('">- is text in quotes"'), '>- is text in quotes')
  // `-` 在同一行是块序列指示符，YAML 报错，必须拒绝
  assert.equal(normalizeDescription('-'), undefined)
  assert.equal(normalizeDescription(''), undefined)
  assert.equal(normalizeDescription('   '), undefined)
  assert.equal(normalizeDescription('""'), undefined)
  assert.equal(normalizeDescription('"unterminated'), undefined)
  // 跨行双引号标量：由后续行续读补全
  assert.equal(normalizeDescription('"first part', ['  second part"']), 'first part\n  second part')
})

test('T2.8g name 里的行尾注释不得混进技能名', () => {
  const { meta, raw } = parseFrontmatter('---\nname: my-skill # a note\ndescription: ok enough text here\n---\n\nbody\n')
  assert.equal(meta.name, 'my-skill')
  assert.equal(raw.description, 'ok enough text here')
})

test('T2.8h frontmatterBoolean / invocation 策略与官方语义一致', () => {
  assert.equal(frontmatterBoolean('true'), true)
  assert.equal(frontmatterBoolean('yes'), true)
  assert.equal(frontmatterBoolean('on'), true)
  assert.equal(frontmatterBoolean('1'), true)
  assert.equal(frontmatterBoolean('false'), false)
  assert.equal(frontmatterBoolean('no'), false)
  assert.equal(frontmatterBoolean('off'), false)
  assert.equal(frontmatterBoolean('0'), false)
  assert.equal(frontmatterBoolean(undefined), undefined)
  assert.equal(frontmatterBoolean(''), undefined)
  // 无效值必须抛错（与官方一致），不能按「没写」放行
  assert.throws(() => frontmatterBoolean('maybe'), /must be a boolean/)
  assert.throws(() => frontmatterBoolean('2'), /must be a boolean/)

  assert.deepEqual(parseInvocationPolicy({}), { modelInvocable: true, userInvocable: true })
  assert.deepEqual(parseInvocationPolicy({ 'disable-model-invocation': 'true' }), {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.deepEqual(parseInvocationPolicy({ 'user-invocable': 'false' }), {
    modelInvocable: true,
    userInvocable: false,
  })
  // 旧驼峰键必须显式拒绝（与官方 rejectLegacyInvocationKey 一致），而不是静默忽略
  for (const legacy of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
    assert.throws(() => parseInvocationPolicy({ [legacy]: 'true' }), /unsupported/, `${legacy} 应被拒绝`)
  }
  // 无效布尔值同样必须抛错
  assert.throws(() => parseInvocationPolicy({ 'user-invocable': 'maybe' }), /must be a boolean/)
})

test('T2.8i invocation 策略真的落到候选与定义上', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(
      dir,
      'manual-only',
      '---\nname: manual-only\ndescription: ' + 'M'.repeat(50) + '\ndisable-model-invocation: true\n---\n\nbody\n',
    )
    await writeSkill(
      dir,
      'staff-only',
      '---\nname: staff-only\ndescription: ' + 'S'.repeat(50) + '\nuser-invocable: false\n---\n\nbody\n',
    )
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const byName = new Map((await provider.list()).map((c) => [c.name, c]))
    assert.deepEqual(byName.get('manual-only').invocation, { modelInvocable: false, userInvocable: true })
    assert.deepEqual(byName.get('staff-only').invocation, { modelInvocable: true, userInvocable: false })
    const def = await provider.get(byName.get('manual-only'))
    assert.equal(def.invocation.modelInvocable, false)

    // 旧驼峰键 → 整个文件被跳过并诊断，绝不进目录
    await writeSkill(
      dir,
      'legacy',
      '---\nname: legacy\ndescription: ' + 'L'.repeat(50) + '\nuserInvocable: false\n---\n\nbody\n',
    )
    const skipped = []
    const names = (
      await makeEmbeddedSkillsProvider({
        roots: [dir],
        onSkip: (f, r) => skipped.push(path.basename(path.dirname(f)) + ':' + r),
      }).list()
    ).map((c) => c.name)
    assert.ok(!names.includes('legacy'), '驼峰键文件不得进目录')
    assert.ok(
      skipped.some((s) => s.startsWith('legacy:') && s.includes('unsupported')),
      `缺少驼峰键诊断: ${skipped.join(', ')}`,
    )
  } finally {
    await cleanup()
  }
})

test('T2.8j whenToUse 从官方键读取，不再由 argument-hint 伪造', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(
      dir,
      'hinted',
      '---\nname: hinted\ndescription: ' + 'H'.repeat(50) + '\nwhenToUse: when the user asks for a hint\n---\n\nbody\n',
    )
    await writeSkill(
      dir,
      'hint-only',
      '---\nname: hint-only\ndescription: ' + 'I'.repeat(50) + '\nargument-hint: <not-a-whenToUse>\n---\n\nbody\n',
    )
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const byName = new Map((await provider.list()).map((c) => [c.name, c]))
    assert.equal(byName.get('hinted').whenToUse, 'when the user asks for a hint')
    assert.equal(byName.get('hint-only').whenToUse, undefined, 'whenToUse 不得从 argument-hint 伪造')
    const def = await provider.get(byName.get('hinted'))
    assert.equal(def.whenToUse, 'when the user asks for a hint')
  } finally {
    await cleanup()
  }
})

test('T2.8k 非技能子目录不得产出诊断（assets / node_modules）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'real', skillDoc('real', 'R'.repeat(50)))
    for (const noise of ['assets', 'node_modules', '.git', 'docs']) {
      await mkdir(path.join(dir, noise), { recursive: true })
      await writeFile(path.join(dir, noise, 'thing.txt'), 'x', 'utf8')
    }
    const skipped = []
    const names = (
      await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push(`${f}:${r}`) }).list()
    ).map((c) => c.name)
    assert.deepEqual(names, ['real'])
    assert.deepEqual(skipped, [], `无 SKILL.md 的子目录不该报错: ${skipped.join(' | ')}`)
  } finally {
    await cleanup()
  }
})

test('T2.8l 不存在的技能根必须留下诊断', async () => {
  const missing = path.join(SKILLS_DIR, '__definitely__missing__')
  const skipped = []
  const names = (
    await makeEmbeddedSkillsProvider({
      roots: [missing],
      onSkip: (t, r) => skipped.push(`${t}:${r}`),
    }).list()
  ).map((c) => c.name)
  assert.deepEqual(names, [])
  assert.equal(skipped.length, 1, `缺失根目录必须报一次: ${skipped.join(' | ')}`)
  assert.match(skipped[0], /skill root is not readable/)
  assert.ok(skipped[0].startsWith(missing))
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

test('T2.15 真实多行块标量描述被拒绝，而不是当成字面量发布', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'good', skillDoc('good', 'G'.repeat(50)))
    // YAML 块标量：折叠（>）与字面（|），缩进指示数是两种顺序
    for (const [slug, indicator] of [
      ['folded', '>-'],
      ['literal', '|'],
      ['chomp-strip', '|-'],
      ['indent-then-chomp', '|2-'],
      ['chomp-then-indent', '|-2'],
      ['with-comment', '>- # a note'],
    ]) {
      await writeSkill(dir, slug, `---\nname: ${slug}\ndescription: ${indicator}\n  a long multiline description here\n---\n\nbody\n`)
    }
    await writeSkill(dir, 'quoted-ok', '---\nname: quoted-ok\ndescription: "a fine description that is long enough"\n---\n\nbody\n')
    await writeSkill(
      dir,
      'multiline-quoted',
      '---\nname: multiline-quoted\ndescription: "first part\n  second part of a long description"\n---\n\nbody\n',
    )
    const names = (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => c.name)
    assert.deepEqual(names, ['good', 'multiline-quoted', 'quoted-ok'], '任何块标量都不得进目录')

    // 诊断必须留下痕迹：跳过不是静默的，而且理由要指出是「不是单行标量」
    const skipped = []
    await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push([path.basename(path.dirname(f)), r]) })
      .list()
    const reasons = new Map(skipped)
    for (const slug of ['folded', 'literal', 'chomp-strip', 'indent-then-chomp', 'chomp-then-indent', 'with-comment']) {
      assert.ok(
        reasons.get(slug)?.startsWith('description is not a single-line scalar'),
        `${slug} 未被诊断为块标量: ${reasons.get(slug) ?? 'no diagnostic'}`,
      )
    }
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

test('T2.13b 文件不可读必须留下诊断（M22 回归门禁）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    // 造一个「路径存在但是目录」的 SKILL.md：readFile 会以 EISDIR 失败，
    // 覆盖 readSkillFile 的 unreadable 分支。用目录而不是权限位，
    // 因为 Windows 上 chmod 不生效，这个手法跨平台都成立。
    await mkdir(path.join(dir, 'unreadable', 'SKILL.md'), { recursive: true })
    const skipped = []
    const names = (
      await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push(`${path.basename(path.dirname(f))}:${r}`) }).list()
    ).map((c) => c.name)
    assert.deepEqual(names, [], '不可读的技能文件不得进目录')
    assert.equal(skipped.length, 1, `不可读文件必须报一次: ${skipped.join(' | ')}`)
    assert.match(skipped[0], /^unreadable:unreadable:/)
  } finally {
    await cleanup()
  }
})

test('T2.18b 排序发生在分配之前（readdir 顺序无关的可移植门禁）', async () => {
  // T2.18 在 NTFS 上会因为 readdir 本来就返回有序结果而「恰好通过」，
  // 所以这里不依赖文件系统顺序：注入一个逆序的 list，断言分配仍按码位序。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'zzz', skillDoc('collide', 'Z'.repeat(50)))
    await writeSkill(dir, 'aaa', skillDoc('Collide!!', 'A'.repeat(50)))
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const candidates = await provider.list()
    // 候选必须按名字码位序返回，而不是按发现顺序
    assert.deepEqual(candidates.map((c) => c.name), ['collide', 'collide-2'])
    assert.deepEqual(
      candidates.map((c) => path.basename(path.dirname(c.locator.path))),
      ['aaa', 'zzz'],
      '同名冲突必须由码位序决定归属',
    )
    // 直接对纯函数下断言：排序后的输入与逆序输入必须得到同一分配
    const files = await discoverSkillFiles(dir)
    assert.deepEqual(files, [...files].sort(compareCodePoints))
    const namesFrom = async (target) =>
      (await makeEmbeddedSkillsProvider({ roots: [target] }).list()).map((c) => c.name)
    assert.deepEqual(await namesFrom(dir), await namesFrom(dir))
  } finally {
    await cleanup()
  }
})

/**
 * 通用不变式：**list() 给出的每个候选都必须能被 get() 接受，且返回同名定义**。
 *
 * 这一条不是为某个具体 bug 写的，而是因为「候选身份处理」连续三轮各出过一次问题
 * （1.1.0 回显 name/description → 1.1.1 回显 resourceBase → 1.1.2 用带后缀的
 * assignedName 去比文件里的 baseName）。任何身份逻辑写错都会破坏这条不变式，
 * 所以把它固化成断言，比逐个补洞更能防复发。
 * @param provider - 要检查的提供方。
 * @param label - 失败信息里的场景标签。
 */
async function assertIdentityInvariant(provider, label) {
  const candidates = await provider.list()
  assert.ok(candidates.length > 0, `${label}: list() 不应为空`)
  for (const candidate of candidates) {
    const def = await provider.get(candidate)
    assert.ok(def, `${label}: 候选 "${candidate.name}" 出现在目录里却加载不出来`)
    assert.equal(
      def.name,
      candidate.name,
      `${label}: get() 返回的名字必须与候选名一致（注册表会校验 definition.name === candidate.name）`,
    )
    assert.equal(def.path, candidate.locator.path)
    assert.equal(def.resourceBase.kind, 'directory')
    assert.equal(def.resourceBase.path, path.dirname(candidate.locator.path))
  }
  return candidates
}

test('T2.22 不变式：目录里的每个候选都必须能加载（含 -2 后缀的）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    // 两个技能归一化到同一 basename → 第二个拿到 -2 后缀。
    // 回归：get() 曾拿带后缀的 assignedName 去比文件里的 baseName，永远不相等，
    // 于是带后缀的技能被永久判为「漂移」——目录里有，get() 永远 undefined，
    // 而且每次尝试都会白白让注册表清一次 collect 缓存。
    await writeSkill(dir, 'aaa', skillDoc('collide', 'A'.repeat(50)))
    await writeSkill(dir, 'zzz', skillDoc('Collide!!', 'Z'.repeat(50)))
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const candidates = await assertIdentityInvariant(provider, 'collision root')
    assert.deepEqual(candidates.map((c) => c.name), ['collide', 'collide-2'])

    // 加载带后缀的那个不得产生任何虚假失效
    let invalidations = 0
    const observed = makeEmbeddedSkillsProvider({ roots: [dir], invalidate: () => { invalidations += 1 } })
    const listed = await observed.list()
    const before = invalidations
    for (const c of listed) {
      assert.ok(await observed.get(c), `观察实例里 ${c.name} 也应当可加载`)
    }
    assert.equal(invalidations, before, '加载未变化的技能不得触发失效')
  } finally {
    await cleanup()
  }
})

test('T2.23 drifted 分支必须有门禁（get() 在 list() 之外发现改动）', async () => {
  // 回归：drifted 分支整段没有门禁——把 dryift 恒置为 false、或去掉名字比较，
  // 测试依然全绿。这里刻意**不**调用 list()，直接在 get() 时改盘上的文件，
  // 逼 get() 自己发现漂移。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'drifting', skillDoc('drifting', 'A'.repeat(50)))
    let invalidations = 0
    const provider = makeEmbeddedSkillsProvider({ roots: [dir], invalidate: () => { invalidations += 1 } })
    const [candidate] = await provider.list()
    assert.ok(await provider.get(candidate))

    // 1) 只改描述，中间不调用 list()
    await writeSkill(dir, 'drifting', skillDoc('drifting', 'B'.repeat(50)))
    const beforeDesc = invalidations
    assert.equal(await provider.get(candidate), undefined, '描述变了，旧候选必须被判为漂移')
    assert.ok(invalidations > beforeDesc, '漂移必须触发 invalidate()')

    // 2) 改名，中间不调用 list()
    const [fresh] = await provider.list()
    await writeSkill(dir, 'drifting', skillDoc('renamed-entirely', 'B'.repeat(50)))
    const beforeName = invalidations
    assert.equal(await provider.get(fresh), undefined, '名字变了，旧候选必须被判为漂移')
    assert.ok(invalidations > beforeName)

    // 3) 一轮 list() 之后目录与加载必须重新自洽
    await assertIdentityInvariant(provider, 'after drift')
  } finally {
    await cleanup()
  }
})

test('T2.24 畸形块标量头一律拒绝（不再是「合法拼写白名单」）', () => {
  // 回归：只匹配合法指示符拼写会漏掉 `|--`、`|+2-`、`|2-9`、`|'`、`| -`、`|#x`，
  // 把字面量当描述发布出去。非引号且以 | 或 > 开头的一律算块标量头。
  for (const bad of ['|--', '|+2-', '|2-9', ">'", "|'", '| -', '|#x', '>#x', '>', '|', '|-', '>-', '|2-', '|-2', '>2+']) {
    assert.equal(normalizeDescription(bad), undefined, `畸形块标量头漏网: ${JSON.stringify(bad)}`)
  }
  // 引号包裹的不受影响（引号内的 > 是内容）
  assert.equal(normalizeDescription('">- is a block indicator"'), '>- is a block indicator')
  assert.equal(normalizeDescription('"|pipe"'), '|pipe')
})

test('T2.25 引号标量后面的注释里含引号也不能污染取值', () => {
  // 回归：unquote 用 lastIndexOf 找闭合引号，注释里的引号会把它带偏
  assert.equal(normalizeDescription('"a" # "b"'), 'a')
  assert.equal(normalizeDescription("'a' # it's b"), 'a')
  assert.equal(normalizeDescription('"quoted # not a comment"'), 'quoted # not a comment')
})

test('T2.26 布尔字段写错必须报错，不能按「没写」放行', () => {
  // 回归：frontmatterBoolean 对无效值返回 undefined，等于把
  // `disable-model-invocation: maybe` 当成没写——错在危险的方向（强行推销技能）。
  assert.throws(() => frontmatterBoolean('maybe', 'disable-model-invocation'), /must be a boolean/)
  assert.throws(() => frontmatterBoolean('ture', 'user-invocable'), /must be a boolean/)
  assert.throws(() => frontmatterBoolean('2', 'user-invocable'), /must be a boolean/)
  assert.equal(frontmatterBoolean(undefined), undefined)
  assert.equal(frontmatterBoolean('  '), undefined)
  assert.equal(frontmatterBoolean('TRUE'), true)
  assert.equal(frontmatterBoolean('Off'), false)
})

test('T2.27 引号包裹的旧驼峰键也必须被拒绝（不能形成静默绕过）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'quoted', skillDoc('quoted', 'Q'.repeat(50)))
    for (const [slug, key] of [
      ['dq', '"userInvocable"'],
      ['sq', "'userInvocable'"],
      ['dq-disable', '"disableModelInvocation"'],
    ]) {
      await writeSkill(dir, slug, `---\nname: ${slug}\ndescription: ${'X'.repeat(50)}\n${key}: false\n---\n\nbody\n`)
    }
    const skipped = []
    const names = (
      await makeEmbeddedSkillsProvider({ roots: [dir], onSkip: (f, r) => skipped.push(`${path.basename(path.dirname(f))}:${r}`) }).list()
    ).map((c) => c.name)
    assert.deepEqual(names, ['quoted'], `引号旧键不得进目录: ${names.join(', ')}`)
    for (const slug of ['dq', 'sq', 'dq-disable']) {
      assert.ok(
        skipped.some((s) => s.startsWith(slug + ':') && s.includes('unsupported')),
        `${slug} 未被诊断为旧键: ${skipped.join(' | ')}`,
      )
    }
  } finally {
    await cleanup()
  }
})

test('T2.28 描述可接受性必须与真实 YAML 解析器对齐（oracle 对照表）', async () => {
  // 期望值不是猜的：用 harness 自带的 `yaml` 逐条跑过得到的。判定基准是**官方
  // provider 的真实上下文**——它把整个 frontmatter 块交给 yaml.parse，所以
  // `description: text with: colon` 是合法纯量。我一度按「值和键同一上下文」建模，
  // 结果把本包自己的 description（含 "prompts: choreography"）都拒了，19 个门禁变红。
  const oracle = [
    // [值文本, 是否可接受]
    ['plain text', true],
    ['"quoted text"', true],
    ["'single quoted'", true],
    ['has # comment', true], // 注释被剥掉 → "has"
    ['https://example.com/a#b', true], // `#` 紧贴非空白，是值的一部分
    ['"keeps # this"', true], // 引号内一切保留
    ['"a" # "b"', true], // 闭合引号优先，注释里的引号不算
    ['text with: colon', false], // YAML: 嵌套映射 → 整块解析失败
    ['ends with:', false],
    ['# only comment', false], // YAML: null
    ['#only comment', false],
    ['-', false], // YAML: 同一行的块序列指示符 → 报错
    ['?', false],
    ['*alias', false], // 未定义别名 → 报错
    ['@reserved', false], // 保留字符开头 → 报错
    ['`reserved', false],
    ['&anchor', false], // 只有锚点名，没有值 → null
    ['&anchor text', true], // 锚点 + 真值 → 合法
    ['!tag', false], // 未解析标签 → 解析出空串，等于没写描述
    ['>-', false],
    ['>- # note', false],
    ['|', false],
    ['|--', false],
    ['|+2-', false],
    ['|2-9', false],
    ['>not a block', false],
    ['', false],
    ['   ', false],
  ]
  const wrong = []
  for (const [value, acceptable] of oracle) {
    const got = normalizeDescription(value) !== undefined
    if (got !== acceptable) {
      wrong.push(`${JSON.stringify(value)}: 期望 ${acceptable ? '接受' : '拒绝'}，实际 ${got ? '接受' : '拒绝'}`)
    }
  }
  assert.deepEqual(wrong, [], `与真实 YAML 解析器不一致:\n${wrong.join('\n')}`)

  // 关键回归：本包自己的 description 必须仍然被接受，否则技能直接消失
  const own = await readSkillFile(SKILL_FILE)
  assert.ok(own, '本包 SKILL.md 必须仍可解析')
  assert.match(own.description, /choreography/)

  // 与真实解析器对拍（harness 里就有 yaml 包；拿不到就跳过这一段）
  const dshSkillDir = path.join(
    path.dirname(process.execPath),
    '..',
    'lib',
    'node_modules',
    '@deepseek-ai',
  )
  let YAML
  try {
    const { createRequire } = await import('node:module')
    const anchor = 'C:/Users/yaoyufeng/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-skill-filesystem/package.json'
    YAML = createRequire(anchor)('yaml')
  } catch {
    YAML = undefined
  }
  void dshSkillDir
  if (YAML === undefined) return
  const disagreements = []
  for (const [value] of oracle) {
    // 官方上下文：整个 frontmatter 块（不含 --- 行）交给 yaml.parse
    let parsed
    try {
      parsed = YAML.parse(`name: probe\ndescription: ${value}\n`)
    } catch {
      parsed = undefined
    }
    const realUsable = typeof parsed?.description === 'string' && parsed.description.trim() !== ''
    const ours = normalizeDescription(value) !== undefined
    // 我们只允许「比真实解析器更保守」，不允许更宽松
    if (ours && !realUsable) disagreements.push(`${JSON.stringify(value)}: 我们接受但真实解析器得到不可用值`)
  }
  assert.deepEqual(disagreements, [], `比真实解析器更宽松:\n${disagreements.join('\n')}`)
})

test('T2.29 key 与冒号之间的空白不得形成静默绕过', async () => {
  // 回归：键正则要求冒号紧贴键名，于是合法 YAML `disable-model-invocation : true`
  // 完全不可见——作者明确声明「禁止模型自动调用」，我们却照常推销出去。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'ok', skillDoc('ok', 'O'.repeat(50)))
    // 四种写法都是合法 YAML，都必须被读到（前三种是旧键 → 拒绝；第四种是策略）
    await writeSkill(
      dir,
      'spaced-policy',
      '---\nname: spaced-policy\ndescription: ' + 'S'.repeat(50) + '\ndisable-model-invocation : true\n---\n\nbody\n',
    )
    await writeSkill(
      dir,
      'spaced-legacy',
      '---\nname: spaced-legacy\ndescription: ' + 'L'.repeat(50) + '\nuserInvocable : false\n---\n\nbody\n',
    )
    await writeSkill(
      dir,
      'spaced-quoted-legacy',
      '---\nname: spaced-quoted-legacy\ndescription: ' + 'Q'.repeat(50) + '\n"userInvocable" : false\n---\n\nbody\n',
    )
    // 键与冒号之间有空白的普通字段也必须读到
    await writeSkill(dir, 'spaced-name', '---\nname : spaced-name\ndescription : ' + 'N'.repeat(50) + '\n---\n\nbody\n')

    const skipped = []
    const provider = makeEmbeddedSkillsProvider({
      roots: [dir],
      onSkip: (f, r) => skipped.push(`${path.basename(path.dirname(f))}:${r}`),
    })
    const byName = new Map((await provider.list()).map((c) => [c.name, c]))
    assert.ok(byName.has('ok'))
    assert.ok(byName.has('spaced-name'), '键与冒号间有空白的 name/description 必须被读到')
    assert.equal(byName.get('spaced-policy').invocation.modelInvocable, false, '空格式策略必须生效')
    assert.ok(!byName.has('spaced-legacy'), '空格式旧键必须被拒绝')
    assert.ok(!byName.has('spaced-quoted-legacy'), '空白 + 引号旧键必须被拒绝')
    assert.ok(skipped.some((s) => s.startsWith('spaced-legacy:') && s.includes('unsupported')))
    assert.ok(skipped.some((s) => s.startsWith('spaced-quoted-legacy:') && s.includes('unsupported')))
  } finally {
    await cleanup()
  }
})

test('T2.30 目录返回顺序必须按码位序（用与 NTFS 顺序不同的fixture）', async () => {
  // 回归：T2.18b 自称能抓排序缺陷，但它的 fixture（aaa/zzz）恰好与 NTFS 的
  // readdir 顺序一致，而且它拿函数输出与「自己的排序副本」比——循环论证。
  // 这里改用大小写混合的名字：NTFS 返回 alpha, apple, Beta, Zebra，
  // 码位序却是 Beta, Zebra, alpha, apple，两者必然不同。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    for (const slug of ['alpha', 'apple', 'Beta', 'Zebra']) {
      await writeSkill(dir, slug, skillDoc(slug, 'X'.repeat(50)))
    }
    const discovered = await discoverSkillFiles(dir)
    const discoveredNames = discovered.map((f) => path.basename(path.dirname(f)))
    assert.deepEqual(
      discoveredNames,
      [...discoveredNames].sort(compareCodePoints),
      'discoverSkillFiles 必须按码位序返回',
    )
    // 这条断言只有在 fixture 顺序与码位序不同时才有鉴别力
    const provider = makeEmbeddedSkillsProvider({ roots: [dir] })
    const names = (await provider.list()).map((c) => c.name)
    assert.deepEqual(names, [...names].sort(compareCodePoints), '目录必须按码位序返回')
    assert.ok(
      names.join(',') !== discoveredNames.join(','),
      '本用例的前提是码位序与文件系统顺序不同，否则这条门禁没有鉴别力',
    )
  } finally {
    await cleanup()
  }
})

test('T2.18 分配结果与文件系统遍历顺序无关', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    // 两个不同目录里各放一个会归一化到同一 basename 的技能：
    // 目录名 aaa < zzz（码位序），所以 collide 必须归 aaa，
    // 与 readdir 返回顺序无关。
    await writeSkill(dir, 'zzz', skillDoc('collide', 'Z'.repeat(50)))
    await writeSkill(dir, 'aaa', skillDoc('Collide!!', 'A'.repeat(50)))
    const pairs = async () =>
      (await makeEmbeddedSkillsProvider({ roots: [dir] }).list()).map((c) => [
        c.name,
        path.basename(path.dirname(c.locator.path)),
      ])
    const first = await pairs()
    const second = await pairs()
    assert.deepEqual(first, second, '两次独立发现必须得到相同分配')
    assert.deepEqual(
      first.filter(([n]) => n === 'collide').map(([, d]) => d),
      ['aaa'],
      '后缀分配必须由码位序决定，而不是 readdir 顺序',
    )
    assert.deepEqual(first.map(([n]) => n).sort(), ['collide', 'collide-2'])
  } finally {
    await cleanup()
  }
})

test('T2.19 get() 必须重新推导 resourceBase，不回显可变的 candidate', async () => {
  // 不回显的意义：candidate 是调用方拿得到的普通对象，改写它的 resourceBase
  // 就能把模型引到任意目录去读「技能资源」。
  const provider = makeProvider()
  const [candidate] = await provider.list()
  candidate.resourceBase = { kind: 'directory', path: 'C:\\attacker-controlled' }
  candidate.source = 'attacker'
  const def = await provider.get(candidate)
  assert.ok(def, '名字/描述没变时仍应能加载')
  assert.equal(def.resourceBase.path, SKILL_DIR)
  assert.equal(def.resourceBase.kind, 'directory')
  assert.equal(def.source, 'fsd')
})

test('T2.20 技能文件被删除后，get() 必须作废缓存并请求失效', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'doomed', skillDoc('doomed', 'D'.repeat(50)))
    let invalidations = 0
    const provider = makeEmbeddedSkillsProvider({ roots: [dir], invalidate: () => { invalidations += 1 } })
    const [candidate] = await provider.list()
    assert.ok(await provider.get(candidate))

    await rm(path.join(dir, 'doomed', 'SKILL.md'), { force: true })
    const before = invalidations
    assert.equal(await provider.get(candidate), undefined, '文件没了就不能再返回定义')
    assert.ok(invalidations > before, '删除必须触发 invalidate()，否则目录会永远挂着加载不出来的技能')
    // 下一轮 list() 起，该技能彻底消失
    assert.deepEqual(await provider.list(), [])
  } finally {
    await cleanup()
  }
})

test('T2.21 调用策略或 whenToUse 变化也必须作废缓存', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    const body = (extra) => `---\nname: policy\ndescription: ${'P'.repeat(50)}\n${extra}---\n\nbody\n`
    await writeSkill(dir, 'policy', body(''))
    let invalidations = 0
    const provider = makeEmbeddedSkillsProvider({ roots: [dir], invalidate: () => { invalidations += 1 } })
    const [first] = await provider.list()
    assert.deepEqual(first.invocation, { modelInvocable: true, userInvocable: true })

    await writeSkill(dir, 'policy', body('disable-model-invocation: true\n'))
    await provider.list()
    assert.ok(invalidations >= 1, '调用策略变化必须失效')

    // 旧候选的 get() 必须失效，不能继续用旧策略发出去
    assert.equal(await provider.get(first), undefined)
  } finally {
    await cleanup()
  }
})
