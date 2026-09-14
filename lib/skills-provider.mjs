// SPDX-License-Identifier: MIT
// lib/skills-provider.mjs — 包内嵌入式技能提供方（惰性加载，只读 node:fs，零 DSH 依赖）。
//
// 对齐 @deepseek-ai/dsh-skill 的技能契约：
// - 提供方对象 `{ name, list(options), get(candidate, options) }`，工厂同步运行；
// - list() 返回完整发现的候选数组（或 `{candidates, complete:false}`）；
// - 候选与定义均为只读借用；get() 以候选对象身份（locator.path + 同一分配名）校验归属，
//   拒绝任何非本提供方产出的 candidate；
// - 技能名必须 kebab-case；frontmatter 的 name/description 缺失、为空或不是可识别的
//   单行标量（例如 YAML 块标量 `>-` / `|`）时跳过该文件，并给出诊断
//   —— 一个非法候选足以让整个技能目录加载失败，所以宁可不产出。
//
// 发现约定：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`；
// 显式排除 MEMORY.md / README.md（索引/说明文档，误注册会污染技能目录）。

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** 本提供方在技能注册表中的名称。 */
export const FSD_SKILLS_PROVIDER = 'fsd-skills'

/**
 * 技能 rank。DSH 在**同一层内**按 rank 升序取先者（见 dsh-skill compareIndexedCandidates），
 * 而官方文件系统提供方给出的次序是：
 *   项目 .dsh/skills = 100 < 项目 .agents/skills = 200 < 自定义根 = 300
 *   < 用户 ~/.dsh/skills = 400 < 用户 ~/.agents/skills = 500 < 打包提供方 = 600
 * 因此这里取官方的 BUNDLED_SKILL_RANK（600）：语义上本包就是「打包来的技能」，
 * 优先级最低，用户在自己技能根里放同名技能即可覆盖它。
 */
export const FSD_SKILLS_RANK = 600

/** DSH 合法技能名模式（kebab-case）。 */
export const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 能表示「单行标量」的描述上限，超过则视为异常 YAML。 */
const MAX_SCALAR_LENGTH = 4096

/**
 * 按码位比较两个字符串（不用 localeCompare：它依赖进程 locale，会让分配结果漂移）。
 * @param a - 左值。
 * @param b - 右值。
 * @returns 负数/0/正数。
 */
export function compareCodePoints(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 去掉 YAML 行尾注释。
 *
 * YAML 里注释必须以「空白 + #」开始（所以 `a#b` 里的 `#` 是值的一部分，URL 不会被切坏）。
 * 在「第一个空白 + #」处截断；找不到就原样返回。带引号的值不走这里（引号内容一律保留）。
 * @param value - 原始值。
 * @returns 去注释后的值。
 */
function stripYamlComment(value) {
  const idx = value.search(/\s#/)
  return idx === -1 ? value : value.slice(0, idx).trimEnd()
}

/**
 * 把 frontmatter 描述规整为「非空单行标量」。
 *
 * 只接受：同一行内闭合的裸标量 / 单引号 / 双引号（双引号可跨物理行，因为 `\r?\n`
 * 已先被归一化）。YAML 块标量（`>-`、`|`、`|-` …）、只剩引号、空值一律返回 undefined，
 * 让上层跳过该技能——把 `>-` 当成描述发进目录，比不出现更糟。
 * @param rawValue - 冒号后的原始文本（可能为空）。
 * @param followingLines - 头部后续行，用于续读跨行的双引号标量。
 * @returns 规整后的描述，或 undefined。
 */
export function normalizeDescription(rawValue, followingLines = []) {
  let value = String(rawValue ?? '').trim()
  if (value === '') return undefined
  // 块标量指示符：`|`、`>`、`|-`、`>-`、`|+` 等一律不接受。
  if (/^[|>][+-]?\d*$/.test(value)) return undefined

  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0]
    let text = value
    let used = 0
    while (!isClosedQuote(text, quote) && used < followingLines.length) {
      text += '\n' + followingLines[used]
      used += 1
    }
    if (!isClosedQuote(text, quote)) return undefined
    const unquoted = unquote(text).trim()
    return unquoted === '' ? undefined : unquoted
  }

  value = stripYamlComment(value)
  return value === '' ? undefined : value
}

/**
 * 判断一段以引号开头的文本是否已闭合。
 * @param text - 候选文本。
 * @param quote - `"` 或 `'`。
 * @returns 是否闭合。
 */
function isClosedQuote(text, quote) {
  for (let i = 1; i < text.length; i++) {
    if (quote === "'" && text[i] === "'" && text[i + 1] === "'") {
      i += 1
      continue
    }
    if (text[i] === quote) return true
  }
  return false
}

/**
 * 去掉最外层引号并还原 YAML 的转义（覆盖常见情形）。
 * @param text - 含引号的文本。
 * @returns 去引号后的内容。
 */
