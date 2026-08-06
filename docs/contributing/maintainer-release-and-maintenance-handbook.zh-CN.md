# Ki-Buddy 与 Ki-Core 仓库管理者发版和维护手册

> 当前管理者：`xlihub`
> 最近核对时间：2026-08-06
> 适用仓库：`xlihub/Ki-Buddy`、`xlihub/Ki-Core`

本文按实际工作场景说明仓库管理者每天、每次上游更新和每次发版需要处理的事项。读完后，管理者应当能够判断下一步该同步哪个仓库、合并哪个 PR、批准哪个 workflow，以及遇到失败时是否允许重试或必须创建新版本。

流程依据见[上游发版流程分析与 Ki 双仓目标流程](upstream-release-analysis-and-target-alignment.zh-CN.md)。

## 1. 首次迁移结果与当前状态

Ki-Core 第一次正式发布已于 2026-08-06 完成。后续 Ki-Core 版本直接按第 3 至第 5 节的常规流程操作，不再重复首次发布恢复步骤。

### Ki-Core 当前状态

- [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0) 已公开发布，对应 AionCore `v0.1.59`。
- AionCore peeled commit 为 `815e61ed9bbe942339347dc1e69ddce176cded76`。
- 最终 Release PR 是 [PR #9](https://github.com/xlihub/Ki-Core/pull/9)，合并提交和 tag 目标均为 `209e6844d39bac0762c61e198c1ba3a007f9dd2e`。
- [Release Please run](https://github.com/xlihub/Ki-Core/actions/runs/31068696569) 与 [Ki-Core Stable Release run](https://github.com/xlihub/Ki-Core/actions/runs/31068791622) 均成功。
- Release 包含六个平台 archive 和 `ki-core-checksums.txt`，不是 Draft 或 Prerelease。
- PR #9 已标记为 `autorelease: tagged`。
- `ki-core-stable` Environment 由 `xlihub` 审批，单维护者阶段允许审批自己的发布请求。

### 首次发布故障记录

首次发布恢复过程出现过三类状态：

1. [PR #3](https://github.com/xlihub/Ki-Core/pull/3) 的正文被改写为普通中文 PR 描述，Release Please 无法解析版本区块。
2. [PR #8](https://github.com/xlihub/Ki-Core/pull/8) 保留了可解析正文，但分支 `release/ki-core-0.1.0-recovery` 不符合 Release Please 分支协议。
3. [PR #9](https://github.com/xlihub/Ki-Core/pull/9) 使用 `release-ki-core-v0.1.0`、可解析正文和 `autorelease: pending`，合并后成功创建 tag 与 Release。

旧 PR #3、#6 和 #8 的 `autorelease: pending` 已移除。不要重新添加这些标签，也不要重新运行它们的发布流程。

### Ki-Buddy 当前状态

- 远端 `product/main` 尚未建立独立发版体系。
- 本地功能分支正在实现 Ki-Core 产物消费。
- `ki-core-v0.1.0` 已可用于正式 pin，但 Ki-Buddy 配置仍未写入 tag、commit 和六个平台 checksum。
- 没有 Ki-Buddy 产品 CHANGELOG 和版本映射。
- xlihub/Ki-Buddy 当前没有公开 Release。

### 当前允许的后续操作

- 对齐 Ki-Buddy 的 AionUi 正式上游基线。
- 在 Ki-Buddy 正式配置中固定 `ki-core-v0.1.0` 并验证六个平台 checksum。
- 保留 Candidate Build 供未来 Ki-Core 未发布版本联调。
- 建立 Ki-Buddy 独立版本、映射、产品 CHANGELOG 和正式发布 workflow。

### 仍然禁止的操作

- 把 Candidate Actions artifact 当作 Ki-Buddy 正式依赖。
- 移动或重建 `ki-core-v0.1.0`。
- 覆盖来源不同的公开 Release 资产。
- 复用旧 PR 的 pending 标签或把普通功能分支伪装成 Release PR。

## 2. 管理者日常检查

不需要持续盯住 Actions。建议在准备同步或发版时进行以下检查。

### 2.1 查看两个上游的最新正式版本

```bash
gh release view --repo iOfficeAI/AionCore --json tagName,publishedAt,url
gh release view --repo iOfficeAI/AionUi --json tagName,publishedAt,url
```

同时查看 Ki 产品当前版本：

```bash
gh release view --repo xlihub/Ki-Core --json tagName,publishedAt,url
gh release view --repo xlihub/Ki-Buddy --json tagName,publishedAt,url
```

仓库没有 Release 时，命令失败属于预期状态，应改用：

```bash
gh release list --repo xlihub/Ki-Core
gh release list --repo xlihub/Ki-Buddy
```

### 2.2 查看待处理 PR

```bash
gh pr list --repo xlihub/Ki-Core --state open
gh pr list --repo xlihub/Ki-Buddy --state open
```

重点识别：

- 上游同步 PR。
- Release Please 创建的 Ki-Core Release PR。
- Ki-Buddy 版本准备 PR。
- 版本号异常跳升的 Release PR。

### 2.3 查看最近失败的 workflow

```bash
gh run list --repo xlihub/Ki-Core --limit 20
gh run list --repo xlihub/Ki-Buddy --limit 20
```

检查具体失败：

```bash
gh run view <run-id> --repo <owner/repo> --log-failed
```

先判断失败属于代码、上游同步、版本元数据、平台构建还是权限审批，再决定重试。不得把所有失败都当作临时网络问题。

## 3. 场景：AionCore 发布了新版本

目标：让 Ki-Core 在不修改 AionCore 源码语义的情况下发布一个对应的 Ki-Core 产品版本。

### 3.1 确认上游 Release 完整

```bash
gh release view <aioncore-tag> \
  --repo iOfficeAI/AionCore \
  --json tagName,targetCommitish,assets,url
```

应确认：

- tag 是正式版本，不是 test tag。
- 六个平台 archive 存在。
- `aioncore-checksums.txt` 存在。
- Release workflow 已完成。

资产仍在上传时不要开始 Ki-Core 正式版本准备。AionCore 上游会先公开 Release，再完成资产上传，通常需要等待十几分钟。

### 3.2 更新 Ki-Core 上游镜像

Ki-Core `main` 只承担上游镜像职责。同步时应记录：

- AionCore tag。
- tag peeled commit。
- 上游 `main` 当前 commit。

产品基线应固定在正式 tag，不应把 tag 之后的上游 `main` 提交带入 Ki-Core Release。

### 3.3 创建上游同步 PR

同步 PR 进入 Ki-Core `product/main`，内容应包括：

- 合入指定 AionCore tag。
- 更新当前上游 tag 和 peeled commit。
- 保持 Ki-Core 产品发布配置不被上游文件覆盖。

纯上游同步应使用能够产生 patch 版本的 Conventional Commit，例如 `fix(upstream): sync AionCore vX.Y.Z`。该提交会由 Release Please 写入下一版 `CHANGELOG.ki-core.md`，并在 Release PR 分支自动增加版本映射。不要使用不会触发版本变化的 `chore(upstream)` 作为常规同步提交标题。

短期没有 Ki-Core 源码二次开发时，PR 相对 AionCore tag 不应出现 Rust 源码、API、协议或数据库迁移差异。

### 3.4 审查和合并同步 PR

合并前确认：

- CI 成功。
- 映射 tag 与 commit 能在上游远端验证。
- `CHANGELOG.md` 保持上游内容。
- `CHANGELOG.ki-core.md` 只记录 Ki-Core 产品内容和本次上游同步。
- 没有修改 AionCore workspace version 来代替 Ki-Core 产品版本。

合并后，Release Please 应创建或更新 Ki-Core Release PR。

## 4. 场景：准备 Ki-Core 正式版本

本节描述流程改造合并后的常规流程。

### 4.1 检查 Release PR 版本

Release PR 应满足：

- base 为 `product/main`。
- 版本符合 Ki-Core 自己的 SemVer。
- 纯 AionCore 同步通常增加 patch。
- CHANGELOG 同时能看到 Ki-Core 变化和同步的 AionCore tag。
- 映射表中没有重复 Ki-Core 版本或 tag。

若纯同步从 `0.1.0` 跳到 `0.2.0`，不要合并。先检查：

- 上一 Ki-Core Release tag 是否真实存在。
- Release Please manifest 是否与已发布版本一致。
- Release PR 合并提交是否进入了创建 tag/Release 的发布分支。
- Release Please 是否仍在使用只创建 PR、跳过 Release 的配置。

### 4.2 合并 Release PR

合并 Release PR 表示管理者接受：

- 本次 Ki-Core 产品版本。
- 本次 AionCore 映射。
- 本次 Ki-Core CHANGELOG。
- 随后创建正式 tag 和 GitHub Release。

保留 Release Please 生成的 `chore(product/main): release ...` 标题。使用 GitHub 默认 merge commit 或 squash merge 都可以，但不要把该标题从最终提交信息中删除。

Release PR 还必须保留以下机器协议：

- 常规流程使用 Release Please 创建的 `release-please--branches--product/main--components--ki-core` 分支。
- 恢复既有版本时使用 `release-ki-core-vX.Y.Z`，不能使用普通 `release/*`、`fix/*` 或 `feat/*` 分支。
- 正文保留两个 `---` 分隔符和 `## [X.Y.Z]` 版本标题；标题、说明和 footer 可以使用中文。
- 合并前保留 `autorelease: pending` 标签。

合并后检查 Release Please run，确认它进入 `Create Ki-Core Release` job，没有继续生成下一版本 PR。

### 4.3 批准正式发布

当 Release Please 的 `Create Ki-Core Release` job 请求 `ki-core-stable` Environment 审批时，`xlihub` 需要核对：

- 请求来自 Ki-Core 正式发布 workflow。
- commit 是刚合并的 `product/main` Release commit。
- tag 与 Release PR 版本一致。
- 映射指向已验证的 AionCore tag。

确认后批准。当前 Environment 允许 `xlihub` 审批自己的部署请求，符合单维护者阶段的实际情况。

### 4.4 首次发布 `0.1.0` 的历史记录

本节只用于解释历史 Actions，不是后续版本操作步骤。

1. 手工运行 `release-current` 时，Release Please 找到 PR #3，但其正文已失去机器可解析结构，因此没有创建 Release。
2. PR #8 使用正确标题和正文，但普通恢复分支名不符合 Release Please 协议，仍未创建 Release。
3. PR #9 使用 `release-ki-core-v0.1.0`、可解析正文和 pending 标签；合并并批准后创建 `ki-core-v0.1.0`。
4. 稳定版 workflow 从 tag 构建六个平台，生成 checksums 并完成资产上传。

后续版本应由普通提交触发 Release Please 自动创建或更新 Release PR。`release-current` 只能重新处理已经具备正确标题、正文、分支名和标签的合并 PR，不能修复错误的 Release PR 元数据。

### 4.5 检查发布结果

```bash
gh release view <ki-core-tag> \
  --repo xlihub/Ki-Core \
  --json tagName,targetCommitish,isDraft,isPrerelease,assets,url
```

应看到：

- tag 指向 Release commit。
- 六个平台 archive 全部存在。
- checksums 存在。
- Release Notes 与 `CHANGELOG.ki-core.md` 一致。
- 映射能追溯到 AionCore tag 和 peeled commit。

只有上述检查通过后，Ki-Buddy 才能更新正式 pin。

## 5. 场景：Ki-Core 构建失败

### 5.1 tag 或 Release 尚未创建

- 查看失败 job 日志。
- 修复代码或 workflow，走普通 PR。
- 重新合并新的 Release PR或重新触发批准后的发布入口。
- 不提前手工创建 tag。

### 5.2 Release 已创建但资产不完整

AionCore 上游允许公开 Release 先于资产上传。Ki-Core 目标流程采用同一状态机后，也可能出现短暂的不完整 Release。

处理原则：

- 构建仍在进行时等待完成。
- 明确的临时 runner 失败可以重跑同一个 workflow。
- 不得用不同 commit 重建同一个 tag。
- 已公开 Release 若最终无法完成，应标记问题并创建新的 Ki-Core patch 版本。
- 只允许对同一 tag、同一 commit 重跑 `Ki-Core Stable Release`。workflow 会按上游方式覆盖同名资产并重新生成 checksums；不得手工上传来源不同的文件。

### 5.3 单个平台持续失败

- 不允许 Ki-Buddy 固定该 Ki-Core 版本。
- 检查是否为上游同平台也存在的问题。
- 检查 Rust target、runner、GLIBC baseline 和 archive 命名。
- 修复后发布新的 patch；不要修改已公开 tag 指向。

## 6. 场景：Ki-Core 发布后准备 Ki-Buddy 版本

目标：把一个完整 Ki-Core Release、AionUi 上游变化和 Ki-Buddy 定制变化放入同一个 Ki-Buddy 产品版本。

### 6.1 确认 Ki-Core 可消费

```bash
gh release view <ki-core-tag> \
  --repo xlihub/Ki-Core \
  --json tagName,targetCommitish,assets,url
```

确认六个平台资产和 checksums 完整。还应从 Ki-Core 映射确认它对应的 AionCore tag。

### 6.2 确认 AionUi 上游同步范围

Ki-Buddy 的版本准备 PR应明确：

- 上一个已同步的 AionUi tag 或 commit。
- 本次同步到的 AionUi tag 或 commit。
- 上游 CHANGELOG 对应范围。
- 需要人工解决的定制代码冲突。

Ki-Buddy 不要求等待 AionUi 发布一个正好对应最新 AionCore 的版本。上游真实流程本身允许 AionUi 与 AionCore 不同时发布。

### 6.3 汇总 Ki-Buddy 定制变化

从上一个 Ki-Buddy tag 到当前 `product/main`，收集用户可见的 `feat`、`fix`、`perf` 和必要文档变化。不要把普通依赖整理、workflow 调试和纯格式提交写成产品功能。

### 6.4 创建 Ki-Buddy 版本准备 PR

版本准备 PR应同时更新：

- Ki-Buddy 自身版本。
- 固定的 Ki-Core tag。
- Ki-Buddy 与 AionUi、Ki-Core、AionCore 的映射。
- `CHANGELOG.ki-buddy.md`。

`CHANGELOG.ki-buddy.md` 的单个版本条目使用以下结构：

```markdown
## Ki-Buddy X.Y.Z

### Ki-Buddy 定制变化

### AionUi 上游更新

### Ki-Core 更新

- Ki-Core: ki-core-vA.B.C
- AionCore: vD.E.F
```

上游 `CHANGELOG.md` 不应改写为 Ki-Buddy 内容。

## 7. 场景：发布 Ki-Buddy

本节描述目标流程，当前尚未建立对应正式 workflow。

### 7.1 合并版本准备 PR

合并前确认：

- Ki-Buddy CI 成功。
- 正式构建固定的是 Ki-Core Release tag，不是 Candidate run。
- 所有 checksums 与 Ki-Core Release 一致。
- `bun.lock` 仅包含当前依赖变化，没有无关的大范围重写。
- Ki-Buddy CHANGELOG 同时包含定制、AionUi 上游和 Ki-Core 三类变化。

### 7.2 创建正式 tag

版本准备 PR 合并后，由 `xlihub` 从合并后的 `product/main` 创建正式 tag。建议采用 `ki-buddy-vX.Y.Z`，避免产品 tag 与上游 AionUi `vX.Y.Z` 混淆。

创建前再次确认远端没有同名 tag。已经存在的 tag 不得移动。

### 7.3 观察构建

正式 tag 应触发：

- 代码质量检查。
- 六平台桌面构建。
- 固定 Ki-Core Release 下载与 checksum 验证。
- Draft Release 创建。

Candidate run 只用于版本准备前联调，不得传入正式构建。

### 7.4 审批和发布 Draft

管理者检查：

- 六个平台安装包齐全。
- updater metadata 中的版本与 tag 规则一致。
- Release Notes 来自 `CHANGELOG.ki-buddy.md`。
- Ki-Core 和 AionCore 映射写明。
- Draft 没有混入 Actions 临时产物。

检查通过后再公开 Release。单维护者阶段由 `xlihub` 触发并批准发布。

## 8. 场景：只发布 Ki-Buddy 定制修复

Ki-Buddy 可以在 Ki-Core 没有新版本时独立发布，与 AionUi 的 `--skip-core` 能力一致。

版本准备时：

- Ki-Core pin 保持不变。
- 映射记录继续指向同一个 Ki-Core/AionCore 组合。
- CHANGELOG 的 Ki-Core 部分写明“本版本未更新 Ki-Core”。
- Ki-Buddy patch 版本按自身修复语义增加。

不得为了让版本看起来同步而创建一个内容完全相同的 Ki-Core Release。

## 9. 场景：Ki-Core 未来开始源码二次开发

Ki-Core 自有源码变化只进入 `product/main`，并使用普通 PR：

- `feat`：产品能力变化。
- `fix`：Ki-Core 自有修复。
- `refactor`：无用户行为变化的内部调整。

发版时：

- `CHANGELOG.ki-core.md` 分别列出 Ki-Core 自有变化和 AionCore 上游同步。
- 映射仍然记录 AionCore 基线，不因 Ki-Core 有 overlay 而失效。
- 上游同步 PR需要处理 overlay 冲突并运行完整测试。
- 不再使用“相对上游 tag 不允许任何 Rust 源码差异”的短期规则，改为维护允许的 overlay 和兼容性测试。

该变化不要求删除 `product/main`、独立版本或映射表，现有产品结构可以继续使用。

## 10. 场景：上游同步发生冲突

### Ki-Core

短期没有源码二次开发时，冲突通常来自发布配置或文档：

- 保留 AionCore 的 Rust、Cargo 和 migration 变化。
- 保留 Ki-Core 的产品版本、映射和发布 workflow。
- 上游 `CHANGELOG.md` 采用上游版本。
- Ki-Core 内容继续写入 `CHANGELOG.ki-core.md`。

### Ki-Buddy

Ki-Buddy 已进行定制开发，冲突需要按用户行为处理：

- 先理解 AionUi 上游改动的目的。
- 再决定定制行为继续保留、适配上游，还是被上游能力替代。
- 冲突解决 PR必须运行受影响测试。
- CHANGELOG 分别记录上游变化和 Ki-Buddy 行为变化。

不得用整文件覆盖快速消除冲突，这会丢失上游更新或产品定制。

## 11. 场景：发现错误版本 PR

典型表现：

- 纯 patch 同步产生 minor。
- Release PR 刚合并又出现下一版本 PR。
- CHANGELOG 重复包含已经发布的提交。
- 映射仍指向旧 AionCore tag。

处理步骤：

1. 不合并错误 PR。
2. 检查上一产品 tag 和 Release 是否存在。
3. 检查 Release Please manifest。
4. 检查上一 Release PR 合并后是否执行了创建 tag/Release 的 job。
5. 检查 Release PR 的标题、正文、分支名和 pending 标签是否都符合机器协议。
6. 修复 workflow 状态机并通过普通 PR 合并。
7. 关闭错误 Release PR并移除其过期 pending 标签。
8. 通过普通 `product/main` push 或手工 `update-pr`，让 Release Please 基于正确的已发布状态重新生成版本。

不要直接编辑错误 PR 把版本号改小，也不要认为 `release-current` 能忽略错误的正文或分支名。Release Please 的已发布状态或 PR 身份仍然错误时，下一次还会重复发生。

## 12. 场景：需要回退产品

### Ki-Buddy 回退 Ki-Core

如果新 Ki-Core Release 存在问题：

- 创建 Ki-Buddy patch PR，把 pin 改回上一完整 Ki-Core Release。
- 更新 Ki-Buddy 映射和 CHANGELOG。
- 重新发布新的 Ki-Buddy patch。
- 不移动旧 Ki-Buddy tag。

### Ki-Core 回退 AionCore

如果需要重新采用旧 AionCore 基线：

- 创建新的 Ki-Core patch 或 minor，按产品兼容性决定。
- 新映射记录指向旧 AionCore tag。
- CHANGELOG 说明回退原因和影响。
- 发布新的 Ki-Core tag。
- 不修改已经发布的映射记录。

## 13. 场景：需要重跑 workflow

允许重跑：

- 网络下载失败。
- GitHub runner 临时故障。
- 同一 commit、同一 tag、同一 workflow 的可重复构建。
- 同一 tag 和 commit 的正式资产构建，允许由 `Ki-Core Stable Release` 使用 `--clobber` 重建整套资产和 checksums。

不允许直接重跑并覆盖：

- 代码或 lockfile 已变化。
- tag 已指向不同 commit。
- 需要使用不同 commit 或人工替换部分公开资产。
- checksums 与原资产不一致。

后一类情况必须创建新 patch 版本。

## 14. 定期维护

建议每月或发布流程发生变化后执行。

### GitHub 设置

- 确认 `main` 和 `product/main` ruleset 仍生效。
- 确认 `ki-core-v*` tag 禁止更新和删除。
- 确认正式发布 Environment 的 reviewer 仍为当前仓库 owner。
- 单维护者阶段保持 `prevent self-review` 关闭。
- 增加维护者后重新评估是否要求独立审批人。
- 检查 repository variables 是否仍启用正确的 fork automation。

### Actions

- 检查 action major version 更新。
- 检查 runner image、Rust、Node、Bun 和 Electron 版本变化。
- 检查六平台最近是否都有成功构建。
- 检查 Release workflow 是否出现长期等待或大量重复运行。
- 不因单次耗时就删除 PR required checks；调整前先区分 PR 验证、main push 验证和正式构建的职责。

### 版本与映射

- 检查每个公开 Ki-Core tag 都有唯一映射。
- 检查每个公开 Ki-Buddy tag 都能追溯到 AionUi、Ki-Core 和 AionCore。
- 检查产品 CHANGELOG 与 Release Notes 一致。
- 检查上游 CHANGELOG 没有被产品内容改写。

### 资产

- 随机抽查 Release checksums。
- 检查 archive 内 executable 名称。
- 检查 updater metadata 与产品 tag 版本一致。
- 检查旧 Release 资产没有被替换。

## 15. 每次发版的管理者检查表

### Ki-Core

- [ ] AionCore 正式 Release 资产完整。
- [ ] Ki-Core `main` 已更新上游引用。
- [ ] `product/main` 固定在明确的 AionCore tag。
- [ ] 映射 tag 与 peeled commit 正确。
- [ ] Release PR 版本符合 Ki-Core SemVer。
- [ ] 双 CHANGELOG 职责没有混用。
- [ ] CI 成功。
- [ ] `xlihub` 批准正确的 Release commit。
- [ ] 六平台资产和 checksums 完整。
- [ ] Ki-Core Release 验证后再通知 Ki-Buddy 更新 pin。

### Ki-Buddy

- [ ] AionUi 上游同步范围明确。
- [ ] Ki-Buddy 定制变化已汇总。
- [ ] 固定的是完整 Ki-Core Release tag。
- [ ] Ki-Core 与 AionCore 映射正确。
- [ ] `CHANGELOG.ki-buddy.md` 包含三类变化。
- [ ] `bun.lock` 没有无关的大范围变化。
- [ ] CI 和六平台构建成功。
- [ ] updater metadata 与正式 tag 一致。
- [ ] Draft Release 资产和说明检查完成。
- [ ] 由 `xlihub` 公开发布。

## 16. 权限与职责边界

当前只有一个维护者，因此：

- `xlihub` 可以触发并批准发布。
- 发布审批允许 self-review。
- 自动化可以创建 PR、tag 和 Release，但不能自行决定是否接受上游版本。
- 自动化不能覆盖已公开 tag 和资产。
- 版本号、上游映射、CHANGELOG 和公开 Release 的最终责任属于 `xlihub`。

未来增加维护者后，优先调整审批规则，不需要重新设计双仓分支和版本模型。
