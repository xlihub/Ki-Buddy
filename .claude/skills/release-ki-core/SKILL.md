---
name: release-ki-core
description: 管理 xlihub/Ki-Core 的发布维护写操作与监控，包括选择后的 AionCore 上游同步、Release Please 版本 PR、tag/Environment 审批等待、Actions 失败恢复、正式 Release 核验和 worktree 清理。仅用于 Ki-Core；只读状态检查和候选分析使用 ki-release-maintenance。
---

# Ki-Core 发布维护

在管理员已经选择发布基准和 Ki-Core 目标版本后，执行 Ki-Core 同步与发布。把每个仓库或 GitHub 状态变更作为独立确认点，保留管理员对基准、版本、PR、tag 和重试的决定权。

## 权威资料

按当前任务读取以下文件，不在本 skill 重复长期规则：

- `CONTEXT.md`：使用“上游候选版本”“发布基准”“独立发布节奏”等领域术语。
- `.claude/skills/ki-release-maintenance/SKILL.md`：发现 Ki 双仓、建立当前版本映射、筛选候选版本以及按 PR、Actions run 或 tag 恢复状态。
- `docs/adr/0001-ki-independent-release-cadence.md`：解释发布基准为何由管理员选择。
- `docs/contributing/maintainer-release-and-maintenance-handbook.zh-CN.md`：读取候选完整性、Ki-Core 日常发布、失败分类和重跑规则。
- `docs/contributing/upstream-release-analysis-and-target-alignment.zh-CN.md`：读取 Ki-Core 分支模型、Release Please 机器协议、映射和资产职责。
- 选定 Ki-Core clone 中的 `AGENTS.md`、发布配置、发布 workflows 和发布验证器：以目标仓库当前实现确定命令、资产名称、分支协议、Environment 和 workflow/job 名称。

管理员可见说明使用简体中文；命令、路径、API 名、tag、branch、workflow 和 label 保留原文。

## 仓库和权限边界

只操作 Git remote 规范化后严格等于 `xlihub/Ki-Core` 的 clone。`origin` 不匹配、仓库身份无法验证或目标是 Ki-Buddy、AionCore、AionUi 时停止。

开始前执行只读检查：

1. 使用 `ki-release-maintenance` 的仓库发现规则选择唯一 Ki-Core clone，不自动 clone。
2. 读取 `git status --short --branch`、`git worktree list --porcelain`、remote、当前 branch 和 HEAD。
3. 运行 `gh auth status --active --hostname github.com`，再用只读 API 验证当前账号对 `xlihub/Ki-Core` 的权限。认证或权限不足时停止写操作。
4. 读取远端 `product/main`、开放 PR、版本准备与正式构建 runs、tag 和 Release，避免重复创建对象。

保持以下边界：

- 在专用 git worktree 中准备所有本地变更。保留原工作树和其中未提交的修改，不执行 `stash`。
- 不覆盖、移动或删除已经公开的 tag、Release 资产或已发布映射。
- 不手工创建 Ki-Core tag。目标仓库的 Release Please 在其发布 Environment 获得管理员审批后创建 tag；该审批就是独立的 tag 创建确认。
- 不代替管理员批准 GitHub Environment，也不把聊天中的确认解释为 GitHub Environment approval。
- PR 合并或关闭前保留对应 worktree。清理 worktree 和删除 branch 分别确认。
- 检测到冲突、身份不一致、来源证据缺失或确定性失败时停止当前写入阶段。

## 每次写操作的确认卡

任何改变本地文件、Git refs、GitHub 对象或 Actions 状态的命令执行前，输出一张确认卡并等待管理员明确回复。一次确认只授权卡片中列出的紧邻操作，不授权后续阶段。

```text
目标仓库：xlihub/Ki-Core（本地绝对路径）
base：product/main（远端 HEAD SHA）
branch：分支名；不适用时写“无”
当前 AionCore 发布基准：tag / peeled commit
目标 AionCore 发布基准：tag / peeled commit
当前 Ki-Core 版本：X.Y.Z
目标 Ki-Core 版本：X.Y.Z
预计修改内容：文件、ref、PR、run 或 worktree 的精确清单
将执行的命令：完整命令及工作目录
确认选择：1. 执行本项  2. 停止
```

