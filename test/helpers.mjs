// SPDX-License-Identifier: MIT
// test/helpers.mjs — 共享测试夹具（无第三方依赖，只用 node 内置）。
//
// 关键点：所有测试都从「仓库真实文件」出发，而不是从内存里的假数据出发，
// 这样门禁才能捕捉到「文件被删/被改写」这类真实回归。

import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根目录。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 技能根目录 skills/。 */
export const SKILLS_DIR = path.join(ROOT, 'skills')

/** 本包唯一技能目录。 */
export const SKILL_DIR = path.join(SKILLS_DIR, 'fight-scene-director')

/** 技能文件路径。 */
export const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md')

/** references 目录。 */
export const REFS_DIR = path.join(SKILL_DIR, 'references')

/** 上游引用文件哈希夹具。 */
export const HASHES_FIXTURE = path.join(ROOT, 'test', 'fixtures', 'upstream-hashes.json')

/**
 * 读取一个 UTF-8 文件。
 * @param file - 绝对路径。
 * @returns 文件内容。
 */
export async function readText(file) {
  return readFile(file, 'utf8')
}

/**
 * 计算文件 sha256。
 * @param file - 绝对路径。
 * @returns 十六进制摘要。
 */
export async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

/**
 * 把本包的技能目录复制到一个临时根目录，用于隔离测试（避免污染仓库）。
 * @returns `{ dir, cleanup }`。
 */
export async function makeTempSkillRoot() {
  const dir = await mkdtemp(path.join(tmpdir(), 'fsd-test-'))
  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * 在临时目录里写一个技能文件。
 * @param root - 技能根目录。
 * @param name - 子目录名（`<name>/SKILL.md`）。
 * @param content - 文件全文。
 * @returns 写入的绝对路径。
 */
export async function writeSkill(root, name, content) {
  const dir = path.join(root, name)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'SKILL.md')
  await writeFile(file, content, 'utf8')
  return file
}

/**
 * 造一个最小合法技能正文。
 * @param name - frontmatter name。
 * @param description - frontmatter description。
 * @returns 文件全文。
 */
export function skillDoc(name, description) {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nbody\n`
}
