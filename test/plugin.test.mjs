// SPDX-License-Identifier: MIT
// T4 + T5 — 插件入口形态与假 ctx 冒烟。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { ROOT, makeTempSkillRoot, readText, skillDoc, writeSkill } from './helpers.mjs'
import { apply, inject, name as pluginName } from '../index.mjs'

/** 假 ctx：只记录 registerProvider 的调用。 */
function makeFakeCtx() {
  const factories = []
  return {
    factories,
    ctx: {
      skills: {
        registerProvider(factory) {
          factories.push(factory)
          return () => {}
        },
      },
    },
  }
}

test('T4.1 index.mjs 导出 name / inject / apply', () => {
  assert.equal(typeof pluginName, 'string')
  assert.ok(pluginName.length > 0)
  assert.ok(Array.isArray(inject))
  assert.ok(inject.includes('skills'), '必须硬依赖 skills 服务')
  assert.equal(typeof apply, 'function')
})

test('T4.2 cordis.patch.yml 声明正确的插件行', async () => {
  const text = await readText(path.join(ROOT, 'cordis.patch.yml'))
  assert.ok(text.includes('insert:'))
  const rowName = /name:\s*(\S+)/.exec(text)
  const rowId = /id:\s*(\S+)/.exec(text)
  assert.ok(rowName, 'patch 必须声明插件 name')
  assert.ok(rowId, 'patch 必须声明行 id')
  assert.equal(rowName[1], 'dsh-fight-scene-director', 'name 必须是真实包名（pnpm 按包名解析）')
  assert.equal(rowId[1], 'fsd-skills')
})

test('T4.3 package.json 打包与发布元数据自洽', async () => {
  const pkg = JSON.parse(await readText(path.join(ROOT, 'package.json')))
  assert.equal(pkg.name, 'dsh-fight-scene-director')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  for (const required of ['index.mjs', 'lib', 'skills', 'cordis.patch.yml']) {
    assert.ok(pkg.files.includes(required), `files 必须包含 ${required}`)
  }
  assert.equal(pkg.exports['.'], './index.mjs')
  assert.match(pkg.repository.url, /github\.com\/hatsuyuki0103\/dsh-fight-scene-director/)
  assert.equal(pkg.license, 'MIT')
  assert.match(pkg.engines.node, /22\.19\.0/)
  // 包名与 patch 行 name 必须一致，否则安装后无法解析
  const patch = await readText(path.join(ROOT, 'cordis.patch.yml'))
  assert.ok(patch.includes(pkg.name))
})

test('T5.1 apply(ctx) 注册了恰好一个 provider 工厂，且产物形状正确', async () => {
  const { ctx, factories } = makeFakeCtx()
  apply(ctx, {})
  assert.equal(factories.length, 1)
  const provider = await factories[0]()
  assert.equal(provider.name, 'fsd-skills')
  assert.equal(typeof provider.list, 'function')
  assert.equal(typeof provider.get, 'function')
  const candidates = await provider.list()
  assert.deepEqual(candidates.map((c) => c.name), ['fight-scene-director'])
})

test('T5.2 enableSkills:false 时不注册任何 provider', () => {
  const { ctx, factories } = makeFakeCtx()
  apply(ctx, { enableSkills: false })
  assert.equal(factories.length, 0)
})

test('T5.3 extraSkillDirs 能把额外技能纳入同一 provider', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'extra-one', skillDoc('extra-one', 'E'.repeat(50)))
    const { ctx, factories } = makeFakeCtx()
    apply(ctx, { extraSkillDirs: [dir] })
    const names = (await (await factories[0]()).list()).map((c) => c.name)
    assert.deepEqual(names, ['extra-one', 'fight-scene-director'])
  } finally {
    await cleanup()
  }
})

test('T5.4 maxSkills 配置透传，非法值回退默认', async () => {
  const { ctx, factories } = makeFakeCtx()
  apply(ctx, { maxSkills: 1 })
  assert.equal((await (await factories[0]()).list()).length, 1)

  const second = makeFakeCtx()
  apply(second.ctx, { maxSkills: 'not-a-number' })
  assert.equal((await (await second.factories[0]()).list()).length, 1, '非法值应回退默认上限 100')
})

test('T5.5 apply 不产生进程级副作用（不注册工具、不写盘、不改全局）', async () => {
  const touched = []
  const ctx = {
    skills: { registerProvider: () => () => {} },
    tools: { register: (...a) => touched.push(['tools.register', ...a]) },
    on: (...a) => touched.push(['on', ...a]),
    effect: (...a) => touched.push(['effect', ...a]),
  }
  const before = new Set(Object.keys(globalThis))
  apply(ctx, {})
  assert.deepEqual(touched, [], 'apply 只应调用 skills.registerProvider')
  const after = new Set(Object.keys(globalThis))
  assert.deepEqual([...after].filter((k) => !before.has(k)), [], 'apply 不得污染全局')
})
