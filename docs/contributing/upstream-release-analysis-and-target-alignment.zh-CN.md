# 上游发版流程分析与 Ki 双仓目标流程

> 最近核对时间：2026-08-06
> 适用仓库：`xlihub/Ki-Buddy`、`xlihub/Ki-Core`
> 上游仓库：`iOfficeAI/AionUi`、`iOfficeAI/AionCore`

本文面向后续参与双仓维护的开发者。读完后，读者应当能够判断一项发版相关改动属于上游同步、Ki 产品版本管理，还是不必要的发布基础设施，并能按本文描述实现后续流程。

本文同时记录两类信息：

- **已观察现状**：来自 GitHub workflow、Release、PR、Actions 运行记录和仓库设置。
- **已确认目标**：Ki-Core 与 Ki-Buddy 采用的流程方向。Ki-Core 首次发布已经验证，Ki-Buddy 部分仍在实施。

不得把尚未实施的 Ki-Buddy 目标视为当前已经可用的自动化。实际操作前应同时查看[仓库管理者发版与维护手册](maintainer-release-and-maintenance-handbook.zh-CN.md)中的当前状态。

## 1. 仓库职责与分支模型

| 仓库     | `main` 的职责                          | `product/main` 的职责                                     | 产品版本        |
| -------- | -------------------------------------- | --------------------------------------------------------- | --------------- |
| Ki-Core  | 跟踪 AionCore 上游，不承载 Ki 产品提交 | 固定到选定的 AionCore 正式 tag，并保存 Ki-Core 产品层变更 | 独立于 AionCore |
| Ki-Buddy | 跟踪 AionUi 上游，不承载 Ki 产品提交   | 承载 Ki-Buddy 定制开发、上游同步和发布配置                | 独立于 AionUi   |

`product/main` 必须长期保留。即使 Ki-Core 当前没有源码二次开发，其 tag、二进制名称、版本历史和发布记录也已经属于 Ki-Core 产品，不能与 AionCore 混用。

“跟踪上游”是分支职责，不代表远端分支始终自动保持最新。2026-08-05 核对时，两个 Ki 仓库的 `main` 均落后于各自上游当前 `main`，仍需要后续同步。

## 2. AionCore 上游实际流程

AionCore 使用 Release Please 管理版本、tag、CHANGELOG 和 GitHub Release。

相关入口：

