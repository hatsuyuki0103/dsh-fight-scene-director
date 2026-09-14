# 复现上游快照 / Reproduce the upstream snapshot

用来独立验证 `test/fixtures/upstream-hashes.json` 里的哈希确实来自上游仓库，
而不是本仓库自己编的。

## 前置

- `gh` CLI（已登录）或一个带 `repo` scope 的 GitHub token
- Node ≥ 22.19（只用内置模块）
- PowerShell / bash 均可，下面用 bash 风格写，Windows 上命令等价

## 1. 钉定 commit

```bash
REPO=ZzzAloong/fight-scene-director
COMMIT=6265df37ae701449ef672f46db65ab15c4af9fc2
```

## 2. 列出上游文件树

```bash
gh api "repos/$REPO/git/trees/$COMMIT?recursive=1" --jq '.tree[] | "\(.size)\t\(.path)"'
```

期望结果（与移植时的记录一致）：

```
  66  .gitattributes
1069  LICENSE.txt
1729  README.md
5530  SKILL.md
 312  agents/openai.yaml
14468 references/choreography-and-camera.md
10773 references/examples.md
9509  references/interaction-routing.md
8606  references/output-format.md
8643  references/trajectory-workflow.md
```

## 3. 下载 references 并算哈希

```bash
mkdir -p /tmp/upstream-refs
for f in choreography-and-camera examples interaction-routing output-format trajectory-workflow; do
  gh api "repos/$REPO/contents/references/$f.md?ref=$COMMIT" --jq '.content' \
    | base64 -d > "/tmp/upstream-refs/$f.md"
done

for f in /tmp/upstream-refs/*.md; do
  printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(basename "$f")"
done | sort -k2
```

Windows / PowerShell 版本（用 Node 处理 base64 与哈希，不依赖 `Get-FileHash`，
也不依赖 `[IO.File]::`——在受限语言模式的沙箱里这些会被拦下）：

```powershell
$repo = 'ZzzAloong/fight-scene-director'
$commit = '6265df37ae701449ef672f46db65ab15c4af9fc2'
$dest = "$env:TEMP\upstream-refs"; New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in 'choreography-and-camera','examples','interaction-routing','output-format','trajectory-workflow') {
  $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/references/$f.md?ref=$commit" `
        -Headers @{ 'User-Agent'='dsh'; 'Accept'='application/vnd.github+json' }
  [IO.File]::WriteAllBytes("$dest\$f.md", [Convert]::FromBase64String($r.content))
}
node -e "const {createHash}=require('node:crypto'),fs=require('node:fs');for(const f of fs.readdirSync(process.argv[1]).sort())console.log(createHash('sha256').update(fs.readFileSync(process.argv[1]+'/'+f)).digest('hex'),f)" $dest
```

> 如果上面的 `[IO.File]::WriteAllBytes` 被沙箱以「only core types」拒绝，把下载换成
> `Invoke-RestMethod ... | ConvertFrom-Json` 后交给 Node 写盘，或者直接在 bash / WSL
> 里跑前一节的命令——两条路产出的字节完全相同。

## 4. 与夹具对账

把上一步输出与 `test/fixtures/upstream-hashes.json` 的 `files[*].sha256` 逐条比对。
全部一致即证明：本仓库分发的 references 就是上游 commit 的原件。

## 5. 直接跑门禁（更省事）

```bash
node --test "test/*.test.mjs"
```

T3.4 做的就是上面第 3–4 步，只不过比对对象是本仓库内的文件。
