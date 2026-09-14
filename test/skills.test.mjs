// SPDX-License-Identifier: MIT
// T1 — 技能文件契约。门禁：任一条失败即说明技能无法被 DSH 正确加载。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { KEBAB_RE, parseFrontmatter, readSkillFile } from '../lib/skills-provider.mjs'
import { REFS_DIR, SKILL_DIR, SKILL_FILE, SKILLS_DIR, readText } from './helpers.mjs'

test('T1.1 SKILL.md 存在且 frontmatter 可解析', async () => {
  const raw = await readText(SKILL_FILE)
  const { meta, body } = parseFrontmatter(raw)
  assert.ok(raw.startsWith('---'), 'frontmatter 必须以 --- 开头')
  assert.ok(body.trim().length > 0, '正文不能为空')
  assert.ok(Object.keys(meta).length > 0, 'frontmatter 必须至少有一个键')
})

test('T1.2 name 为 fight-scene-director 且满足 kebab-case', async () => {
  const skill = await readSkillFile(SKILL_FILE)
  assert.ok(skill, 'readSkillFile 必须成功（name/description 非空）')
  assert.equal(skill.name, 'fight-scene-director')
  assert.match(skill.name, KEBAB_RE)
})

test('T1.3 description 非空且足够具体（> 40 字符）', async () => {
  const skill = await readSkillFile(SKILL_FILE)
  assert.ok(skill)
  assert.ok(skill.description.length > 40, `description 过短: ${skill.description.length}`)
  // 中文触发词：DSH 用 description 做语义召回，中文用户说「打戏」也应命中。
  assert.match(skill.description, /打戏|动作导演/)
  // 目标模型锚点：移植不得丢失适配目标。
  assert.match(skill.description, /Seedance/)
  assert.match(skill.description, /MiniMax/)
})

test('T1.8 description 必须完整落在 DSH 目录截断预算内，且锚点前置', async () => {
  // dsh-tool-skill 用 DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH=500，
  // 渲染成 `- \`name\`: ` + slice(0, 497) + '...'。超长部分模型永远看不到，
  // 所以「写在 description 里」不等于「模型能召回」。
  const CATALOG_DESCRIPTION_MAX_LENGTH = 500
  const VISIBLE_BUDGET = CATALOG_DESCRIPTION_MAX_LENGTH - 3
  const skill = await readSkillFile(SKILL_FILE)
  assert.ok(skill)
  assert.ok(
    skill.description.length <= VISIBLE_BUDGET,
    `description ${skill.description.length} 字符超过目录可见预算 ${VISIBLE_BUDGET}；` +
      '超出部分不会进入模型上下文，请把关键触发词前移或删减。',
  )
  const visible = skill.description.slice(0, VISIBLE_BUDGET)
  for (const anchor of ['fight-scene', '打戏', '分镜', '轨迹图', 'Seedance', 'MiniMax']) {
    assert.ok(visible.includes(anchor), `锚点 "${anchor}" 落在目录截断之外，模型看不到`)
  }
})

test('T1.9 显式调用姿势写对了（/name，而不是 skill name）', async () => {
  const skill = await readSkillFile(SKILL_FILE)
  assert.ok(skill)
  // dsh-tool-skill 的 SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/
  assert.ok(
    /`\/fight-scene-director`/.test(skill.content),
    'SKILL.md 必须告诉模型用户用 /fight-scene-director 显式调用',
  )
  assert.ok(
    !/`skill fight-scene-director`/.test(skill.content),
    '不应把 skill 工具调用写成面向用户的姿势',
  )
})

test('T1.4 正文保留上游全部规则小节，且给出 DSH 调用说明', async () => {
  const skill = await readSkillFile(SKILL_FILE)
  assert.ok(skill)
  for (const heading of [
    '## Language',
    '## Route the Request',
    '## Load Only the Relevant Knowledge',
    '## Non-negotiable Output Rules',
    '## Scope',
  ]) {
    assert.ok(skill.content.includes(heading), `缺少上游小节: ${heading}`)
  }
  assert.ok(skill.content.includes('DeepSeek Harness Notes'), '必须包含 DSH 适配说明')
  assert.ok(
    !/\$fight-scene-director/.test(skill.content),
    '不应保留 Codex 的 $skill 调用语法',
  )
})