- [Release Please workflow](https://github.com/iOfficeAI/AionCore/blob/main/.github/workflows/release-please.yml)
- [Release workflow](https://github.com/iOfficeAI/AionCore/blob/main/.github/workflows/release.yml)
- [Release Please 配置](https://github.com/iOfficeAI/AionCore/blob/main/release-please-config.json)
- [AionCore Releases](https://github.com/iOfficeAI/AionCore/releases)

### 2.1 普通提交进入 `main`

功能和修复提交遵循 Conventional Commits。每次 `main` push 都触发 Release Please：

1. 普通提交进入 `main`。
2. Release Please 创建或更新 Release PR。
3. Release PR 更新 workspace version、manifest 和 `CHANGELOG.md`。
4. workflow 还会更新 `Cargo.lock` 并提交到 Release PR 分支。

Release PR 会持续汇集未发布的 `feat`、`fix`、`perf`、`refactor` 和文档变化。维护者通过合并时机决定发版时间。

### 2.2 合并 Release PR

Release PR 合并提交使用 `chore(main): release X.Y.Z`。Release Please workflow 根据提交标题进入发布分支：

1. 禁止继续创建 Release PR。
2. 创建 `vX.Y.Z` tag。
3. 创建公开 GitHub Release。
4. 显式 dispatch Release workflow。

显式 dispatch 很重要。由默认 `GITHUB_TOKEN` 创建的 tag 或 Release 不会继续触发新的 workflow，不能依赖 tag 事件自然传播。

### 2.3 构建和产物

Release workflow 从正式 tag 构建六个平台：

- macOS x64、arm64
- Linux x64、arm64
- Windows x64、arm64

发布资产包含六个平台 archive 和 `aioncore-checksums.txt`。

### 2.4 最近一次实际记录

[AionCore PR #775](https://github.com/iOfficeAI/AionCore/pull/775) 于 2026-08-05 合并并发布 `v0.1.59`：

- [Release Please run](https://github.com/iOfficeAI/AionCore/actions/runs/30982619932) 创建 tag 和 Release。
- [Release build run](https://github.com/iOfficeAI/AionCore/actions/runs/30982630958) 构建并上传资产。
- [v0.1.59 Release](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59) 最终包含六个平台资产和 checksums。

维护者的主要发版动作是合并 Release PR。AionCore 没有发布 Environment，也没有 Draft Release 审批阶段。

公开 Release 会先于构建资产出现。`v0.1.59` 的 Release 创建后约 13 分钟，六个平台资产才上传完成。这是上游接受的流程特征，不应误认为发布和资产上传是一个原子操作。

## 3. AionUi 上游实际流程

AionUi 没有使用 Release Please。它采用“版本准备 PR、手工正式 tag、Draft Release、人工发布”的方式。

相关入口：

- [Build and Release workflow](https://github.com/iOfficeAI/AionUi/blob/main/.github/workflows/build-and-release.yml)
- [Reusable Build workflow](https://github.com/iOfficeAI/AionUi/blob/main/.github/workflows/_build-reusable.yml)
- [Distribute Release Assets workflow](https://github.com/iOfficeAI/AionUi/blob/main/.github/workflows/release-distribute.yml)
- [AionUi Releases](https://github.com/iOfficeAI/AionUi/releases)

### 3.1 版本准备 PR

AionUi 仓库的版本维护说明规定：

1. 查询最新或指定的 AionCore Release。
2. 检查六个平台 archive 和 checksums 是否存在。
3. 更新 AionUi 自身版本和 `aioncoreVersion`。
4. 生成 `CHANGELOG.md`。
5. 运行质量检查和测试。
6. 创建版本准备 PR并合并。

AionUi 的 `CHANGELOG.md` 在一个版本条目中包含：

- `Desktop`：AionUi 自身变化。
- `Core`：所固定 AionCore 版本的变化。

版本准备流程允许 `--skip-core`。因此 AionUi 可以只发布前端变化，不要求每个 UI 版本都升级 AionCore。

### 3.2 正式 tag 和构建

Build and Release workflow 监听 `dev` push 和所有 tag push：

- `dev` push 会在构建成功后生成开发 tag。
- 正式 tag 不由 workflow 创建，需要维护者在版本 PR 合并后推送。
- 正式 tag 触发代码质量检查、六平台桌面构建和 Web CLI 打包。
- 构建完成后创建 Draft Release。

正式发布 job 使用 `release` Environment。2026-08-05 核对时，该 Environment 要求指定维护者审批；`dev-release` 没有审批规则。

### 3.3 Draft 发布与分发

构建完成后，维护者检查 Draft Release、Release Notes 和资产，然后手工发布。Release 发布事件再触发外部分发 workflow。

[AionUi PR #3852](https://github.com/iOfficeAI/AionUi/pull/3852) 和 [v2.1.47-final 构建](https://github.com/iOfficeAI/AionUi/actions/runs/30910954643) 展示了这条路径：

- PR 将 AionUi 更新到 `2.1.47`，并固定 AionCore `v0.1.58`。
- PR 合并后推送 `v2.1.47-final`。
- workflow 完成六平台构建并创建 Draft Release。
- [v2.1.47-final Release](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.47-final) 在第二天由维护者发布。

该版本的[外部分发任务](https://github.com/iOfficeAI/AionUi/actions/runs/30986701877)失败：tag 版本为 `2.1.47-final`，而 updater metadata 版本为 `2.1.47`。这说明上游流程也需要结合 Ki 产品语义审查，不能直接复制所有细节。

## 4. AionUi 与 AionCore 的实际发布关系

上游采用明确版本固定，没有实现跨仓库原子发布。

| AionCore  | 对应 AionUi             | 关系                                           |
| --------- | ----------------------- | ---------------------------------------------- |
| `v0.1.56` | `v2.1.45`               | AionUi 版本准备时固定最新 Core 正式版本        |
| `v0.1.57` | `v2.1.46`               | 同日完成对应更新                               |
| `v0.1.58` | `v2.1.47-final`         | AionUi CHANGELOG 同时包含 Desktop 和 Core 变化 |
| `v0.1.59` | 暂无对应 AionUi Release | 两仓并非同时完成发布                           |

“AionUi 跟随 AionCore”的实际含义是：

- 正式构建固定一个已发布的 AionCore tag。
- 版本准备时确认所需资产存在。
- AionUi CHANGELOG 记录 Core 更新内容。
- AionUi 可以在不更新 Core 的情况下独立发布。
- 手工构建可以使用 AionCore Actions run 做联调，正式构建仍使用固定 Release。

## 5. Ki 双仓当前状态

### 5.1 Ki-Core

已具备：

- `main` 与 `product/main` 双分支模型。
- Ki-Core 独立版本文件、tag 命名和 Release Please 配置。
- Ki-Core 与 AionCore 的映射文件。
- 上游 `CHANGELOG.md` 和 `CHANGELOG.ki-core.md`。
- 六平台 Candidate Build 与正式构建定义。
- `ki-core-stable` Environment，审批人为 `xlihub`，允许审批自己的发布请求。
- `ki-core-v*` tag 禁止更新和删除。

当前事实：

- [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0) 已于 2026-08-06 公开发布，对应 AionCore `v0.1.59`，peeled commit 为 `815e61ed9bbe942339347dc1e69ddce176cded76`。
- 最终 Release PR 是 [PR #9](https://github.com/xlihub/Ki-Core/pull/9)，发布分支为 `release-ki-core-v0.1.0`，合并提交和 tag 目标均为 `209e6844d39bac0762c61e198c1ba3a007f9dd2e`。
- [Release Please run](https://github.com/xlihub/Ki-Core/actions/runs/31068696569) 创建 tag 和公开 Release，并显式启动稳定版构建。
- [Ki-Core Stable Release run](https://github.com/xlihub/Ki-Core/actions/runs/31068791622) 完成六个平台构建、Linux GLIBC 基线检查、checksums 生成和资产上传。
- Release 最终包含六个平台 archive 和 `ki-core-checksums.txt`，不是 Draft 或 Prerelease。
- PR #9 已从 `autorelease: pending` 转为 `autorelease: tagged`；PR #3、#6 和 #8 的过期 pending 标签已移除。
- `main` 的上游镜像仍需要按日常维护流程持续更新，不影响已发布 `product/main` 的 AionCore `v0.1.59` 基线。

首次发布暴露了两个 Release Please 机器协议要求：Release PR 正文必须保留可解析的版本区块，发布分支也必须使用 Release Please 支持的命名。普通恢复分支即使标题和正文正确，仍不会被识别为 Release PR。

### 5.2 Ki-Buddy

Ki-Buddy 的产品发布层已经在功能分支实现：

- 根 `package.json` 保持为映射的 AionUi commit 原文件，产品字段不写回上游文件。
- `ki-buddy-version.txt` 管理 Ki-Buddy SemVer；`ki-buddy-product.json` 管理独立包名、appId、可执行文件名、协议、Web CLI 身份和 Ki-Core pin。
- 构建时生成 electron-builder overlay，通过 `extraMetadata` 形成安装包内最终 `package.json`。
- `ki-buddy-versions.json` 保存 Ki-Buddy、AionUi、Ki-Core、AionCore 的确定映射；`CHANGELOG.ki-buddy.md` 保存三类产品变化。
- 正式构建固定消费 Ki-Core Release，并验证 checksums、archive 和来源；bundle manifest schema 3 同时记录四层身份。
- `ki-buddy-v*` tag 触发代码质量、六平台桌面构建和 Web CLI 构建；全部成功后进入 `ki-buddy-stable` 审批并创建 Draft Release。

这一结构允许后续逐步替换运行时中的 AionUi 品牌内容，同时把经常变化的上游 `package.json` 与 Ki-Buddy 产品语义分开管理。

## 6. 已验证的 Ki-Core 目标流程

Ki-Core 短期继续保持与 AionCore 正式版本相同的发布节奏，同时管理自己的版本号。

```text
AionCore 发布正式 tag
  → 创建 Ki-Core 上游同步 PR
  → product/main 固定到该 AionCore tag
  → Release Please 创建或更新 Ki-Core Release PR
  → xlihub 合并并批准发布
  → 创建 ki-core-vX.Y.Z 和公开 GitHub Release
  → 六平台构建并上传 archive 与 checksums
```

### 6.1 版本规则

- 每个被接受的 AionCore 正式版本对应一个 Ki-Core 正式版本。
- Ki-Core 与 AionCore 的数字不需要相同。
- 纯上游同步默认作为 Ki-Core patch，例如：
  `Ki-Core 0.1.1 ↔ AionCore v0.1.60`（仅作版本关系示例）。
- 未来 Ki-Core 自有 `feat`、`fix` 继续参与 Ki-Core SemVer 计算。
- AionCore 的 Cargo workspace version、API 和协议版本不改写为 Ki-Core 版本。

### 6.2 映射规则

映射记录只保存已经确定的事实：

- Ki-Core version
- Ki-Core tag
- AionCore tag
- AionCore peeled commit

已经发布的映射是 append-only，不得修改。当前尚未发布的版本允许在正式 tag 创建前修正映射。`prepared`、`candidate-built` 等过程状态不写入长期映射，以免失败后留下错误状态。

### 6.3 CHANGELOG 规则

- `CHANGELOG.md`：保持 AionCore 上游内容，随上游源码同步。
- `CHANGELOG.ki-core.md`：记录 Ki-Core 自身变化，以及本次同步的 AionCore tag 和 compare 链接。

### 6.4 构建规则

- 正式发布从 Ki-Core tag 直接构建六个平台。
- 保留手工 Candidate Build，供 Ki-Buddy 联调使用。
- Candidate Build 不再作为正式发布的必填输入，也不要求正式发布重复证明一次 Candidate Build 身份。
- 正式资产至少包含六个平台 archive 和 checksums。
- 当前阶段不要求复杂的发布状态历史和多次远端资产回读。

### 6.5 Release Please 对齐

Ki-Core Release Please 已与 AionCore 保持同一状态机：

- 普通 `product/main` push：创建或更新 Release PR。
- Release PR 合并：创建 tag/Release，并显式 dispatch 构建。
- Release merge commit 不得再生成下一版本 PR。
- `xlihub` 的发布审批保留在正式发布入口。

Ki-Core 同时支持 GitHub 默认 merge commit 和 squash merge。发布判断检查完整提交信息是否包含 Release Please 的 `chore(product/main): release ...` 标题，因此合并时不得删除该标题。

Release PR 的标题、正文、标签和分支名共同构成机器协议：

- 常规流程使用 Release Please 自动创建的 `release-please--branches--product/main--components--ki-core` 分支。
- 恢复既有版本时允许使用 `release-ki-core-vX.Y.Z`。
- 任意 `feat/*`、`fix/*` 或普通 `release/*` 分支不能代替上述发布分支。
- 正文必须保留两个 `---` 分隔符和 `## [X.Y.Z]` 版本标题。
- 合并前必须保留 `autorelease: pending`；成功创建 tag 后应由 Release Please 改为 `autorelease: tagged`。

## 7. 已确认的 Ki-Buddy 目标流程

Ki-Buddy 短期会进行二次开发，因此需要同时管理上游变化、定制变化和 Ki-Core 更新。

```text
同步 AionUi 上游
  + Ki-Buddy 定制提交进入 product/main
  + Ki-Core 发布正式版本
  → 创建 Ki-Buddy 版本准备 PR
  → 更新 Ki-Buddy 版本和固定 Ki-Core tag
  → 生成 Ki-Buddy 产品 CHANGELOG
  → xlihub 合并
  → 推送正式 tag
  → 六平台构建与 Draft Release
  → xlihub 检查并发布
```

### 7.1 Core 消费规则

- Ki-Buddy 正式构建只消费 `xlihub/Ki-Core` 的固定正式 tag。
- 正式构建不得使用 `latest` 或 Candidate Build。
- 手工构建允许使用一个明确的 Ki-Core Actions run 做联调。
- 正式下载保留 checksum 验证和 archive 安全解压。
- Candidate provenance 可以服务联调，但不进入正式发布的强依赖链。

### 7.2 CHANGELOG 规则

- `CHANGELOG.md`：保持 AionUi 上游内容。
- `CHANGELOG.ki-buddy.md`：每个版本包含三类信息：
  - Ki-Buddy 定制开发变化。
  - 本次同步的 AionUi 上游变化。
  - Ki-Core 更新，以及该 Ki-Core 对应的 AionCore 版本。

### 7.3 发布节奏

Ki-Core 正式 Release 发布后，自动化可以创建或更新 Ki-Buddy 版本准备 PR。自动化不得直接发布 Ki-Buddy。

这样可以让 Ki-Buddy及时跟进 Ki-Core，也给 `xlihub` 留出合并同期定制开发、同步 AionUi 和编辑 Release Notes 的时间。

## 8. 设计取舍

| 能力                                  | 决定 | 理由                                           |
| ------------------------------------- | ---- | ---------------------------------------------- |
| 双仓 `main` + `product/main`          | 保留 | 区分上游镜像与产品历史                         |
| Ki-Core 独立 SemVer、tag、映射        | 保留 | 二进制和发布属于 Ki-Core 产品                  |
| 两份 CHANGELOG                        | 保留 | 上游内容与 Ki 产品内容职责不同                 |
| 六平台构建与 checksums                | 保留 | 与上游平台支持一致，供 Ki-Buddy 固定消费       |
| 正式构建固定 Ki-Core tag              | 保留 | 保证 Ki-Buddy 构建可重复                       |
| archive 安全解压                      | 保留 | 下载外部 archive 时属于必要安全边界            |
| Candidate 作为正式发布前置            | 移除 | 增加一次六平台构建，不能证明正式构建二进制相同 |
| 复杂状态历史                          | 移除 | 过程失败容易留下失真的长期状态                 |
| 多阶段 Draft 查找、回读和原子发布脚本 | 简化 | 当前需求没有要求自建完整发布事务               |
| Ki-Buddy 三状态来源策略               | 简化 | 正式、手工联调、本地开发可以用更直接的入口表达 |

## 9. 实施状态与后续顺序

Ki-Core 部分已经完成：

1. 错误的 Ki-Core PR #6 已关闭，没有创建 `0.2.0`。
2. Release Please 已与 AionCore 状态机对齐。
3. 正式发布已移除 Candidate run 前置依赖。
4. Ki-Core 映射、验证器和双 CHANGELOG 已采用简化方案。
5. 首个映射确定为 `Ki-Core 0.1.0 ↔ AionCore v0.1.59`。
6. `ki-core-v0.1.0`、六个平台资产和 checksums 已完成发布验证。

Ki-Buddy 当前实施状态：

1. AionUi 正式上游基线和 Ki-Core 正式 pin 已对齐。
2. 独立版本、四层映射、产品 CHANGELOG 和动态产品配置已建立。
3. 正式 tag workflow 已改为六平台构建、Environment 审批和 Draft Release。
4. 合并前仍需完成本地全量验证；首次发布前还需配置 GitHub Environment、tag 保护和签名/Sentry secrets。

## 10. 不在当前范围内

- Ki-Core Rust 源码、API、协议和数据库迁移的二次开发。
- 自动合并上游同步 PR。
- 自动公开发布 Ki-Core 或 Ki-Buddy。
- 覆盖、移动或删除已经公开的产品 tag。
- 为了同步上游而重写整个 AionUi/AionCore workflow 体系。
