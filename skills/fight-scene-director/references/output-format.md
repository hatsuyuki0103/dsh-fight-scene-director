# Formal Output Format

Read this file whenever producing or revising the formal video prompt.

## Deliver Two Sections

The upper section is the copyable generation prompt. The lower section is a rhythm-adjustment panel for the user and must be clearly marked as not part of the prompt.

Before the upper section, a short acknowledgement from `interaction-routing.md` is allowed. Do not add character analysis, trajectory analysis, tactical reports, internal reasoning, counts, or audits.

## Compact Formatting

- In trajectory mode, write the required control-source opener first, then leave one blank line before `【视觉风格】`. Omit it in direct-design mode.
- Leave one blank line between major functional sections.
- `【视觉风格】` may contain a few natural paragraphs for rendering, combat logic, and effect rules. Combine sentences serving the same function.
- `【禁止项】` may use numbered lines. Keep each constraint and its consequence together.
- Write `【初始空间关系】` compactly as one frame-zero state.
- Format every shot as a two-line block: metadata on line one; one continuous natural paragraph on line two. Leave one blank line between shots.
- Do not use backslash line breaks, HTML spaces, meaningless blank lines, sentence-per-paragraph fragmentation, or one giant undifferentiated wall of text.
- A complete revision must preserve this format.

## Upper Section Template

Write the copyable generation prompt in Chinese regardless of the conversation language. Use this contract:

```markdown
[轨迹图模式专用：使用 trajectory-workflow.md 中与主要控制图对应的固定起手句；直接设计模式删除本行。]

[可选声音要求：只在用户明确提出时写成一行；用户未提出时删除本行。]

【视觉风格】
[写清渲染大类、题材融合、材质、光影和镜头气质；另写动作表现等级为均衡或夸张。真人写实默认均衡，3D卡通、3D写实动漫和2D动漫默认夸张。涉及法术、魔法、天地异象、召唤或法相时，同时写清稳定的颜色、纹理、发光规律和环境受光。]

【参考资产】


【预计时长】
[一个具体秒数。]

【禁止项】
1. [当前人物、身体结构、服装、武器和能力稳定性。]
2. [当前场景、光线、天气、材质和空间连续性。]
3. [双方身体独立、动作可见性和穿模风险。]
4. [已有伤势、破坏、轨迹标记清除、字幕水印或本次特殊要求。]

【初始空间关系】
[只写第0秒已经存在的场景结构、双方位置、距离、朝向、高低关系、姿态、武器状态和关键环境锚点，不写后续动作。]

【详细打斗分镜提示词】
镜头 1：0秒-X秒，开场镜头，[景别]，[运镜]。
[一个连续自然段：主要观看任务、动作方向、准确落点、攻防结果、状态变化和实际发生的环境反馈。]

镜头 2：X秒-X秒，切镜，[景别]，[运镜]。
[承接上一镜位置、方向、速度、武器状态和结果，继续完整动作链。]
```

Keep `【参考资产】` followed by a fully blank line. Never write “由用户填写” or insert image numbers, filenames, URLs, or mentions.

Do not blindly use all four forbidden-item lines. Keep only constraints that are real for the current task. In trajectory mode, require that final frames exclude trajectory lines, arrows, node numbers, text labels, camera icons, and interfaces. Existing scene signs, clothing text, or numbers in reference assets are not newly generated subtitles.

## Shot Construction Check

For internal composition only, check each shot against four layers. Do not print these labels:

1. **Shot head:** framing and camera movement.
2. **Action body:** actor, body part, direction, target, contact, defense or evasion, and immediate result.
3. **Inherited state:** new location, facing, weapon state, injury, and persistent destruction.
4. **Feedback:** only the medium, light, effect, material response, or destruction actually triggered in this shot.

A short shot may capture one sudden change; a longer shot may contain a complete exchange. Do not mechanically force all four layers into every shot.

The earlier heavy-hit chain may span adjacent shots but must cover opening, readable buildup, contact, displacement, camera revealing distance, environment response, braking, and immediate re-entry. The final attack or major ability must cover trigger or buildup detail, power convergence, target lock, release or contact, sustained result, and decisive endpoint.

## Lower Rhythm Panel

Place this after the complete upper prompt:

```markdown
┈┈┈ 下面不是提示词，是帮你调整节奏的面板，复制提示词时不要带上 ┈┈┈

【打斗节奏梳理】
① [两到四字模块名]（[对应时间]）：[角色行动] → [对手反应] → [位置、主动权或结果变化]
② [两到四字模块名]（[对应时间]）：[角色行动] → [对手反应] → [位置、主动权或结果变化]
③ [继续覆盖完整时间轴，不增加正文中不存在的动作。]

调整方法：你可以按编号调整节奏，例如“把②提前”“在③之后先分开再追击”“⑤改成不击飞”；也可以提出全局调整，例如动作更夸张或更真实收敛、慢镜位置或长短、取消2D动漫默认单色终结帧。我会重新设计具体招式、镜头和衔接，保证人物能力、攻防因果与空间连续成立。
```

The rhythm panel's time ranges and order must match the storyboard exactly. It may summarize approach, attack, block, evasion, separation, pursuit, position exchange, heavy hit, and finish, but must not teach combat theory. Its circled numbers are the only user-facing edit handles; do not number the formal storyboard's action content.

## Final Audit

Run this silently before delivery:

- Was the request routed correctly without asking for information already supplied?
- Were the five basics used as lightweight prompts and critical follow-ups limited to genuine ambiguity?
- Were assets applied by role and conflicts resolved without silently changing the user's core design?
- Are visual rendering and action intensity separate, with only balanced or exaggerated used?
- Does every action arise from range, weapon, previous result, and opponent response?
- Does every meaningful contact change body, weapon, position, speed, distance, initiative, or environment?
- Are positions, facing, weapon state, injuries, and destruction continuous across cuts?
- Does every shot have one primary relation, character, detail, or result task?
- Are wide shots used only when they materially explain space, displacement, formation, scale, or final result?
- Does ordinary melee gain variety through framing and camera rather than forced solo-shot quotas?
- Do ranged-versus-melee and ranged-versus-ranged fights use causal cross-cutting and consistent screen direction?
- Does group combat focus on the protagonist and the current one or two attackers while preserving formation pressure?
- Do spells, summons, and transformations show their real trigger and appropriate close details?
- Does every supernatural ability have stable corresponding energy light, relevant stage coverage, and environment illumination instead of only ordinary material or weather?
- Does the midpoint hit have readable buildup, displacement, environment response, braking, and re-entry?
- Does the final strike or major ability have stronger buildup or slow motion, target lock, release, and sustained result?
- Does a decisive 2D-anime ending default to a high-saturation single-color frame and mark it as removable?
- In trajectory mode, is the correct fixed opener present before `【视觉风格】`, with role placeholders removed?
- Does trajectory prose compress route information while retaining crossings, attacks, responses, body results, state inheritance, and pacing?
- Does the final frame remove trajectory graphics and interfaces?
- Does frame-zero space contain only already-existing facts?
- Is `【参考资产】` blank?
- Does the time axis cover the exact duration continuously without overlap or gaps?
- Does each shot use the two-line compact block format?
- Does the rhythm panel match the storyboard and remain outside the prompt?
- Were unrequested dialogue, chants, music, internal analysis, counts, generic filler, and unrelated micro-expressions removed?

If an audit item fails, redesign the relevant action, space, trajectory conversion, or shot. Do not append a patch-note explanation to the final prompt.
