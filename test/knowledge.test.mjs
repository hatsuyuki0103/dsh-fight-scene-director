// SPDX-License-Identifier: MIT
// T3 — 知识保真：防止移植过程中静默改写上游中文输出契约。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { REFS_DIR, HASHES_FIXTURE, ROOT, SKILLS_DIR, readText, sha256 } from './helpers.mjs'

test('T3.1 output-format.md 保留全部中文输出字段锚点', async () => {
  const text = await readText(path.join(REFS_DIR, 'output-format.md'))
  for (const anchor of [
    '【视觉风格】',
    '【参考资产】',
    '【预计时长】',
    '【禁止项】',
    '【初始空间关系】',
    '【详细打斗分镜提示词】',
  ]) {
    assert.ok(text.includes(anchor), `输出契约锚点丢失: ${anchor}`)
  }
})

test('T3.2 节奏面板分隔句保留（面板不得混入提示词）', async () => {
  const text = await readText(path.join(REFS_DIR, 'output-format.md'))
  assert.ok(text.includes('下面不是提示词，是帮你调整节奏的面板'))
  assert.ok(text.includes('【打斗节奏梳理】'))
})

test('T3.3 各 references 保留其独有主题，未被互相覆盖', async () => {
  const expectations = {
    'choreography-and-camera.md': /镜头|shot|景别/i,
    'trajectory-workflow.md': /轨迹|trajectory/i,
    'interaction-routing.md': /route|路由|交互|onboarding/i,
    'examples.md': /example|示例/i,
  }
  for (const [file, re] of Object.entries(expectations)) {
    const text = await readText(path.join(REFS_DIR, file))
    assert.match(text, re, `${file} 缺少其应有主题`)
  }
})

test('T3.4 references 与钉定上游 commit 逐字节一致', async () => {
  const fixture = JSON.parse(await readText(HASHES_FIXTURE))
  assert.equal(fixture.commit, '6265df37ae701449ef672f46db65ab15c4af9fc2')
  const expectedFiles = [
    'choreography-and-camera.md',
    'examples.md',
    'interaction-routing.md',
    'output-format.md',
    'trajectory-workflow.md',
  ]
  // 先锁夹具自身的覆盖面：把 files 清空也能 5/5 全绿的话，这道门禁就是装饰。
  assert.deepEqual(
    Object.keys(fixture.files).sort(),
    expectedFiles,
    '夹具必须覆盖全部五个 references，否则门禁覆盖不全',
  )
  for (const [file, meta] of Object.entries(fixture.files)) {
    const actualHash = await sha256(path.join(REFS_DIR, file))
    assert.equal(
      actualHash,
      meta.sha256,
      `${file} 与上游不一致（被改写或损坏）。若是有意改写，请同步更新 test/fixtures/upstream-hashes.json 并在 CHANGELOG 说明。`,
    )
    const actualBytes = Buffer.byteLength(await readText(path.join(REFS_DIR, file)), 'utf8')
    assert.equal(actualBytes, meta.bytes, `${file} 字节数与夹具不符`)
    assert.ok(meta.bytes > 1000, `${file} 夹具记录的大小不合理: ${meta.bytes}`)
  }
  // 反向覆盖：references 目录里不该有夹具之外的 .md 悄悄混进来
  const onDisk = (await readdir(REFS_DIR)).filter((f) => f.endsWith('.md')).sort()
  assert.deepEqual(onDisk, expectedFiles, 'references 目录内容必须与夹具一一对应')
})

test('T3.5 上游作者署名与 MIT 归属保留在包内', async () => {
  const notice = await readText(path.join(ROOT, 'NOTICE'))
  assert.match(notice, /AIZAO Aloong/)
  assert.match(notice, /ZzzAloong\/fight-scene-director/)
  const upstreamLicense = await readText(path.join(ROOT, 'LICENSE.upstream'))
  assert.match(upstreamLicense, /MIT License/)
  assert.match(upstreamLicense, /Copyright \(c\) 2026 AIZAO Aloong/)
})

test('T3.6 docs/ 下的上游对照副本同样逐字节一致，且确实随包分发', async () => {
  // THIRD_PARTY_NOTICES.md 声明这些文件与上游逐字节一致；声明了就要有门禁兜着，
  // 否则「对照副本」慢慢漂移，diff 就变成误导。
  const fixture = JSON.parse(await readText(HASHES_FIXTURE))
  const expectations = {
    'docs/upstream-SKILL.md': fixture.upstreamSkillMd.sha256,
    'docs/upstream-README.md': fixture.upstreamReadmeMd.sha256,
    'docs/upstream-agents-openai.yaml': fixture.upstreamAgentsOpenaiYaml.sha256,
    'LICENSE.upstream': fixture.upstreamLicenseTxt.sha256,
  }
  for (const [rel, expected] of Object.entries(expectations)) {
    assert.ok(expected, `${rel} 在夹具里缺少记录`)
    assert.equal(await sha256(path.join(ROOT, rel)), expected, `${rel} 与上游不一致`)
  }
  // docs/ 必须真的随包分发：README 与 NOTICE 都指向它，缺了就是死链
  const pkg = JSON.parse(await readText(path.join(ROOT, 'package.json')))
  assert.ok(pkg.files.includes('docs'), 'README/NOTICE 链接了 docs/，package.json files 必须包含 docs')
})

test('T3.7 被 /name 引用的资源在磁盘上可解析（端到端引用完整性）', async () => {
  const skill = await readSkillFileRaw()
  const refs = [...new Set([...skill.content.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map((m) => m[1]))]
  assert.ok(refs.length >= 4, `正文引用的 references 过少: ${refs.length}`)
  for (const rel of refs) {
    assert.ok(existsSync(path.join(REFS_DIR, path.basename(rel))), `正文引用了不存在的文件: ${rel}`)
  }
  assert.ok(skill.content.trim().length > 0)
  assert.ok(skill.description.trim().length > 0)
})

/**
 * 以提供方视角读取技能正文（与测试内其他直接读文件的断言互补）。
 * @returns 技能定义。
 */
async function readSkillFileRaw() {
  const { makeEmbeddedSkillsProvider } = await import('../lib/skills-provider.mjs')
  const provider = makeEmbeddedSkillsProvider({ roots: [SKILLS_DIR] })
  const [candidate] = await provider.list()
  return provider.get(candidate)
}
