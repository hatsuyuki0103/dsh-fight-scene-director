// SPDX-License-Identifier: MIT
// lib/skills-provider.mjs — 包内嵌入式技能提供方（惰性加载，只读 node:fs，零 DSH 依赖）。
//
// 对齐 @deepseek-ai/dsh-skill 的技能契约：
// - 提供方对象 `{ name, list(options), get(candidate, options) }`，工厂同步运行，
//   控制对象由**工厂形参**接收（注册表调用的是 create(control)，不是 apply）；
// - list() 返回完整发现的候选数组（或 `{candidates, complete:false}`）；
// - 候选与定义均为只读借用；get() 以候选对象身份（locator.path + 同一分配名）校验归属，
//   拒绝任何非本提供方产出的 candidate；
// - 技能名必须 kebab-case；frontmatter 的 name/description 缺失、为空或不是可识别的
//   单行标量（例如 YAML 块标量 `>-` / `|`）时跳过该文件，并给出诊断
//   —— 一个非法候选足以让整个技能目录加载失败，所以宁可不产出。
//
// frontmatter 语义与官方 dsh-skill-filesystem 保持一致：
//   whenToUse               可选，字符串
//   disable-model-invocation 布尔（true/1/"yes"/"on" …）
//   user-invocable           布尔
//   旧的驼峰键（disableModelInvocation / modelInvocable / userInvocable）会被显式拒绝，
//   与官方 provider 的 rejectLegacyInvocationKey 行为一致。
//
// 发现约定：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`；
// 目录型只认**确实含 SKILL.md 的子目录**（否则 assets/、node_modules/ 之类会刷屏），
// 并显式排除 MEMORY.md / README.md。

