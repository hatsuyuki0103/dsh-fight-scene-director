// SPDX-License-Identifier: MIT
// index.mjs — dsh-fight-scene-director host 插件入口。
//
// 把包内 skills/fight-scene-director/SKILL.md 注册为 DSH 技能提供方（惰性加载）。
// 技能目录只暴露 name/description 摘要；正文与 references/*.md 在 skill 工具加载
// 或模型按需读取时才进入上下文。
//
// 只消费公开服务：skills（硬依赖）。全部生命周期贡献（registerProvider）随 Fiber
// 自动拆除，无进程级副作用：不写盘、不改全局、不注册工具。

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeEmbeddedSkillsProvider } from './lib/skills-provider.mjs'

export const name = 'fsd-skills'

export const inject = ['skills']

/**
 * 挂载插件：注册嵌入式技能提供方。
 * @param ctx - Cordis 上下文。
 * @param config - cordis.yml 行内配置：
 *   - enableSkills: boolean（默认 true）设为 false 可整体关闭本包技能；
 *   - extraSkillDirs: string[]（额外技能根目录，默认空，用于把本 provider 指向别处）；
 *   - maxSkills: number（目录条目上限，默认 100）。
 */
export function apply(ctx, config = {}) {
  if (config.enableSkills === false) return
  const roots = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills'),
    ...(Array.isArray(config.extraSkillDirs) ? config.extraSkillDirs : []),
  ]
  ctx.skills.registerProvider(() => makeEmbeddedSkillsProvider({
    roots,
    provider: 'fsd-skills',
    maxSkills: Number.isInteger(config.maxSkills) ? config.maxSkills : 100,
  }))
}
