# dsh-fight-scene-director

在 **DeepSeek Harness** 里使用 Codex 技能「**多画风打戏导演 / fight-scene-director**」。

根据你的角色、武器、能力、场景、参考图、故事目标、时长与轨迹控制，产出一份**可执行的
AI 视频打戏提示词**——先定动作因果与空间调度，再定镜头。输出为结构化中文提示词，
面向 **Seedance 2.0**、**Seedance 2.5**、**MiniMax H3**。

> 原技能作者 **AIZAO Aloong** —
> [ZzzAloong/fight-scene-director](https://github.com/ZzzAloong/fight-scene-director)（MIT）。
> 本仓库是它的 DeepSeek Harness 移植版。改了什么、凭什么说没走样，见
> [NOTICE](./NOTICE) 与[移植报告](./docs/PORT-NOTES.zh.md)。

## 它做什么

- 从文字设定设计完整打戏，或对已有版本做整体修订。
- 给出**初始站位图**、**人物动作轨迹图**、**人物+摄影机双轨迹图**的生图提示词。
- 读取你给的角色图 / 场景图 / 站位图 / 轨迹图，并按各自职责写进提示词。
- 按近战、远程、法术、群战、召唤、变身等类型调整动作与镜头。
- 支持 15 秒、30 秒与自定义时长，在可复制提示词之后附**可调整的打斗节奏面板**。
- 保持人物、武器、能力、场景破坏与空间位置在镜头间连续。

## 安装

### 方式 A：直接从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:hatsuyuki0103/dsh-fight-scene-director
```

`dsh plugin add` 底层就是 `pnpm add`，而 pnpm 支持 `github:user/repo` 这种写法，
所以**不需要 npm 账号，也不需要包已发布到 npm**。需要可复现时钉版本：

```bash
dsh plugin --profile web add github:hatsuyuki0103/dsh-fight-scene-director#v1.0.0
```

安装后**重启 harness**，让新的 profile 层被组合进去。

### 方式 B：从本地检出安装

```bash
git clone https://github.com/hatsuyuki0103/dsh-fight-scene-director.git
dsh plugin --profile web add /绝对路径/dsh-fight-scene-director
```

### 方式 C：手动 link

自己改 `~/.dsh/profiles/web/package.json`，把检出目录加进依赖与 bundle 列表：

```json
{
  "dependencies": {
    "dsh-fight-scene-director": "link:/绝对路径/dsh-fight-scene-director"
  },
  "dsh": {
    "profile": {
      "bundles": ["…已有 bundles…", "dsh-fight-scene-director"]
    }
  }
}
```

## 验证安装

重启后，技能必须出现在会话技能目录里：

```bash
dsh plugin --profile web list | grep fight-scene-director
```

在会话里直接用中文提需求即可（本技能可被模型自动召回），例如
`帮我设计一段 30 秒的剑客对决打戏`。也可以显式加载：

```
skill fight-scene-director
```

**如果技能没有出现**，按顺序排查：

1. 确认插件是作为 *bundle 层* 落地的——只声明了依赖但包没有 `dsh.bundle` 时，
   它会被装上但永远不会被挂载；
2. 确认你重启了 harness（profile bundle 只在启动时组合）；
3. 确认 `package.json` 的 `dsh.bundle.patch` 指向的 `cordis.patch.yml` 存在。

## 配置

支持在 profile 的 `cordis.patch.yml` 或 agent preset 里行内配置：

```yaml
- id: fsd-skills
  name: dsh-fight-scene-director
  config:
    enableSkills: true          # 设为 false 可整体卸载本包技能
    extraSkillDirs: []          # 让同一个 provider 额外服务的技能根目录
    maxSkills: 100              # 目录条目上限
```

## 卸载

```bash
dsh plugin --profile web remove dsh-fight-scene-director
```

然后重启。移除依赖后，下一次启动会自动摘掉该 bundle 层；包外不写任何文件。

## 仓库结构

```
index.mjs                     host 插件入口（name / inject / apply）
lib/skills-provider.mjs       嵌入式、惰性加载的技能 provider
skills/fight-scene-director/  技能本体（SKILL.md + references/）
cordis.patch.yml              profile bundle patch
test/                         契约 + 知识保真门禁
docs/                         移植报告、上游副本、复现配方
```

## 开发

```bash
node --test "test/*.test.mjs"
```

无需安装任何依赖——测试只用 Node 内置模块。这套门禁刻意盯住两件事：

- **`references/*.md` 必须与钉定的上游 commit 逐字节一致**（门禁 T3.4，哈希在
  `test/fixtures/upstream-hashes.json`）。有意修改就必须同步更新哈希夹具，
  并在 `CHANGELOG.md` 里说明——改动因此永远留痕。
- **provider 必须拒绝伪造候选**（门禁 T2.5–T2.7）。技能定义按对象身份借用，
  只有本 provider 自己产出的候选能被加载。

## 许可证

MIT。移植部分 © 2026 hatsuyuki0103；原技能 © 2026 AIZAO Aloong，同样是 MIT。
两份许可证原文都在本仓库（[`LICENSE`](./LICENSE)、[`LICENSE.upstream`](./LICENSE.upstream)）。