以下操作都需要各自的确认卡：下载资产到临时目录、`fetch`、创建 worktree/branch、合并上游 tag、编辑文件、commit、`just push`、创建 PR、合并 PR、手工 dispatch workflow、重跑 workflow、移除 worktree、删除 branch。只读查询可以合并执行。

命令或目标在确认后发生变化时，原确认失效，重新展示确认卡。不得用一个“确认整个发布”的回复连续执行多个阶段。

## 1. 恢复状态并取得管理员选择

用户提供 PR、Actions run 或 tag 时，先按 `ki-release-maintenance` 的恢复规则重建状态，不依赖之前的会话。识别目标仓库、base/head、head SHA、版本映射、关联 workflow 和 Release 后，从尚未完成的第一个阶段继续。

开始新发布时分别取得两个明确选择：

1. AionCore 发布基准：保留当前基准，或选择一个已经验证完整的 AionCore Release。
2. Ki-Core 目标版本：管理员给出的稳定 SemVer `X.Y.Z`。

先展示 SemVer 建议及证据。纯 AionCore 同步通常建议 patch；Ki-Core 自有 `feat`、`fix` 和 breaking change 按目标仓库的 `release-please-config.json` 计算。建议不得成为默认选择，也不得替管理员选择版本。

校验目标 Ki-Core 版本：

- 高于最近公开 Ki-Core 版本。
- `ki-core-vX.Y.Z` 在本地和远端均不存在。
- `ki-core-versions.json` 中没有同版本或同 tag 的已发布条目。
- 与管理员选择完全一致，不从 Release Please 的建议反推管理员选择。

管理员保留当前 AionCore 发布基准时，不创建上游同步 PR；只有存在尚未发布的 Ki-Core 产品提交时才继续版本准备。没有可发布变化时停止。

## 2. 验证 AionCore 发布基准

对管理员选择的 AionCore Release 自动核验以下证据。任一项不成立时，把它列为“尚不完整”，停止同步：

1. Release 存在，`isDraft=false`、`isPrerelease=false` 且 `publishedAt` 非空。
2. 远端 tag 同时读取 direct ref 和 `^{}` ref；annotated tag 使用 peeled commit，lightweight tag 使用 direct commit。记录完整 40 位 SHA。
3. 目标 tag 的 Release workflow 已完成且成功，`headSha` 与 peeled commit 相同。
4. 从目标 tag 内的发布 workflow 和验证脚本读取“资产完整性证据”：完整平台类别集合、每类唯一的预期 archive 名称，以及 checksums 资产名称。验收要求该集合包含六个平台类别；目标 tag 的契约数量不同时，报告契约变化并停止，不复用其他 tag 或当前默认分支的资产矩阵。
5. Release 包含资产完整性证据要求的全部 archive 和 checksums；checksums 恰好覆盖完整 archive 集合，没有重复或额外条目。
6. 经确认后把资产完整性证据要求的全部资产下载到新建的临时目录，使用 checksums 验证实际字节。报告临时目录；只删除经过精确路径校验的该目录。

只保存目标 tag 的 peeled commit。后续同步合并这个 commit，不合并、rebase 或 cherry-pick tag 之后的 `upstream/main` 提交。另行记录 tag 后的上游 HEAD 仅供报告。

## 3. 检查 Ki-Core 发布状态机

创建同步 PR 前，从目标 clone 读取并验证当前发布状态机：

- `product/main`、`ki-core-version.txt`、`ki-core-upstream.json`、`ki-core-versions.json` 和最近公开 tag 相互一致。
- 从元数据验证器读取已发布基准文件、待发布基准文件和 source diff 基准；同步 PR 必须只更新待发布基准，并保持已发布基准和历史映射不变。
- 从 Release Please workflow 读取待发布基准的提升步骤；版本 PR 必须把它提升为已发布基准、删除待发布状态，并在新的 `ki-core-version.txt` 版本下增加映射。
- Release Please workflow 仍把版本 PR 更新与 tag/Release 创建分成两条独立路径。

把目标 clone 的验证器和 workflow 作为该协议的唯一事实来源；记录实际文件名和提升命令。缺少上述任一状态转换、同步 PR 必须改写已发布基准或历史映射才能通过时，报告确定性状态机缺口并停止。要求先通过普通修复 PR 调整验证器或 Release Please 映射时序。不得通过以下方式规避：

