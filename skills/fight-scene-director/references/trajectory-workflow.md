# Trajectory Workflow

Read this file whenever the user wants to prepare, interpret, or use a character or camera trajectory map.

## What the Three Image Prompts Produce

Deliver all three personalized prompts in one response, but the user normally creates only two images:

1. The initial-position wide view is the required base image. If the user already has a qualified base image, still provide prompt one as a backup or remake option.
2. The character trajectory map controls character movement and attack direction.
3. The character-and-camera dual trajectory map controls character movement, attack direction, and camera movement.

Prompts two and three are alternatives. Do not require both. If the user supplies both later, ask which is the primary control map only when their routes conflict or the user has not chosen.

## Decide Whether to Ask

- Character, weapon, and scene assets supplied: read them and generate all three personalized prompts without asking the user to repeat visible information.
- Assets complete but fight description simple: expand it into plausible approach, interception, crossing, evasion, position exchange, pursuit, and separation. Do not turn this preparation stage into a full video storyboard.
- No images but enough text: write prompt one as a complete text-to-image request; prompts two and three edit the resulting base image.
- Neither assets nor sufficient text: ask only for the missing character, scene, fight relation, style, or duration needed to create the base image.
- Recognizable trajectory map already supplied: skip preparation and generate the formal fight prompt.

## Personalization Rules

- Replace abstract placeholders with stable visual names such as “银白短发女猎人” or “持战斧男佣兵”.
- Use only structures that exist in the supplied scene: ramps, bridges, railings, pillars, platforms, passages, elevation, and open space.
- Expand a simple route from the fighters' weapons, preferred distance, movement style, and real terrain. Do not invent new weapons, abilities, victory conditions, or major structures.
- Each image prompt must be one compact natural paragraph inside its code block. Do not use subheadings, bullets, bold, emoji, or long per-character route lists inside the prompt.
- Write all three copyable image prompts in Chinese, even when the surrounding conversation uses another language.
- Replace duration placeholders with a concrete duration. If the user delegates duration, use 15 seconds and mention that it can be changed.

## Image-Prompt Writing Frames

These are internal frames. Rewrite them around the current characters and scene; never send abstract placeholders when the information is known.

### Prompt One: Initial-position Wide View

```text
结合当前人物、武器、画风和场景参考，生成一张用于规划打斗路线的初始站位全景图。具体写清双方外形、服装、武器、体型和身体结构，并根据武器距离、打斗关系和真实地形安排双方的起点、距离、朝向、高低关系与动态准备姿势。双方全身入画，清楚保留主要地形、纵深、可利用结构和充分运动空间，避免正面并排摆拍。画面不出现轨迹线、箭头、文字、编号和图例。这张图是空间规划底图，不自动等同于视频第一帧；如果同时用作视频首帧，让至少一方已经出现明确的起步、前冲或攻击预备方向。
```

### Prompt Two: Character Trajectory Map

```text
目标视频时长为具体秒数。以当前双方同框的初始站位全景图为底图，保留原有人物、武器、场景、构图、光线和初始位置，只增加双人打斗轨迹。为两名具体角色分别指定与背景反差明显的颜色，在空白处放置简洁图例；用带箭头实线表示移动路线，用同色短虚线箭头表示攻击方向。结合双方武器距离、移动特点、打斗要求和真实地形，具体写清两条路线怎样接近、拦截、交汇、闪避、换位、追击或分离；沿时间顺序用数字标记关键节点，每个节点只配一个简短动作标签。复杂度与目标时长匹配，交汇点清楚，路线连续并贴合地形，不穿过实体障碍，避免频繁折返、过度交叉和文字遮挡人物。
```

### Prompt Three: Character-and-camera Dual Trajectory Map

```text
目标视频时长为具体秒数。以当前双方同框的初始站位全景图为底图，保留原有人物、武器、场景、构图、光线和初始位置，只增加人物动作轨迹与摄影机运动轨迹。为两名具体角色分别指定红色与橙色，用带箭头实线表示移动路线、同色短虚线箭头表示攻击方向；用蓝色带箭头曲线表示摄影机推进、横移、环绕、拉远和重新构图，并在空白处放置简洁图例。结合双方武器距离、移动特点、打斗要求和真实地形，具体写清人物如何接近、交汇、换位、追击或分离，并让摄影机观察位置对应关键交锋节点；沿时间顺序标记人物节点和必要机位，每个节点只配一个简短动作或机位标签。人物路线、攻击方向和摄影机路线分层清楚，复杂度与时长匹配，线路连续并贴合地形，不穿过实体障碍，避免反复绕行、过度交叉和文字遮挡人物。
```

For concrete density and personalization, read the three image-prompt examples in [examples.md](examples.md).

## Delivery Sequence

1. Use the trajectory-mode introduction from `interaction-routing.md`.
2. Output three titles and three personalized prompts.
3. Use the complete next-step guidance from `interaction-routing.md`.
4. Do not generate images automatically unless the user explicitly asks the current model to do so.
5. Do not generate the formal fight prompt before the chosen trajectory map is returned.

## Parse a Returned Map

Read, in order:

1. Legend, color ownership, line types, arrows, start and end points, and node numbering.
2. Character movement, attack directions, action paths, and camera paths as separate layers.
3. Approach, crossings, position exchanges, separation, and endpoint.
4. Weapon range and ability logic at every crossing.

Do not assume red means character or blue means camera unless the legend or user says so. If a route crosses an impossible obstacle or contradicts anatomy or weapon reach, preserve the character logic and make the smallest route-compatible correction. Ask only when the map cannot be interpreted reliably.

Trajectory graphics are controls, not final visual elements. The final video must not show lines, arrows, numbers, labels, camera icons, or interface elements unless the user explicitly requests a graphic-overlay effect.

## Convert the Map into Fight Content

- Turn the base image into `【初始空间关系】`; record only frame-zero facts.
- Turn numbered crossings into continuous time segments. Node count does not equal shot count.
- Compress route descriptions already visible in the map; retain only enough location information for continuity.
- At every crossing, write the concrete attack, defense or evasion, contact result, body response, initiative change, and inherited state.
- With a character-only trajectory map, design the necessary camera work normally.
- With a dual trajectory map, follow the supplied camera order and mention only key observation positions, speed changes, and framing purpose.
- Preserve the main route while completing causality, contact, pacing, and result.

## Required Formal Prompt Opener

Place one line before `【视觉风格】`. Replace the bracketed role labels with the current stable character names and remove the brackets.

Character trajectory map:

```text
参考人物动作轨迹图：以底图中[角色A]与[角色B]的初始站位确定第0秒双方的位置、距离和朝向，按照图中的人物路线、交汇位置、攻击方向与终点设计打斗；轨迹线、箭头、编号和文字标签只作调度参考，最终画面不显示。
```

Character-and-camera dual trajectory map:

```text
参考人物动作＋摄影机运动双轨迹图：以底图中[角色A]与[角色B]的初始站位确定第0秒双方的位置、距离和朝向，按照图中的人物路线、交汇位置、攻击方向、终点与摄影机路线设计打斗；轨迹线、箭头、编号、文字标签和摄影机图标只作调度参考，最终画面不显示。
```

This is an instruction to the video model and belongs inside the copyable prompt. Do not add it in direct-design mode. Also include the trajectory-removal requirement in `【禁止项】`.
