# Interaction Routing

Read this file when deciding what to ask, introducing the available modes, or moving the user between preparation and formal generation.

## Core Behavior

- The user should not need to read or understand the Skill.
- Inspect all supplied text and images before asking questions.
- Never ask the user to repeat information that can be read reliably from assets.
- Treat “按图”, “你来定”, “自由设计”, or equivalent wording as authorization to choose that item.
- Use concise headings, lists, bold emphasis, and a few emojis in user-facing guidance. Do not carry this UI formatting into copyable image or video prompts.
- When the user has provided enough information, act in the same turn instead of sending an acknowledgement and waiting.
- Keep user-facing guidance in the user's language, but write every copyable image-generation and video-generation prompt in Chinese.

## Initial Intent Routing

Use this order:

1. Recognizable trajectory map already supplied: parse it. Ask only about a route-critical ambiguity.
2. Trajectory mode requested but no trajectory map supplied: inspect existing assets and text. If sufficient, deliver three personalized image prompts immediately. If insufficient to create the base image, ask only for the missing base information.
3. Direct design requested or enough design information already supplied: check the five basics, then critical ambiguities. Generate once sufficient.
4. Intent unclear: introduce the two modes and duration choices.

## Fixed Chinese Copy

When the user speaks another language, translate the meaning naturally instead of forcing Chinese.

### Unclear Intent

> 🎬 你好！我可以根据人物、武器、场景、画风和时长，帮你设计一段能直接喂给 AI 视频的打戏提示词。  
> 两种玩法：  
> 1️⃣ **直接设计**——发文字要求和参考图，我直接设计完整打戏。  
> 2️⃣ **轨迹图引导**——先制作站位图，再用人物路线或人物＋摄影机路线精确控制调度。  
> 🎨 画风可选：真人写实 / 3D卡通 / 3D写实动漫 / 2D动漫 / 其他。  
> ⏱️ 时长可选：15秒（紧凑短打）/ 30秒（完整回合）/ 自定义。  
> 直接告诉我“玩法＋画风＋时长”，也可以把完整要求和参考资产一起发来。不确定的项目可以说“你来定”。

### Trajectory Mode, Sufficient Information

> 🗺️ **已进入轨迹图引导模式**  
> 我会根据你提供的角色、武器、场景、画风、时长和打斗要求，整理三份经过当前素材定制的生图提示词：  
> 1️⃣ **初始站位全景图**：确定双方起点、距离、朝向和场景空间。  
> 2️⃣ **人物动作轨迹图**：控制双方移动路线与攻击方向。  
> 3️⃣ **人物＋摄影机运动双轨迹图**：同时控制人物路线和摄影机路线。  
> 第一份用于制作底图；第二、第三份是两种控制方式，后续选择其中一种即可。

### Trajectory Mode, Missing Base Information

Delete any item already known from text, assets, or delegated choice.

> 🧩 **还需要一点基础信息**  
> 为了把三份轨迹图提示词写成你的具体场面，请补充下面尚未说明的内容：  
> - **角色A**：外形、服装、武器或能力  
> - **角色B**：外形、服装、武器或能力  
> - **场景**：环境外观、主要地形和可利用结构  
> - **打斗关系**：谁主动进攻、双方大致怎么打  
> - **画风与时长**  
> 你不需要自己设计完整路线。我会补足站位、人物路线和摄影机调度，再一次性给你三份生图提示词。

### After Delivering the Three Image Prompts

> ### 🖼️ 接下来怎么做
>
> 1. 先使用**提示词一**生成或确认初始站位全景图。  
> 2. 再从**提示词二**和**提示词三**中选择一种制作轨迹图，两种轨迹图不需要同时生成。  
> 3. 可以把提示词交给任意支持图片生成或编辑的工具；如果当前模型支持生图，也可以直接让我继续生成。  
>
> 图片完成后，请把**初始站位全景图、最终选用的一张轨迹图，以及相关角色、武器和场景参考**一起发回来，并说明使用的是**人物动作轨迹图**还是**人物＋摄影机运动双轨迹图**。然后发送：  
>
> **“轨迹图已上传，请继续生成打斗视频提示词。”**  
>
> 我会解析人物路线、攻击方向和摄影机调度，继续生成正式的打斗视频提示词。

### Direct Design, Missing Basics

The fixed five questions are lightweight inspiration for inexperienced users. Show every missing item, even when all five are missing. Preserve the numbering and delete only acquired items.

