// SPDX-License-Identifier: MIT
// T4 + T5 — 插件入口形态与假 ctx 冒烟。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { ROOT, makeTempSkillRoot, readText, skillDoc, writeSkill } from './helpers.mjs'
import { apply, inject, name as pluginName, normalizeConfig } from '../index.mjs'

/** 假 ctx：记录 registerProvider 的调用，并可捕获 logger 警告。 */
function makeFakeCtx() {
  const factories = []
  const warnings = []
  return {
    factories,
    warnings,
    ctx: {
      skills: {
        registerProvider(factory) {
          factories.push(factory)
          return () => {}
        },
      },
      logger: { warn: (msg) => warnings.push(String(msg)) },
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
  const block = text.slice(text.indexOf('insert:'))
  const rowName = /^\s*-\s*name:\s*(\S+)\s*$/m.exec(block)?.[1] ?? /^\s+name:\s*(\S+)\s*$/m.exec(block)?.[1]
  const rowId = /^\s*-\s*id:\s*(\S+)\s*$/m.exec(block)?.[1] ?? /^\s+id:\s*(\S+)\s*$/m.exec(block)?.[1]
  assert.ok(rowName, 'patch 必须声明插件 name')
  assert.ok(rowId, 'patch 必须声明行 id')
  assert.equal(rowName, 'dsh-fight-scene-director', 'name 必须是真实包名（pnpm 按包名解析）')
  // loader entry id 在整棵组合树里必须唯一，重复 id 会在**启动时**炸掉整个 profile
  // （duplicate loader entry id），而 --dump-config 看不出来。用包名做 id，
  // 让唯一的碰撞可能是「同一插件被装两次」——那本来就该响。
  assert.equal(rowId, 'dsh-fight-scene-director', 'row id 必须是包作用域的，不能用泛化前缀')
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
  // 运行时并不 import cordis，它随 harness 提供；必须是「可选」peer，
  // 否则 npm 安装会把一份 cordis 副本拖进消费者工程。
  assert.ok(
    pkg.peerDependenciesMeta?.['@deepseek-ai/cordis']?.optional === true,
    'cordis 必须声明为 optional peer（代码并不 import 它）',
  )
  // docs/ 随包分发：README 与 NOTICE 都指向它，缺了就是死链
  if (/docs\/PORT-NOTES/.test(await readText(path.join(ROOT, 'README.zh.md')))) {
    assert.ok(pkg.files.includes('docs'), 'README 链接了 docs/，files 必须包含 docs')
  }
})

test('T4.4 patch 行的 name 与包名逐字一致（真断言，不看注释）', async () => {
  const pkg = JSON.parse(await readText(path.join(ROOT, 'package.json')))
  const text = await readText(path.join(ROOT, 'cordis.patch.yml'))
  // 只取 insert 块里的 name 行，避免被文件头注释里的包名蒙混过关
  const block = text.slice(text.indexOf('insert:'))
  const rowName = /^\s+name:\s*(\S+)\s*$/m.exec(block)?.[1]
  assert.equal(rowName, pkg.name)
})

test('T4.5 smoke.yml 的合成树断言必须匹配真实行 id（拒绝 fsd-skills）', async () => {
  // 回归：行 id 从 `fsd-skills` 改成包名后，workflow 里的 grep 忘了同步，
  // 于是整个项目唯一的真实端到端安装门禁变红。这一类「文档/CI 里写死的标识符」
  // 没有类型系统兜着，只能靠断言。
  const yml = await readText(path.join(ROOT, '.github', 'workflows', 'smoke.yml'))
  // 只取「正向断言」行（`grep -q '…' || { echo FAIL … }` 这种），
  // 排除刻意保留的反向断言（`if grep -q 'fsd-skills' … leaked into a patch row id`）。
  const positive = yml
    .split(/\r?\n/)
    .filter((l) => /grep\s+-q/.test(l) && !/leaked into a patch row id|^\s*if\s/.test(l))
  assert.ok(positive.length >= 2, `smoke.yml 应当正向断言行 id 与包名两项，实际 ${positive.length}`)
  assert.ok(
    !positive.some((l) => /fsd-skills/.test(l)),
    `smoke.yml 不得用 fsd-skills 判断合成树——那是提供方内部名，不在 profile 树里:\n${positive.join('\n')}`,
  )
  assert.ok(
    positive.some((l) => /'id: dsh-fight-scene-director'/.test(l)),
    'smoke.yml 必须正向断言行 id `id: dsh-fight-scene-director`',
  )
  assert.ok(
    positive.some((l) => /'name: dsh-fight-scene-director'/.test(l)),
    'smoke.yml 必须正向断言行 name 为真实包名',
  )
  // 反向断言（防止内部名泄漏回行 id）也要在
  assert.ok(/leaked into a patch row id/.test(yml), '应保留对内部名泄漏的反向断言')
})

test('T4.6 README 里钉的版本必须等于包版本（防止文档滞后）', async () => {
  // 回归：文档里的 #tag 与 tarball 链接停留在旧版本，用户照抄就装到带已知缺陷的构建。
  const pkg = JSON.parse(await readText(path.join(ROOT, 'package.json')))
  const version = pkg.version
  for (const rel of ['README.md', 'README.zh.md']) {
    const text = await readText(path.join(ROOT, rel))
    const tags = [...text.matchAll(/#v(\d+\.\d+\.\d+)\b/g)].map((m) => m[1])
    assert.ok(tags.length > 0, `${rel} 应当给出一个钉版本的安装示例`)
    for (const tag of tags) {
      assert.equal(tag, version, `${rel} 钉的是 v${tag}，包版本是 ${version}`)
    }
    const tarballs = [...text.matchAll(/releases\/download\/v(\d+\.\d+\.\d+)\//g)].map((m) => m[1])
    for (const tarball of tarballs) {
      assert.equal(tarball, version, `${rel} 的 tarball 链接指向 v${tarball}，包版本是 ${version}`)
    }
    const assetNames = [...text.matchAll(/dsh-fight-scene-director-(\d+\.\d+\.\d+)\.tgz/g)].map((m) => m[1])
    for (const asset of assetNames) {
      assert.equal(asset, version, `${rel} 的 asset 名是 ${asset}，包版本是 ${version}`)
    }
  }
})

test('T4.7 README 必须写明「新增技能需要重启」这一真实边界', async () => {
  // 回归：CHANGELOG 与代码注释都声称 README 写了这条限制，实际两个 README 都没写。
  for (const rel of ['README.md', 'README.zh.md']) {
    const text = await readText(path.join(ROOT, rel))
    assert.match(
      text,
      /Adding or changing skills needs a restart|新增或修改技能需要重启/,
      `${rel} 必须说明新增技能需要重启（这是注册表缓存导致的真实边界）`,
    )
  }
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

test('T5.4 maxSkills 上限真的生效（多技能根上验证，否则是空门禁）', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    for (let i = 0; i < 4; i++) await writeSkill(dir, `s${i}`, skillDoc(`skill-${i}`, 'D'.repeat(50)))
    // 4 个额外 + 1 个包内 = 5；不设 maxSkills 时必须全部可见
    const all = makeFakeCtx()
    apply(all.ctx, { extraSkillDirs: [dir] })
    assert.equal((await (await all.factories[0]()).list()).length, 5, '默认上限不应截断 5 个技能')

    // 显式上限必须真的截断（把 maxSkills 忽略掉就会失败）
    const capped = makeFakeCtx()
    apply(capped.ctx, { extraSkillDirs: [dir], maxSkills: 2 })
    assert.equal((await (await capped.factories[0]()).list()).length, 2)
  } finally {
    await cleanup()
  }
})

test('T5.5 非法配置必须抛错，而不是静默兜底', () => {
  const { ctx } = makeFakeCtx()
  // maxSkills: 0 会静默清空目录（插件还挂着，技能全没了）——必须拒绝
  assert.throws(() => apply(ctx, { maxSkills: 0 }), /maxSkills/)
  assert.throws(() => apply(ctx, { maxSkills: -1 }), /maxSkills/)
  assert.throws(() => apply(ctx, { maxSkills: 2.5 }), /maxSkills/)
  assert.throws(() => apply(ctx, { maxSkills: 'many' }), /maxSkills/)
  assert.throws(() => apply(ctx, { extraSkillDirs: 'not-an-array' }), /extraSkillDirs/)
  assert.throws(() => apply(ctx, { extraSkillDirs: [123] }), /extraSkillDirs/)
  assert.throws(() => apply(ctx, { extraSkillDirs: [''] }), /extraSkillDirs/)
  assert.throws(() => apply(ctx, { enableSkills: 'yes' }), /enableSkills/)
  // 合法但别扭的输入不应抛错
  assert.doesNotThrow(() => apply(ctx, {}))
  assert.doesNotThrow(() => apply(ctx, null))
  assert.doesNotThrow(() => apply(ctx, { maxSkills: 1, extraSkillDirs: [] }))
})

test('T5.6 normalizeConfig 归一化与默认值', () => {
  assert.deepEqual(normalizeConfig(undefined), { enableSkills: true, extraSkillDirs: [], maxSkills: 100 })
  assert.deepEqual(normalizeConfig(null), { enableSkills: true, extraSkillDirs: [], maxSkills: 100 })
  assert.deepEqual(normalizeConfig({ enableSkills: false }), { enableSkills: false, extraSkillDirs: [], maxSkills: 100 })
  assert.equal(normalizeConfig({ maxSkills: 7 }).maxSkills, 7)
  // 相对路径必须被解析成绝对路径，否则取决于进程 cwd
  const resolved = normalizeConfig({ extraSkillDirs: ['./relative-skills'] }).extraSkillDirs[0]
  assert.ok(path.isAbsolute(resolved), `extraSkillDirs 必须绝对化: ${resolved}`)
  assert.ok(resolved.endsWith('relative-skills'))
})

test('T5.7 目录变化时注册表控制对象收到 invalidate()', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'first', skillDoc('first', 'F'.repeat(50)))
    let invalidations = 0
    const registryControl = { invalidate: () => { invalidations += 1 } }
    const { ctx, factories } = makeFakeCtx()
    apply(ctx, { extraSkillDirs: [dir] })
    // 注册表调用的是工厂，控制对象由工厂形参进来
    const provider = await factories[0](registryControl)
    await provider.list()
    await provider.list()
    assert.equal(invalidations, 0, '稳定目录不应触发失效')
    await writeSkill(dir, 'second', skillDoc('second', 'S'.repeat(50)))
    await provider.list()
    assert.ok(invalidations >= 1, '新技能出现时必须调用 control.invalidate()')
    const stable = invalidations
    await provider.list()
    assert.equal(invalidations, stable, '目录未再变化时不应重复失效')
  } finally {
    await cleanup()
  }
})

test('T5.8 被跳过的技能必须经 logger 留下诊断', async () => {
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'broken', '---\nname: broken\ndescription:\n---\n\nbody\n')
    const { ctx, factories, warnings } = makeFakeCtx()
    apply(ctx, { extraSkillDirs: [dir] })
    await (await factories[0]()).list()
    assert.ok(
      warnings.some((w) => w.includes('broken') && w.includes('description')),
      `缺少跳过诊断: ${JSON.stringify(warnings)}`,
    )
  } finally {
    await cleanup()
  }
})

