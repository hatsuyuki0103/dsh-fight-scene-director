# 移植报告 / Port Report

这份文档回答一个问题：**这个仓库里的技能，和上游 Codex 技能相比，到底改了什么、凭什么说没走样。**

## 1. 溯源

```
ZzzAloong/fight-scene-director              ← 上游 Codex skill
  MIT, © 2026 AIZAO Aloong
  commit 6265df37ae701449ef672f46db65ab15c4af9fc2
        │
        │  移植（本仓库）
        ▼
hatsuyuki0103/dsh-fight-scene-director      ← DeepSeek Harness 插件
```

本次移植的直接线索来自一篇微信公众号文章；该文章正文因平台风控无法自动抓取，
技能身份由用户确认。因此**移植依据是上游仓库源码本身**，不是文章转述。

## 2. 为什么必须做成插件

Codex 靠**扫描 `~/.codex/skills/`** 发现技能；DSH 靠**插件注册 SkillProvider**。
把上游文件夹原样复制到磁盘上任何位置，DSH 都不会认识它——技能目录里不会出现
`fight-scene-director`。所以移植的实质是：

1. 写 host 插件（`index.mjs` + `lib/skills-provider.mjs`）把技能注册进 DSH；
2. 声明 bundle patch（`cordis.patch.yml` + `package.json` 的 `dsh.bundle.patch`），
   让 `dsh plugin --profile web add` 装完后能被 profile 真正挂载；
3. 保留上游知识正文与中文输出契约**逐字不变**——这是技能的价值本体，动它就等于换了技能。

## 3. 改动清单（可审计）

| 文件 | 改动 | 理由 |
|---|---|---|
| `skills/fight-scene-director/references/*.md` | **无**（逐字节一致） | 中文输出契约与编排知识是技能本体 |
| `skills/fight-scene-director/SKILL.md` | 新增 `DeepSeek Harness Notes` 小节；`description` 追加中文触发词；删除正文里重复的 `Created by …` 行 | DSH 的加载方式与相对路径语义需要说明；DSH 按 description 召回；署名已由 `NOTICE` / `README.zh.md` / `LICENSE.upstream` 承载 |
| `agents/openai.yaml` | **不作为生效产物分发**（`docs/upstream-agents-openai.yaml` 仅作对照） | Codex 专属元数据（`display_name` / `policy`），DSH 无对应概念 |
| `index.mjs`、`lib/skills-provider.mjs`、`cordis.patch.yml`、`test/*`、README、合规文件 | 全新 | 上游作为 Codex 技能不需要这些 |

上游文件另存了逐字副本（`docs/upstream-SKILL.md`、`docs/upstream-README.md`、
`docs/upstream-agents-openai.yaml`），方便任何人直接 diff。

## 4. 怎么验证「没走样」

```bash
node --test "test/*.test.mjs"
```

其中 `test/knowledge.test.mjs` 的 **T3.4** 用 `test/fixtures/upstream-hashes.json`
里钉定的 sha256 校验五个 references 文件与上游 commit 是否**逐字节一致**。这个门禁
是刻意做成会响的：

- 有人手滑改了一个中文字段 → 测试失败；
- 有人**有意**要改（比如要适配新模型）→ 必须同时更新哈希夹具并在 `CHANGELOG.md` 说明，
  改动因此永远留痕。

## 5. 已知边界

- 微信文章正文没有被读取（风控验证页），移植依据是上游源码。
- npm 未发布（本仓库以 GitHub 直装为分发通道）。
- 本地复现上游快照的脚本见 `docs/reproduce-upstream.md`。
- 本包曾在 1.0.0 被一轮独立对抗评审打回（两个 HIGH 缺陷：CRLF 技能文件被静默丢弃；
  技能 description 超出 DSH 目录截断预算导致召回锚点模型根本看不到）。逐条修复记录见
  `CHANGELOG.md` 的 1.1.0 段。这类缺陷的共同点是**都不会让测试变红**，只会让技能
  在真实会话里「好像装了但没反应」——所以修复都补了对应门禁。