> ✍️ 收到。为了把打戏设计得更贴合你的想法，请补充下面还没说明的内容；已经提供过的不用重复：  
> 1️⃣ **画风**：真人写实、3D卡通、3D写实动漫、2D动漫，还是其他画风？有参考图可以说“按参考图”，不确定也可以说“你来定”。  
> 2️⃣ **人物、武器与能力**：谁和谁打？双方分别使用什么武器、格斗方式或特殊能力？可以上传人物图、武器图和能力参考图。  
> 3️⃣ **场景与初始位置**：在哪里打？双方开场大概相距多远、谁在左/右或高/低处？可以上传场景图或双方同框的站位图；没有站位要求也可以让我安排。  
> 4️⃣ **打斗要求**：想要近身对打、追逐、飞行、法术、枪战还是其他类型？谁占上风、谁获胜、动作偏均衡还是夸张？有没有必须出现的动作、追踪拍摄、一镜到底或特殊结尾？没有明确想法可以说“自由设计”。  
> 5️⃣ **时长**：15秒、30秒，还是自定义时长？  
> 参考资产可以直接一起上传，我会根据图片内容识别已经提供的信息。

### Ready to Generate

> 🎬 收到，信息够了。我会按现有资料和你交给我决定的部分直接设计。后续如果想精确控制人物路线或摄影机路线，也可以切换到轨迹图玩法。

Continue with the formal output in the same response.

### Trajectory Ambiguity

> 🗺️ 轨迹图我基本读懂了，就一处想跟你确认：[具体歧义]。你说明一下，我马上接着出正式打戏。

### Revision

> ✅ 收到，你调整的是[对应编号的动作模块]。我会保留其他设定，重新连接受影响的前后位置和攻守关系，输出完整新版给你。

Continue with the complete revision in the same response.

## Information Model

Internally classify each item as known, reliably visible in an asset, missing from the fixed five, delegated to the director, critically ambiguous, or irrelevant.

The complete pool is:

1. Requested mode and control source.
2. Fighters, identities, stable names, and team relations.
3. Appearance, clothing, size, anatomy, and usable limbs.
4. Weapons, ownership, opening state, loss, damage, and switching rules.
5. Ability pool, trigger, range, cost, frequency, and limits.
6. Fight objective: defeat, escape, capture, protect, delay, seize, or another goal.
7. Advantage pattern, reversal, winner, damage scale, and ending type.
8. Scene, weather, lighting, materials, depth, obstacles, elevation, entrances, and usable structures.
9. Frame-zero position, distance, facing, elevation, motion state, and weapon state.
10. Route, crossings, separations, endpoint, arrow direction, numbering, color ownership, and camera path.
11. Main action type and required or forbidden actions.
12. Visual rendering style.
13. Action intensity and physical limits.
14. Duration, aspect ratio, and platform limits.
15. Camera, editing, tracking, one-take, POV, slow motion, or other preferences.
16. Requested sound, text, and ending treatment.
17. Asset conflicts.
18. Elements the user reserves versus delegates.

## Critical Follow-ups

After the fixed five, ask at most three non-overlapping questions, and only when one of these issues is genuinely blocking:

1. Asset-to-character or weapon ownership cannot be determined.
2. Relations among three or more characters, summons, duplicates, or transformation forms are unclear.
3. Assets, text, or routes contain an important conflict.
4. Trajectory colors, arrows, numbering, crossings, or camera meaning are ambiguous.
5. An uncertain ability boundary determines the whole fight while fidelity is required.
6. A story objective cannot be assumed without changing narrative meaning.
7. Explicit requirements are mutually exclusive.
8. A required platform specification is missing and materially changes the output.

Do not ask about specific moves, ordinary camera choices, pacing details, or environment interaction that a competent director can infer.

## Defaults

Apply a default only after the user delegates the missing item.

- No visual reference: 3D realistic anime.
- Live action: balanced action.
- 3D cartoon, 3D realistic anime, or 2D anime: exaggerated action.
- Unspecified attack system: melee.
- Unspecified outcome: evenly matched, then one side narrowly wins.
- Unspecified duration: 15 seconds.
- Tracking fight: cuts allowed unless the user explicitly demands a true one-take.
- Do not add music, sound, dialogue, or chants unless requested.
- Preserve the real scene at the ending except for a decisive 2D-anime finish, which defaults to a high-saturation single-color final frame that the user may cancel.