test('T5.10 control 必须由注册工厂形参接收，且真的接到提供方上', async () => {
  // 回归：SkillRegistry 调用的是 `create(control)`——即**工厂**。若写成
  // `registerProvider(() => make(...))` 并在 apply 里闭包捕获第三个参数，
  // 拿到的是 Cordis 的 apply 控制对象而不是注册表的控制对象，
  // 于是目录变化永远无法让注册表失效（旧实现在这里静默失效）。
  const { dir, cleanup } = await makeTempSkillRoot()
  try {
    await writeSkill(dir, 'one', skillDoc('one', 'O'.repeat(50)))
    let registryInvalidations = 0
    const registryControl = { invalidate: () => { registryInvalidations += 1 } }
    const factories = []
    const ctx = {
      skills: { registerProvider: (create) => { factories.push(create); return () => {} } },
      logger: { warn: () => {} },
    }
    // apply 的第三个参数故意传一个会抛错的对象：它绝不能被当成注册表控制对象使用
    apply(ctx, { extraSkillDirs: [dir] }, { invalidate: () => { throw new Error('apply-level control used') } })

    const provider = await factories[0](registryControl)
    await provider.list()
    assert.equal(registryInvalidations, 0, '首次发现不应失效')
    await writeSkill(dir, 'two', skillDoc('two', 'T'.repeat(50)))
    await provider.list()
    assert.ok(registryInvalidations >= 1, 'control 没被接到提供方上：目录变化未能使注册表失效')
  } finally {
    await cleanup()
  }
})