function unquote(text) {
  const quote = text[0]
  const body = text.slice(1, text.lastIndexOf(quote))
  if (quote === "'") return body.replace(/''/g, "'")
  return body
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/**
 * 极简 YAML frontmatter 解析：只处理 `---` 包裹的头部与逐行标量键值。
 *
 * 关键点：先把 CRLF 归一化为 LF。JS 的 `.` 不匹配 `\r`，若不做这一步，
 * 行尾带 `\r` 的 `description:` 永远匹配不上，会让一个完全合法的技能凭空消失。
 *
 * 返回 `meta`（原始标量文本，进 metadata）与 `raw`（已规整的单行标量，供取值），
 * 两棵树的键完全一致——不往 meta 里塞内部标记，避免污染暴露给模型的 metadata。
 * @param content - 文件全文。
 * @returns `{ meta, raw, body }`。
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string' || !content.startsWith('---')) {
    return { meta: {}, raw: {}, body: content ?? '' }
  }
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, raw: {}, body: normalized }
  const head = normalized.slice(3, end)
  const body = normalized.slice(end + 4).replace(/^[\r\n]+/, '')
  const lines = head.split('\n')
  const meta = {}
  const raw = {}
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!m) continue
    meta[m[1]] = m[2].trim()
    raw[m[1]] = normalizeDescription(m[2], lines.slice(i + 1))
  }
  return { meta, raw, body }
}

/**
 * 把任意技能名归一化为 kebab-case。
 * @param raw - 原始名称。
 * @param fallback - 归一化结果为空时使用。
 * @returns kebab-case 名称，或 fallback。
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
 * 判断一个名字能不能当成 DSH 技能名用。
 *
 * `kebabName` 对无法归一化的输入（例如纯中文「名字」、只剩连字符的「---」）会退回
 * fallback；如果放它们进目录，多个这样的技能会共享同一个名字、互相遮蔽，
 * 还会随目录遍历顺序被改名成 -2/-3。所以这里在归一化之后**再校验一次**，
 * 不合格的直接由调用方剔除并诊断。
 * @param raw - 原始名称。
 * @returns 合法 kebab 名，或 null。
 */
export function kebabNameOrNull(raw) {
  const candidate = kebabName(raw, '')
  return candidate !== '' && KEBAB_RE.test(candidate) ? candidate : null
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
 * 发现一个技能根目录下的全部技能文件（已排序，保证分配结果与文件系统顺序无关）。
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
  return files.sort(compareCodePoints)
}

/**
 * 读取并校验一个技能文件（SKILL.md 或扁平 .md）。
 * @param file - 绝对路径。
 * @param onSkip - 可选诊断回调 `(file, reason) => void`，每个文件每条原因最多报一次。
 * @returns `{ name, description, argumentHint?, content, path, meta }`，不合格返回 null。
 */
export async function readSkillFile(file, onSkip) {
  let content
  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    onSkip?.(file, `unreadable: ${error?.code ?? error?.message ?? 'unknown error'}`)
    return null
  }
  const { meta, raw, body } = parseFrontmatter(content)
  const name = String(meta.name ?? fallbackSkillName(file)).trim()
  if (name === '') {
    onSkip?.(file, 'no usable name')
    return null
  }
  if (!body.trim()) {
    onSkip?.(file, 'empty body')
    return null
  }
  const description = typeof raw.description === 'string' ? raw.description.trim() : ''
  if (description === '') {
    onSkip?.(
      file,
      meta.description === undefined || meta.description === ''
        ? 'no description'
        : `description is not a single-line scalar (got ${JSON.stringify(String(meta.description).slice(0, 24))})`,
    )
    return null
  }
  if (description.length > MAX_SCALAR_LENGTH) {
    onSkip?.(file, 'description implausibly long; refusing to publish it')
    return null
  }
  // 名字超长同样拒绝：DSH 用 name 做 key，异常输入不该进目录。
  if (name.length > 128) {
    onSkip?.(file, 'name implausibly long')
    return null
  }
  const argumentHint = typeof raw['argument-hint'] === 'string' ? raw['argument-hint'].trim() : ''
  return {
    name,
    description,
    ...(argumentHint ? { argumentHint } : {}),
    content: body,
    path: file,
    meta,
  }
}

/**
 * 构造包内嵌入式技能 SkillProvider。
 *
 * resourceBase 取「技能文件所在目录」，DSH 会据此向模型渲染
 * `Base directory for this skill: <path>` 并指示按该目录解析技能正文里的相对路径，
 * 因此技能内的 `references/xxx.md` 链接无需改写即可被模型正确定位。
 *
 * @param options - `{ roots, provider?, rank?, maxSkills?, invalidate?, onSkip? }`。
 *   `invalidate` 在目录内容发生变化时被调用（用于让注册表丢弃缓存）。
 * @returns `{ name, list, get }`；candidate.locator 为 `{ path }`。
 */