- 修改已经发布的映射。
- 把同步 PR 与 Release Please 版本 PR 合成一个 PR。
- 暂时关闭验证器或降低 CI 要求。
- 创建一个已知无法通过检查的 PR。

## 4. 准备独立上游同步 PR

仅在管理员选择新 AionCore 发布基准时执行。

### 4.1 建立专用 worktree

依次展示确认卡并执行：

1. 更新所需的 `origin/product/main` 和选定 AionCore tag refs；只获取明确 ref。
2. 从刚验证的 `origin/product/main` SHA 创建新 branch 和专用 worktree。建议 branch 为 `fix/sync-aioncore-<tag>`，worktree 使用管理员确认的绝对路径。

创建后重新核对 worktree 的 branch、HEAD、remote 和空工作树。路径已存在、branch 已存在或 HEAD 不等于确认卡中的 base SHA 时停止。

### 4.2 合入精确 tag

展示确认卡后，在专用 worktree 中以 `--no-commit --no-ff` 合并已验证的 peeled commit。合并对象必须等于确认卡中的 40 位 SHA。

出现冲突时：

1. 保留 merge 状态和 worktree。
2. 输出冲突文件、base、目标 tag、peeled commit 和已执行命令。
3. 转交 `/resolving-merge-conflicts`。
4. 冲突解决并完成验证前，不 commit、不 push、不创建 PR。

无冲突时，按第 3 节读到的目标仓库契约更新待发布基准文件，保留已发布基准、历史映射、Ki-Core 发布 workflow、独立版本文件、`CHANGELOG.ki-core.md` 和其他产品 overlay。`CHANGELOG.md` 使用选定 AionCore tag 的内容。

确认差异只包含：

- 从当前发布基准到目标 peeled commit 的上游累计变化。
- 待发布基准中的新 AionCore tag 和 peeled commit。
- 为保留既有 Ki-Core 产品 overlay 所需的冲突处理结果。

运行目标仓库要求的元数据测试、workflow contract 测试、格式、lint 和完整 workspace 测试。任何失败都停止；不得创建不完整 PR。

### 4.3 commit、push 和创建 PR

commit、push、创建 PR 分别展示确认卡。

- 使用 `fix(upstream): sync AionCore <tag>` 作为常规同步提交标题，使 Release Please 按现行 SemVer 规则识别 patch 变化。
- push 使用目标仓库要求的 `just push -u origin <branch>`，不得绕过 pre-push gate。
- PR base 固定为 `product/main`。正文记录 AionCore tag、peeled commit、compare、资产完整性证据、changed paths、兼容性信号、预计 Ki-Core 目标版本和实际验证命令。
- 不在同步 PR 中修改 `ki-core-version.txt`、Release Please 生成的版本区块或已经发布的映射。

读取 PR 返回的 number、head SHA 和 URL，监控所有 required checks。检查失败、head SHA 改变或 base 改变时停止并更新报告。

### 4.4 合并同步 PR

required checks 全部成功后，展示只包含同步 PR 合并命令的确认卡。命令使用 `--match-head-commit <verified-head-sha>`，避免管理员确认后 PR 内容发生变化。

合并后验证：

- `product/main` 包含所选 peeled commit。
- 合并范围不包含该 tag 之后的 AionCore 提交。
- 待发布基准文件记录所选 tag 和 peeled commit，已发布基准和历史映射仍保持不变。
- 目标仓库的 Release Please 已创建或更新独立版本 PR。

任一项失败时停止版本准备。

## 5. 核验 Release Please 版本 PR

优先等待同步 PR 合并后的版本 PR 更新 job。只有自动运行没有产生版本 PR，且从目标 workflow 证明存在只更新版本 PR 的 `workflow_dispatch` 输入时，才展示该精确命令的确认卡；这次 dispatch 不得进入 tag/Release 创建路径。

不要仅凭标题识别版本 PR。共同核验：

- repository 为 `xlihub/Ki-Core`，base 为 `product/main`。
- branch 符合从目标仓库读取的 Release Please 常规分支协议。
- 正文保留可解析的版本区块和分隔符。
- `autorelease: pending` 存在。
- `ki-core-version.txt` 等于管理员选择的目标版本。
- `CHANGELOG.ki-core.md` 包含本次 Ki-Core 变化和 AionCore tag/compare。
- 已发布基准已经提升为选定 AionCore tag 和 peeled commit，待发布基准文件已经删除。
- `ki-core-versions.json` 新增目标版本并引用新的已发布基准；历史条目不变。
- 元数据、workflow contract、CI 和 required checks 全部成功。

