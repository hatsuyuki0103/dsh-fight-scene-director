// SPDX-License-Identifier: MIT
// lib/skills-provider.mjs — 包内嵌入式技能提供方（惰性加载，只读 node:fs，零 DSH 依赖）。
//
// 对齐 @deepseek-ai/dsh-skill 的技能契约：
// - 提供方对象 `{ name, list(options), get(candidate, options) }`，工厂同步运行；
// - list() 返回完整发现的候选数组（或 `{ candidates, complete:false }`）；
// - 候选与定义均为只读借用；get() 以候选对象身份（locator.path + 同一分配名）校验归属，
//   拒绝任何非本提供方产出的 candidate；
// - 技能名必须 kebab-case；frontmatter 的 name/description 缺失或为空则跳过该文件
//   （与官方 dsh-skill-filesystem 的「warn + ignore」一致），绝不产出非法候选
//   —— 一个非法候选足以让整个技能目录加载失败。
//
// 发现约定：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`；
// 显式排除 MEMORY.md / README.md（索引/说明文档，误注册会污染技能目录）。

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** 本提供方在技能注册表中的名称。 */
export const FSD_SKILLS_PROVIDER = 'fsd-skills'

/**
 * 全局技能 rank：低于用户根目录（400/500）与项目级（280+），高于运行时注册（250）。
 * 用户放置同名技能即可覆盖本包。
 */
export const FSD_SKILLS_RANK = 275

/** DSH 合法技能名模式（kebab-case）。 */
export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 极简 YAML frontmatter 解析：只处理 `---` 包裹的头部与逐行标量键值（支持单/双引号）。
 * 无法识别时按「无 meta、正文全文」处理，绝不抛错。
 * @param content - 文件全文。
 * @returns `{ meta, body }`。
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string' || !content.startsWith('---')) return { meta: {}, body: content ?? '' }
  const end = content.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: content }
  const head = content.slice(3, end)
  const body = content.slice(end + 4).replace(/^[\r\n]+/, '')
  const meta = {}
  for (const raw of head.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw)
    if (!m) continue
    let value = m[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[m[1]] = value
  }
  return { meta, body }
}

/**
 * 把任意技能名归一化为 kebab-case。
 * @param raw - 原始名称。
 * @param fallback - 归一化结果为空时使用。
 * @returns kebab-case 名称。
 */
export function kebabName(raw, fallback = 'skill') {
  const slug = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return slug.length > 0 ? slug : fallback
}

/**
 * 发现一个技能根目录下的全部技能文件。
 * @param root - 技能根目录。
 * @returns 技能文件绝对路径数组；目录缺失或不可读时返回空数组。
 */
export async function discoverSkillFiles(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const NON_SKILL_FILES = /^(memory|readme)\.md$/i
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(path.join(root, entry.name, 'SKILL.md'))
    } else if (entry.isFile() && entry.name.endsWith('.md') && !NON_SKILL_FILES.test(entry.name)) {
      files.push(path.join(root, entry.name))
    }
  }
  return files
}

/**
 * 推导技能文件未声明 name 时的回退名。
 *
 * `<root>/<name>/SKILL.md` 回退到**目录名** `<name>`；扁平布局 `<root>/<name>.md`
 * 回退到文件名。直接取 basename 会让每个 SKILL.md 都退化成 "skill"，因此目录布局
 * 必须先认 SKILL.md 这个固定文件名。
 * @param file - 技能文件绝对路径。
 * @returns 回退名（未做 kebab 归一化）。
 */
export function fallbackSkillName(file) {
  const base = path.basename(file)
  const dir = path.basename(path.dirname(file))
  return /^skill\.md$/i.test(base) ? dir : base.replace(/\.md$/i, '')
}

/**
 * 读取并校验一个技能文件（SKILL.md 或扁平 .md）。
 * @param file - 绝对路径。
 * @returns `{ name, description, argumentHint?, content, path, meta }`，不合格返回 null。
 */