test('T5.11 apply(ctx, config) 的 config 为 null/标量时使用默认值', () => {
  const { ctx, factories } = makeFakeCtx()
  assert.doesNotThrow(() => apply(ctx, null))
  assert.doesNotThrow(() => apply(ctx, undefined))
  assert.doesNotThrow(() => apply(ctx, 42))
  assert.doesNotThrow(() => apply(ctx, 'nope'))
  // 注意：默认参数只在「未传」时生效，显式 null 会走到这里，必须不抛
  assert.equal(factories.length, 4)
})

test('T5.12 同一进程内重复挂载必须降级而不是炸掉组合', () => {
  const warn = []
  let calls = 0
  const ctx = {
    skills: {
      registerProvider: () => {
        calls += 1
        if (calls > 1) throw new Error('a skill provider named "fsd-skills" is already registered')
        return () => {}
      },
    },
    logger: { warn: (m) => warn.push(String(m)) },
  }
  assert.doesNotThrow(() => apply(ctx, {}))
  assert.doesNotThrow(() => apply(ctx, {}), '第二次挂载不应让整个组合失败')
  assert.ok(warn.some((w) => w.includes('already registered')), `缺少降级警告: ${JSON.stringify(warn)}`)

  // 其它错误必须原样抛出，不能被这条降级路径吞掉
  const broken = { skills: { registerProvider: () => { throw new Error('something else entirely') } } }
  assert.throws(() => apply(broken, {}), /something else entirely/)
})

test('T5.9 apply 不产生进程级副作用（不注册工具、不改全局）', () => {
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
