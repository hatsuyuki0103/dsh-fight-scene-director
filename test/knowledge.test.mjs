// SPDX-License-Identifier: MIT
// T3 — 知识保真：防止移植过程中静默改写上游中文输出契约。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { REFS_DIR, HASHES_FIXTURE, ROOT, readText, sha256 } from './helpers.mjs'

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

test('T3.4 references 与钉定上游 commit 逐字节一致', async (t) => {
  if (process.env.FSD_SKIP_UPSTREAM_HASH === '1') {
    t.skip('FSD_SKIP_UPSTREAM_HASH=1')
    return
  }
  const fixture = JSON.parse(await readText(HASHES_FIXTURE))
  assert.equal(fixture.commit, '6265df37ae701449ef672f46db65ab15c4af9fc2')
  for (const [file, meta] of Object.entries(fixture.files)) {
    const actual = await sha256(path.join(REFS_DIR, file))
    assert.equal(
      actual,
      meta.sha256,
      `${file} 与上游不一致（被改写或损坏）。若是有意改写，请同步更新 test/fixtures/upstream-hashes.json 并在 CHANGELOG 说明。`,
    )
  }
})

test('T3.5 上游作者署名与 MIT 归属保留在包内', async () => {
  const notice = await readText(path.join(ROOT, 'NOTICE'))
  assert.match(notice, /AIZAO Aloong/)
  assert.match(notice, /ZzzAloong\/fight-scene-director/)
  const upstreamLicense = await readText(path.join(ROOT, 'LICENSE.upstream'))
  assert.match(upstreamLicense, /MIT License/)
  assert.match(upstreamLicense, /Copyright \(c\) 2026 AIZAO Aloong/)
})