test('T1.5 正文引用的 references/*.md 全部真实存在', async () => {
  const content = await readText(SKILL_FILE)
  const links = [...content.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((m) => m[1])
  assert.ok(links.length >= 4, `references 链接过少: ${links.length}`)
  const onDisk = new Set(await readdir(REFS_DIR))
  for (const link of new Set(links)) {
    const base = path.basename(link)
    assert.ok(onDisk.has(base), `SKILL.md 引用了不存在的文件: ${link}`)
  }
})

test('T1.6 references 目录文件数正确且无空文件', async () => {
  const files = (await readdir(REFS_DIR)).filter((f) => f.endsWith('.md')).sort()
  assert.deepEqual(files, [
    'choreography-and-camera.md',
    'examples.md',
    'interaction-routing.md',
    'output-format.md',
    'trajectory-workflow.md',
  ])
  for (const f of files) {
    const text = await readText(path.join(REFS_DIR, f))
    assert.ok(text.trim().length > 1000, `${f} 内容过短，疑似被截断`)
  }
})

test('T1.7 skills/ 下技能名全局唯一且全部 kebab-case', async () => {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  const names = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skill = await readSkillFile(path.join(SKILLS_DIR, entry.name, 'SKILL.md'))
    assert.ok(skill, `${entry.name} 目录下 SKILL.md 未通过校验（名称/描述缺失或正文为空）`)
    assert.match(skill.name, KEBAB_RE, `${entry.name} 的技能名不是 kebab-case`)
    names.push(skill.name)
  }
  assert.ok(names.length >= 1)
  assert.equal(new Set(names).size, names.length, `技能名重复: ${names.join(', ')}`)
  assert.equal(path.dirname(SKILL_FILE), SKILL_DIR)
})

test('T1.10 frontmatter 的标量必须是合法 YAML（静态判据 + 有 yaml 包时对拍）', async () => {
  // 这一条是**本该最早存在**的门禁：本包的 SKILL.md 一度写成
  // `description: Design ... prompts: choreography, ...`——值里含「冒号 + 空白」，
  // 在 YAML 里是嵌套映射 → 官方 provider 把整个文件丢掉（技能凭空消失），
  // 而我们自己的宽松解析器照常发布。
  //
  // 判定分两层：静态判据永远跑（上面那个形态就是它该抓的），
  // 拿得到真实 yaml 包时再额外对拍一遍。不 hardcode 某台机器的绝对路径——
  // 那会在 CI 上静默退化成「永远只跑静态判据」而不自知。
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.join(SKILLS_DIR, entry.name, 'SKILL.md')
    if (existsSync(file)) files.push(file)
  }
  assert.ok(files.length > 0)

  /** 静态判据：非引号的标量形态里不得出现「冒号 + 空白」或以冒号结尾。 */
  const staticProblems = (raw) => {
    const end = raw.indexOf('\n---', 3)
    if (!raw.startsWith('---') || end === -1) return ['缺少 frontmatter']
    const problems = []
    for (const line of raw.slice(3, end).split(/\r?\n/)) {
      const m = /^("([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(.*)$/.exec(line)
      if (!m) continue
      const key = m[2] ?? m[3] ?? m[4]
      const value = m[5] ?? ''
      if (value.startsWith('"') || value.startsWith("'")) continue // 引号内合法
      const bare = value.replace(/\s#.*$/, '').trimEnd()
      // 注释行／空值不算问题（语义上是「没写」），会被上层跳过并诊断
      if (bare === '' || bare.startsWith('#')) continue
      if (/:\s/.test(bare) || bare.endsWith(':')) {
        problems.push(`${key}: 值里含「冒号 + 空白」，会被 YAML 解析成嵌套映射: ${JSON.stringify(bare.slice(0, 50))}`)
      }
      if (/^[|>]/.test(bare)) problems.push(`${key}: 值以块标量指示符开头`)
      if (/^[-?*@`]/.test(bare)) problems.push(`${key}: 值以 YAML 保留指示符开头`)
      if (/^[&!][^\s]*$/.test(bare)) problems.push(`${key}: 只有锚点/标签指示符，没有值`)
    }
    return problems
  }

  for (const file of files) {
    const raw = await readText(file)
    assert.deepEqual(staticProblems(raw), [], `${file} 的 frontmatter 含非法标量（官方 provider 会丢弃该技能）`)
  }

  // 有真实 yaml 包时对拍（软性：环境里没有也照样跑静态判据）
  let YAML
  try {
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    for (const specifier of ['yaml', '@deepseek-ai/dsh-skill-filesystem']) {
      try {
        const resolved = require.resolve(specifier)
        const anchor = specifier === 'yaml' ? resolved : createRequire(resolved).resolve('yaml')
        YAML = createRequire(anchor)('yaml')
        break
      } catch {
        // 试下一个
      }
    }
  } catch {
    YAML = undefined
  }
  if (YAML === undefined) return

  for (const file of files) {
    const raw = await readText(file)
    const end = raw.indexOf('\n---', 3)
    let parsed
    let failure
    try {
      parsed = YAML.parse(raw.slice(3, end))
    } catch (error) {
      failure = String(error.message).split('\n')[0]
    }
    assert.equal(failure, undefined, `${file} 的 frontmatter 不是合法 YAML: ${failure}`)
    assert.equal(typeof parsed?.name, 'string', `${file}: name 必须是字符串`)
    assert.equal(typeof parsed?.description, 'string', `${file}: description 必须是字符串`)
    assert.ok(parsed.description.trim() !== '', `${file}: description 不能为空`)
  }
})
