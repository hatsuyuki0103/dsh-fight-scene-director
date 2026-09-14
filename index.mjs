// SPDX-License-Identifier: MIT
// index.mjs — dsh-fight-scene-director host 插件入口。
//
// 把包内 skills/fight-scene-director/SKILL.md 注册为 DSH 技能提供方（惰性加载）。
// 技能目录只暴露 name/description 摘要；正文与 references/*.md 在 skill 工具加载
// 或模型按需读取时才进入上下文。
//
// 只消费公开服务：skills（硬依赖）；ctx.logger 为可选诊断通道。
// 全部生命周期贡献（registerProvider）随 Fiber 自动拆除，无进程级副作用：
// 不写盘、不改全局、不注册工具。

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeEmbeddedSkillsProvider } from './lib/skills-provider.mjs'

export const name = 'fsd-skills'

export const inject = ['skills']

/** 默认技能目录上限。 */
const DEFAULT_MAX_SKILLS = 100

/**
 * 校验并归一化行内配置。非法值**抛错而不静默兜底**：这个插件的唯一职责就是让技能
 * 出现在目录里，一个被悄悄忽略的配置会让用户以为技能坏了却查不出原因。
 * @param config - cordis.yml 行内配置（可能为 null）。
 * @returns `{ enableSkills, extraSkillDirs, maxSkills }`。
 */
export function normalizeConfig(config) {
  const input = config === null || typeof config !== 'object' ? {} : config
  if (input.enableSkills !== undefined && typeof input.enableSkills !== 'boolean') {
    throw new TypeError('dsh-fight-scene-director: config.enableSkills must be a boolean')
  }
  if (input.extraSkillDirs !== undefined && !Array.isArray(input.extraSkillDirs)) {
    throw new TypeError('dsh-fight-scene-director: config.extraSkillDirs must be an array of directory paths')
  }
  const extraSkillDirs = (input.extraSkillDirs ?? []).map((entry) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new TypeError('dsh-fight-scene-director: every config.extraSkillDirs entry must be a non-empty string')
    }
    return path.resolve(entry)
  })
  let maxSkills = DEFAULT_MAX_SKILLS
  if (input.maxSkills !== undefined) {
    // 0 或负数会静默清空/截断目录（插件仍挂载、技能却少了），这里直接拒绝。
    if (!Number.isInteger(input.maxSkills) || input.maxSkills < 1) {
      throw new TypeError('dsh-fight-scene-director: config.maxSkills must be an integer >= 1')
    }
    maxSkills = input.maxSkills
  }
  return { enableSkills: input.enableSkills !== false, extraSkillDirs, maxSkills }
}

/**
 * 从 SkillRegistry 的注册错误里识别「同名提供方已注册」。
 * 这个包在同一进程里被挂载两次时会撞名，属于可降级情形；
 * 其它错误（配置、编程错误）必须原样抛出，不能被吞掉。
 * @param error - 捕获到的错误。
 * @returns 是否为重复注册。
 */
function isDuplicateProviderError(error) {
  return /already registered|already exists|duplicate/i.test(String(error?.message ?? ''))
}

/**
 * 挂载插件：注册嵌入式技能提供方。
 * @param ctx - Cordis 上下文。
 * @param config - cordis.yml 行内配置：
 *   - enableSkills: boolean（默认 true）设为 false 可整体关闭本包技能；
 *   - extraSkillDirs: string[]（额外技能根目录，默认空，用于把本 provider 指向别处）；
 *   - maxSkills: number（目录条目上限，必须 >= 1，默认 100）。
 * @param control - SkillRegistry 交给注册工厂的控制对象（含 `invalidate()`）。
 *   注意：注册表调用的是**工厂**，所以必须由工厂形参接收 control，
 *   不能在 apply 里闭包捕获——闭包到的是 Cordis 自己的 apply 控制对象，不是这个。
 */
export function apply(ctx, config = {}, control) {
  const { enableSkills, extraSkillDirs, maxSkills } = normalizeConfig(config)
  if (!enableSkills) return
  const roots = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills'),
    ...extraSkillDirs,
  ]
  const logger = ctx?.logger
  const onSkip = typeof logger?.warn === 'function'
    ? (file, reason) => logger.warn(`dsh-fight-scene-director: skipped ${file} (${reason})`)
    : undefined
  try {
    ctx.skills.registerProvider((providerControl) => makeEmbeddedSkillsProvider({
      roots,
      provider: 'fsd-skills',
      maxSkills,
      invalidate: typeof providerControl?.invalidate === 'function' ? () => providerControl.invalidate() : undefined,
      // 一个「本该出现却没出现」的技能，必须留下可查的痕迹。
      onSkip,
    }))
  } catch (error) {
    if (!isDuplicateProviderError(error)) throw error
    logger?.warn?.(`dsh-fight-scene-director: skill provider already registered; skipping this mount (${error.message})`)
  }
}