生成版本与管理员选择不同时，不编辑 PR 标题、正文、版本文件或映射来掩盖差异。报告 Release Please 的计算证据，等待管理员决定新的目标版本，或要求通过普通修复 PR 修正发布状态机。

## 6. 分别确认合并与 tag 创建

### 6.1 合并版本 PR

展示仅授权合并 Release Please PR 的确认卡，包含已验证 head SHA 和管理员选择的目标版本。使用 `--match-head-commit` 合并，保留 Release Please 的发布提交标题和机器协议。

合并成功后读取新的 `product/main` release commit 和 Release Please run。此时不执行 `git tag`、`gh release create` 或 Environment approval。

### 6.2 等待管理员批准 tag 创建

当负责创建 tag/Release 的 job 等待目标仓库配置的发布 Environment 时，展示：

- repository、workflow、run ID 和 URL。
- Release PR、release commit、目标 tag 和 AionCore 映射。
- 管理员批准后将创建的 tag/Release，以及随后 dispatch 的稳定版 workflow。

等待管理员明确确认 tag 内容，再要求管理员在 GitHub Environment 页面亲自批准。skill 不调用审批 API。管理员完成审批后重新读取 run，核验 tag 确由已确认的 release commit 创建。

## 7. 监控、恢复与失败处理

持续监控到以下状态之一：运行成功、确定失败、等待 Environment 审批或管理员停止。不得以固定等待时间推断失败。

恢复输入可以是：

- PR：读取 files、base/head SHA、checks、labels 和 merge 状态。
- Actions run：读取 workflow、attempt、event、headBranch、headSha、jobs、status、conclusion 和 URL。
- tag：解析到 commit，读取关联 Release 和同 commit 的 workflow runs。

失败分类：

| 分类       | 证据                                                              | 允许的下一步                                         |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 瞬时失败   | 网络、GitHub API、runner 临时故障；代码、配置和映射无需变化       | 同一 tag、commit、workflow 在单独确认后重跑          |
| 确定性失败 | 编译、测试、验证器、映射、权限配置或资产规则需要代码/配置发生变化 | 普通修复 PR；公开 tag 已存在时发布新的 Ki-Core patch |
| 证据不足   | 查询失败、日志缺失或无法证明 tag/commit/workflow 身份             | 重新读取证据，不重跑                                 |

重跑前再次读取原 run 和当前 tag，确认 workflow、tag、commit 三者与失败 attempt 完全相同。展示 `gh run rerun ... --failed` 或等价命令的确认卡；管理员确认后才执行。不得为不同 commit 重用同一公开 tag，不得手工替换部分资产。

## 8. 完成核验

同时满足以下条件才报告 Ki-Core 发布完成：

1. `ki-core-vX.Y.Z` 解析到已确认的 Release Please merge commit，且该 commit 位于 `product/main`。
2. GitHub Release 已公开，非 Draft、非 Prerelease，tag 和 commit 一致。
3. 目标 tag 触发的正式构建 workflow 对同一 tag 和 commit 成功完成。
4. 按“资产完整性证据”的同一程序重新读取目标 Ki-Core tag 的完整 archive 集合和 checksums 要求，并确认全部存在。
5. 经确认后下载证据要求的全部资产，并验证 checksums 与实际字节一致。
6. `ki-core-version.txt`、`ki-core-upstream.json`、`ki-core-versions.json`、`CHANGELOG.ki-core.md`、tag 和 Release provenance 相互一致。
7. Release Please PR 已从目标仓库定义的待发布状态进入成功状态，且没有由 release merge commit 错误生成下一版本 PR。

人工安装测试可以另行记录，不属于完成条件。报告数据来源、检查时间、PR、run、tag、Release URL、资产完整性证据、版本映射、provenance 和无法验证的字段。

## 9. 清理专用 worktree

只有相关 PR 已合并或关闭且 worktree 没有需要保留的修改时，才提供清理选择：

1. 保留 worktree，稍后处理。
2. 移除明确路径的 worktree。

管理员选择移除后，先展示确认卡，再运行针对该绝对路径的 `git worktree remove`。branch 删除属于另一个写操作，重新展示确认卡。不得自动使用 `--force`；worktree 有修改时报告文件并停止。