export function makeEmbeddedSkillsProvider({
  roots,
  provider = FSD_SKILLS_PROVIDER,
  rank = FSD_SKILLS_RANK,
  maxSkills = 100,
  invalidate,
  onSkip,
}) {
  // path → { candidate, assignedName, description }：跨 list() 调用保持候选对象身份稳定，
  // 否则每轮 list() 都产生新对象，get() 的身份校验将永远失败。
  const owned = new Map()
  const reported = new Set()
  /** 上一轮对外可见的目录快照（name+description 串），用于判断是否真的变了。 */
  let previousSnapshot

  /** 每个文件每条原因只诊断一次，避免每轮 list() 刷屏。 */
  const reportSkip = (file, reason) => {
    const key = `${file}\u0000${reason}`
    if (reported.has(key)) return
    reported.add(key)
    onSkip?.(file, reason)
  }

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
      // 多根目录去重后统一排序，保证分配与遍历顺序无关。
      const unique = [...new Set(files)].sort(compareCodePoints)

      const skills = []
      for (const file of unique) {
        signal?.throwIfAborted()
        const skill = await readSkillFile(file, reportSkip)
        if (skill) skills.push(skill)
      }

      // 在全集上统一分配 kebab 名：重名（含字面 `-2` 撞名）追加 -2/-3 后缀。
      // 归一化后拿不到合法 kebab 名的（例如纯中文名）在**分配前**剔除并诊断：
      // 让它们共享常量名会被 DSH 拒绝，或被改名成 skill-2/skill-3 而互相遮蔽。
      const usable = []
      for (const skill of skills) {
        const finalName = kebabNameOrNull(skill.name)
        if (finalName === null) {
          reportSkip(skill.path, `name "${skill.name}" cannot be normalized to kebab-case`)
          continue
        }
        usable.push({ ...skill, finalName })
      }
      const taken = new Set()
      const assigned = new Map()
      for (const skill of usable) {
        const base = skill.finalName
        let finalName = base
        let n = 2
        while (taken.has(finalName)) finalName = `${base}-${n++}`
        taken.add(finalName)
        assigned.set(skill.path, finalName)
      }

      const candidates = []
      const seen = new Set()
      for (const skill of usable) {
        signal?.throwIfAborted()
        const finalName = assigned.get(skill.path)
        const prev = owned.get(skill.path)
        if (prev && prev.assignedName === finalName && prev.description === skill.description) {
          candidates.push(prev.candidate)
        } else {
          // 名字或描述变了必须换新对象：注册表按对象身份缓存，沿用旧对象会让
          // 目录行在整个进程生命周期里保持陈旧。
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
          owned.set(skill.path, { candidate, assignedName: finalName, description: skill.description })
          candidates.push(candidate)
        }
        seen.add(skill.path)
      }
      // 已消失的技能文件不再保留身份，避免陈旧候选继续被 get() 接受。
      for (const filePath of [...owned.keys()]) {
        if (!seen.has(filePath)) owned.delete(filePath)
      }
      candidates.sort((a, b) => compareCodePoints(a.name, b.name))

      // 只在「对外可见的目录真的变了」时失效：首次发现（上一次快照为空）不需要，
      // 而新增/删除/改名/改描述都会让快照不同——这样既不漏报也不空转。
      const snapshot = candidates.map((c) => `${c.name}\u0000${c.description}`).join('\u0001')
      if (previousSnapshot !== undefined && previousSnapshot !== snapshot) invalidate?.()
      previousSnapshot = snapshot

      const limited = candidates.slice(0, maxSkills)
      if (limited.length !== candidates.length) {
        for (const name of candidates.slice(maxSkills).map((c) => c.name)) {
          reportSkip(name, 'dropped by maxSkills')
        }
      }
      return limited
    },

    async get(candidate, options = {}) {
      options?.signal?.throwIfAborted()
      const prev = candidate?.locator?.path ? owned.get(candidate.locator.path) : undefined
      // 身份校验：只接受本提供方 list() 产出的同一对象。
      if (!prev || prev.candidate !== candidate) return undefined
      const skill = await readSkillFile(candidate.locator.path, reportSkip)
      if (!skill) return undefined
      // 名字与描述一律以**刚解析出来的文件**为准，不回显 candidate 上的字段：
      // candidate 是可变对象，回显等于让调用方改写候选就能改写技能定义。
      const finalName = kebabNameOrNull(skill.name)
      if (finalName === null || finalName !== prev.assignedName) {
        // 文件已被改名/改坏：作废这条缓存，让下一次 list() 重新分配。
        owned.delete(candidate.locator.path)
        invalidate?.()
        return undefined
      }
      const description = skill.description
      if (description !== prev.description) {
        owned.delete(candidate.locator.path)
        invalidate?.()
        return undefined
      }
      return {
        name: finalName,
        description,
        ...(skill.argumentHint ? { whenToUse: `argument hint: ${skill.argumentHint}` } : {}),
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