import { readdir, readFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { access } from 'node:fs/promises'
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

/** 官方已弃用的驼峰 invocation 键 → 应改用的规范键。 */
const LEGACY_INVOCATION_KEYS = {
  disableModelInvocation: 'disable-model-invocation',
  modelInvocable: 'disable-model-invocation',
  userInvocable: 'user-invocable',
}

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
 * 在「第一个空白 + #」处截断；找不到就原样返回。
 * @param value - 原始值。
 * @returns 去注释后的值。
 */
export function stripYamlComment(value) {
  const idx = String(value ?? '').search(/\s#/)
  return idx === -1 ? String(value ?? '') : String(value ?? '').slice(0, idx).trimEnd()
}

/**
 * 判断一个非引号的裸标量能否安全地当作描述。
 *
 * 这些规则是用**真实 YAML 解析器**（harness 自带的 `yaml`）当 oracle 逐条比对出来的，
 * 不是猜的：真实解析器报错、或解析结果为 null（作者其实没写内容）的形态一律拒绝，
 * 让文件被跳过并诊断；真实解析器认可的一律放行。见 T2.28 的对照表。
 * @param value - 已去注释、已 trim 的裸标量。
 * @returns 是否可作为描述使用。
 */
function isUsablePlainScalar(value) {
  if (value === '') return false
  // 块标量头（`|`/`>` 开头）——包括畸形拼写
  if (value.startsWith('|') || value.startsWith('>')) return false
  // 注释行：整个值是注释，YAML 得到 null
  if (value.startsWith('#')) return false
  // 保留指示符开头：YAML 一律报错（`-`/`?` 在同一行也是）
  if (/^[-?*@`]/.test(value)) return false
  // 锚点/别名指示符后没有内容 → null；只有指示符 + 标识符、后面没有真正的值，
  // 同样解析不出描述：`&anchor` 得到 null，`!tag` 得到空串。两者都拒绝。
  if (/^[&!]\s*$/.test(value)) return false
  if (/^[&!][^\s]*(\s+[&!][^\s]*)*$/.test(value)) return false
  // 「冒号 + 空白」（或以冒号结尾）会被 YAML 当成嵌套映射，整个 frontmatter 解析失败。
  // 这是实测的：官方上下文 `name: probe\ndescription: text with: colon` 在 yaml.parse
  // 下抛 "Nested mappings are not allowed in compact mappings"。
  if (/:\s/.test(value) || value.endsWith(':')) return false
  return true
}

/**
 * 把 frontmatter 描述规整为「非空单行标量」。
 *
 * 顺序很关键：**先剥注释再判断**。否则 `description: >- # note` 会因为尾部注释
 * 不匹配块标量模式而被当成普通文本，把字面量 `>-` 发布到技能目录里。
 *
 * 只接受：同一行内闭合的裸标量 / 单引号 / 双引号（双引号可跨物理行，因为换行已先归一化）。
 * 其余一律返回 undefined，由上层跳过该文件并诊断。
 * @param rawValue - 冒号后的原始文本（可能为空）。
 * @param followingLines - 头部后续行，用于续读跨行的双引号标量。
 * @returns 规整后的描述，或 undefined。
 */
export function normalizeDescription(rawValue, followingLines = []) {
  const value = String(rawValue ?? '').trim()
  if (value === '') return undefined
  // 引号内的 # 是内容，不能按注释处理；先处理引号分支。
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
  const stripped = stripYamlComment(value).trim()
  return isUsablePlainScalar(stripped) ? stripped : undefined
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
 *
 * 闭合引号必须用「起始引号之后第一个能闭合它的引号」，不能用 lastIndexOf：
 * 行尾注释里若含引号（`"a" # "b"`），lastIndexOf 会挑到注释里的那个，
 * 把 `a" # "b` 当成内容。
 * @param text - 含引号的文本。
 * @returns 去引号后的内容。
 */
function unquote(text) {
  const quote = text[0]
  let end = -1
  for (let i = 1; i < text.length; i++) {
    if (quote === "'" && text[i] === "'" && text[i + 1] === "'") {
      i += 1
      continue
    }
    if (text[i] === quote) {
      end = i
      break
    }
  }
  if (end === -1) return text.slice(1)
  const body = text.slice(1, end)
  if (quote === "'") return body.replace(/''/g, "'")
  return body
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/**
 * 解析 frontmatter 布尔值，语义与官方 frontmatterBoolean 一致。
 *
 * 无效值**抛错而不是静默放行**：官方 provider 对 `disable-model-invocation: maybe`
 * 会拒绝整个文件，而这里如果返回 undefined 就会被当成「没写」，于是把使用者本意
 * 是「别让模型自动调用」的技能强行推销出去——错在危险的方向上。
 * @param value - 原始标量文本。
 * @param key - 字段名，仅用于报错信息。
 * @returns true / false / undefined（未提供）。
 * @throws TypeError 值不是可识别的布尔字面量。
 */
export function frontmatterBoolean(value, key = 'value') {
  if (value === undefined) return undefined
  const text = String(value).trim()
  if (text === '') return undefined
  if (text === '1') return true
  if (text === '0') return false
  switch (text.toLowerCase()) {
    case 'true':
    case 'yes':
    case 'on':
      return true
    case 'false':
    case 'no':
    case 'off':
      return false
    default:
      throw new TypeError(`frontmatter field "${key}" must be a boolean (got ${JSON.stringify(text)})`)
  }
}

/**
 * 解析 invocation 策略，语义与官方 parseInvocationPolicy 一致：
 * `disable-model-invocation: true` → 模型不可自动调用；`user-invocable: false` → 用户不可调用。
 * 旧的驼峰键会抛错（与官方一致），而不是被静默忽略。
 * @param raw - `{ key: normalizedScalar }` 映射。
 * @returns `{ modelInvocable, userInvocable }`。
 */
export function parseInvocationPolicy(raw) {
  for (const [legacy, canonical] of Object.entries(LEGACY_INVOCATION_KEYS)) {
    if (Object.hasOwn(raw, legacy)) {
      throw new TypeError(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`)
    }
  }
  const disableModelInvocation = frontmatterBoolean(raw['disable-model-invocation'], 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(raw['user-invocable'], 'user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

/**
 * 极简 YAML frontmatter 解析：只处理 `---` 包裹的头部与逐行标量键值。
 *
 * 关键点：先把 CRLF 归一化为 LF。JS 的 `.` 不匹配 `\r`，若不做这一步，
 * 行尾带 `\r` 的 `description:` 永远匹配不上，会让一个完全合法的技能凭空消失。
 *
 * 返回 `meta`（去掉行尾注释的标量文本，进 metadata）与 `raw`（已规整的单行标量，供取值），
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
    // 键本身也可能是引号包裹的（`"userInvocable": false`），冒号前也允许空白
    // （`disable-model-invocation : true` 是合法 YAML）。两处都不能漏：
    // 漏掉任一种写法都会形成静默绕过——真实 YAML 会读出这个键，官方 provider 会
    // 依据它拒绝文件，而我们看不见它，于是把作者明确声明「禁止模型自动调用」的
    // 技能照常推销出去。
    const m = /^("([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const key = m[2] ?? m[3] ?? m[4]
    const valueText = m[5] ?? ''
    // meta 里放「去注释后的标量」，这样 `name: my-skill # note` 不会变成
    // 名字的一部分（`my-skill-comment`）。
    meta[key] = stripYamlComment(valueText).trim()
    raw[key] = normalizeDescription(valueText, lines.slice(i + 1))
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
 * 判断路径是否存在且可读。
 * @param target - 绝对路径。
 * @returns 是否存在。
 */
async function pathExists(target) {
  try {
    await access(target, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 发现一个技能根目录下的全部技能文件（已排序，保证分配结果与文件系统顺序无关）。
 *
 * 目录型只收录**确实含 SKILL.md 的子目录**：否则 assets/、node_modules/、.git/ 之类
 * 每个子目录都会产出一条「跳过」诊断，把真正有用的信息淹掉。
 * @param root - 技能根目录。
 * @param onSkip - 可选诊断回调 `(label, reason) => void`。
 * @returns 技能文件绝对路径数组；目录缺失或不可读时返回空数组并给出诊断。
 */
export async function discoverSkillFiles(root, onSkip) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    // 根目录不存在 / 不可读是配置错误，必须留下痕迹，否则「技能没出现」无从查起。
    onSkip?.(root, `skill root is not readable: ${error?.code ?? error?.message ?? 'unknown error'}`)
    return []
  }
  const NON_SKILL_FILES = /^(memory|readme)\.md$/i
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = path.join(root, entry.name, 'SKILL.md')
      if (await pathExists(candidate)) files.push(candidate)
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
 * @returns `{ name, description, whenToUse?, invocation, content, path, meta }`，不合格返回 null。
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
  let invocation
  try {
    invocation = parseInvocationPolicy(raw)
  } catch (error) {
    onSkip?.(file, String(error?.message ?? error))
    return null
  }
  const whenToUse = typeof raw.whenToUse === 'string' && raw.whenToUse.trim() !== '' ? raw.whenToUse.trim() : undefined
  return {
    name,
    description,
    ...(whenToUse ? { whenToUse } : {}),
    invocation,
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
 * 关于失效：注册表会缓存目录，**只有**收到 invalidate 之后才会重新调用 list()。
 * 因此当已发布的技能在磁盘上被改名、改描述或删除时，由 get() 负责发现并调用
 * invalidate()，让注册表在下一轮重新收集；外部凭空新增的技能文件在本进程内
 * 不会自动出现（需要重启 harness），这一点在 README 与 CHANGELOG 里写明。
 *
 * @param options - `{ roots, provider?, rank?, maxSkills?, invalidate?, onSkip? }`。
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
  const owned = new Map()
  const reported = new Set()
  let previousSnapshot

  /** 每个目标每条原因只诊断一次，避免每轮 list() 刷屏。 */
  const reportSkip = (target, reason) => {
    const key = `${target}\u0000${reason}`
    if (reported.has(key)) return
    reported.add(key)
    onSkip?.(target, reason)
  }

  return {
    name: provider,

    async list(options = {}) {
      const signal = options?.signal
      signal?.throwIfAborted()

      const files = []
      for (const root of roots) {
        signal?.throwIfAborted()
        for (const file of await discoverSkillFiles(root, reportSkip)) files.push(file)
      }
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
        const unchanged =
          prev &&
          prev.assignedName === finalName &&
          // baseName 也必须比：否则「把带后缀的文件重命名成正好等于那个后缀名」
          // 这种改名会让记录留着陈旧的 baseName，下一次 get() 会白失败一次。
          prev.baseName === skill.finalName &&
          prev.description === skill.description &&
          prev.whenToUse === skill.whenToUse &&
          prev.modelInvocable === skill.invocation.modelInvocable &&
          prev.userInvocable === skill.invocation.userInvocable
        if (unchanged) {
          candidates.push(prev.candidate)
        } else {
          // 任何对外可见字段变了都必须换新对象：注册表按对象身份缓存，
          // 沿用旧对象会让目录行在整个进程生命周期里保持陈旧。
          const candidate = {
            name: finalName,
            description: skill.description,
            ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
            invocation: { ...skill.invocation },
            provider,
            source: 'fsd',
            resourceBase: { kind: 'directory', path: path.dirname(skill.path) },
            rank,
            locator: { path: skill.path },
            path: skill.path,
            metadata: skill.meta,
          }
          owned.set(skill.path, {
            candidate,
            // assignedName 是**对外**的名字（可能带 -2/-3 后缀）；baseName 是这个名字
            // 归一化前的来源。get() 必须拿文件里的名字与 baseName 比，不能与
            // assignedName 比——后缀只存在于分配结果里，文件里永远没有它。
            assignedName: finalName,
            baseName: skill.finalName,
            description: skill.description,
            whenToUse: skill.whenToUse,
            modelInvocable: skill.invocation.modelInvocable,
            userInvocable: skill.invocation.userInvocable,
          })
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
      const snapshot = candidates
        .map((c) => `${c.name}\u0000${c.description}\u0000${c.whenToUse ?? ''}\u0000${c.invocation.modelInvocable}\u0000${c.invocation.userInvocable}`)
        .join('\u0001')
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
      if (!skill) {
        // 文件被删/被改坏：立刻作废这条缓存并让注册表重新收集，
        // 否则目录会永远挂着一个已经加载不出来的技能。
        owned.delete(candidate.locator.path)
        invalidate?.()
        return undefined
      }
      // 名字、描述、调用策略一律以**刚解析出来的文件**为准，不回显 candidate 上的字段：
      // candidate 是可变对象，回显等于让调用方改写候选就能改写技能定义。
      const baseName = kebabNameOrNull(skill.name)
      // 与 baseName 比，而不是与 assignedName 比：分配后缀（-2/-3）只存在于分配结果里，
      // 拿它去比文件里的名字永远不相等，会让撞名后的技能被永久判为「漂移」而无法加载。
      const drifted =
        baseName === null ||
        baseName !== prev.baseName ||
        skill.description !== prev.description ||
        skill.whenToUse !== prev.whenToUse ||
        skill.invocation.modelInvocable !== prev.modelInvocable ||
        skill.invocation.userInvocable !== prev.userInvocable
      if (drifted) {
        owned.delete(candidate.locator.path)
        invalidate?.()
        return undefined
      }
      return {
        // 注册表要求 definition.name === candidate.name（dsh-skill 会校验），
        // 所以这里返回**对外**的 assignedName，也就是调用方拿到的那一个。
        name: prev.assignedName,
        description: skill.description,
        ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
        invocation: { ...skill.invocation },
        provider,
        source: 'fsd',
        // 同样重新推导，不回显 candidate.resourceBase：那个对象是可变的，
        // 改写它就能把模型引到任意目录去读「技能资源」。
        resourceBase: { kind: 'directory', path: path.dirname(skill.path) },
        content: skill.content,
        path: skill.path,
        metadata: skill.meta,
      }
    },
  }
}