export async function readSkillFile(file) {
  try {
    const content = await readFile(file, 'utf8')
    const { meta, body } = parseFrontmatter(content)
    if (!body.trim()) return null
    const name = String(meta.name ?? fallbackSkillName(file)).trim()
    const description = String(meta.description ?? '').trim()
    if (!name || !description) return null
    const argumentHint = typeof meta['argument-hint'] === 'string' ? meta['argument-hint'].trim() : undefined
    return {
      name,
      description,
      ...(argumentHint ? { argumentHint } : {}),
      content: body,
      path: file,
      meta,
    }
  } catch {
    return null
  }
}

/**
 * 构造包内嵌入式技能 SkillProvider。
 *
 * resourceBase 取「技能文件所在目录」，DSH 会据此向模型渲染
 * `Base directory for this skill: <path>` 并指示按该目录解析技能正文里的相对路径，
 * 因此技能内的 `references/xxx.md` 链接无需改写即可被模型正确定位。
 *
 * @param options - `{ roots: string[], provider?: string, rank?: number, maxSkills?: number }`。
 * @returns `{ name, list, get }`；candidate.locator 为 `{ path }`。
 */
export function makeEmbeddedSkillsProvider({
  roots,
  provider = FSD_SKILLS_PROVIDER,
  rank = FSD_SKILLS_RANK,
  maxSkills = 100,
}) {
  // path → { candidate, assignedName }：跨 list() 调用保持候选对象身份稳定，
  // 否则每轮 list() 都产生新对象，get() 的身份校验将永远失败。
  const owned = new Map()

  return {
    name: provider,

    async list(options = {}) {
      const signal = options?.signal
      signal?.throwIfAborted()

      const files = []
      for (const root of roots) {
        signal?.throwIfAborted()
        for (const file of await discoverSkillFiles(root)) files.push(file)
      }

      const skills = []
      for (const file of files) {
        signal?.throwIfAborted()
        const skill = await readSkillFile(file)
        if (skill) skills.push(skill)
      }

      // 在全集上统一分配 kebab 名：重名（含字面 `-2` 撞名）追加 -2/-3 后缀。
      const taken = new Set()
      const assigned = new Map()
      for (const skill of skills) {
        const base = kebabName(skill.name)
        let finalName = base
        let n = 2
        while (taken.has(finalName)) finalName = `${base}-${n++}`
        taken.add(finalName)
        assigned.set(skill.path, finalName)
      }

      const candidates = []
      const seen = new Set()
      for (const skill of skills) {
        signal?.throwIfAborted()
        const finalName = assigned.get(skill.path)
        const prev = owned.get(skill.path)
        if (prev && prev.assignedName === finalName) {
          candidates.push(prev.candidate)
        } else {
          const candidate = {
            name: finalName,
            description: skill.description,
            ...(skill.argumentHint ? { whenToUse: `argument hint: ${skill.argumentHint}` } : {}),
            invocation: { modelInvocable: true, userInvocable: true },
            provider,
            source: 'fsd',
            resourceBase: { kind: 'directory', path: path.dirname(skill.path) },
            rank,
            locator: { path: skill.path },
            path: skill.path,
            metadata: skill.meta,
          }
          owned.set(skill.path, { candidate, assignedName: finalName })
          candidates.push(candidate)
        }
        seen.add(skill.path)
      }
      // 已消失的技能文件不再保留身份，避免陈旧候选继续被 get() 接受。
      for (const filePath of [...owned.keys()]) {
        if (!seen.has(filePath)) owned.delete(filePath)
      }
      return candidates.sort((a, b) => a.name.localeCompare(b.name)).slice(0, maxSkills)
    },

    async get(candidate, options = {}) {
      options?.signal?.throwIfAborted()
      const prev = candidate?.locator?.path ? owned.get(candidate.locator.path) : undefined
      // 身份校验：只接受本提供方 list() 产出的同一对象。
      if (!prev || prev.candidate !== candidate) return undefined
      const skill = await readSkillFile(candidate.locator.path)
      if (!skill) return undefined
      return {
        name: candidate.name,
        description: candidate.description,
        ...(candidate.whenToUse ? { whenToUse: candidate.whenToUse } : {}),
        invocation: { modelInvocable: true, userInvocable: true },
        provider,
        source: candidate.source,
        resourceBase: candidate.resourceBase,
        content: skill.content,
        path: skill.path,
        metadata: skill.meta,
      }
    },
  }
}
