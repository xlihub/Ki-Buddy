# Ki-Buddy Changelog

本文件记录 Ki-Buddy 产品变化、AionUi 上游变化，以及每个版本固定的 Ki-Core/AionCore 来源。
上游 AionUi 的原始变更记录继续保存在 [`CHANGELOG.md`](CHANGELOG.md)。

## [0.1.4] - 2026-08-25

### Ki-Buddy 定制变化

- 增加 Agents 平台账户登录、退出和会话生命周期，并按 Agents 部署与平台账户隔离本地状态；默认使用简体中文产品体验。
- 建立 Ki-Buddy 独立品牌、主题、引导页和产品体验策略，统一控制设置、主工作区、资源访问及不可用功能的运行生命周期。
- 内置 Agents MCP Adapter 和 Agents 执行助手，支持 catalog inventory、精确 schema 描述、session cache、单 Agent 直接调用及经授权的本地文件上传。
- 修复 macOS Dock 图标主体占满画布导致视觉尺寸过大的问题，并增加 ICNS 透明边距回归检查。
- 修复正式发布的版本校验和 Draft Release 任务在安装依赖前调用产品发布脚本的问题，并增加覆盖相关 CI/CD job 的依赖安装顺序策略检查。
- `ki-buddy-v0.1.2` 在版本校验阶段失败；`ki-buddy-v0.1.3` 已通过六平台构建、Web CLI 打包和资产校验，但在生成 Release Notes 时失败。两个 tag 均未创建 GitHub Release，继续保留且不移动；本版本使用相同产品映射恢复正式发布。

### AionUi 上游更新

- 继续基于 [AionUi v2.1.49](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.49)，commit `28a2a9f57f1bf4f9111b9c33e0cfc1eb918effc8`；本版本没有引入新的 AionUi 上游变化。

### Ki-Core 更新

- 从最近公开 Ki-Buddy 版本使用的 [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0) 累计更新到 [Ki-Core 0.1.2](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.2)，release commit `59c32d9284dd33b344e286404a6292d39df323a0`。
- 累计包含 Ki-Core 0.1.1 的 Agents 执行助手，以及 Ki-Core 0.1.2 的调用前文件上传规则；完整差异见 [ki-core-v0.1.0...ki-core-v0.1.2](https://github.com/xlihub/Ki-Core/compare/ki-core-v0.1.0...ki-core-v0.1.2)。
- Ki-Core 仍对应 [AionCore v0.1.59](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59)，peeled commit `815e61ed9bbe942339347dc1e69ddce176cded76`。

## [0.1.3] - 2026-08-24

### Ki-Buddy 定制变化

- 增加 Agents 平台账户登录、退出和会话生命周期，并按 Agents 部署与平台账户隔离本地状态；默认使用简体中文产品体验。
- 建立 Ki-Buddy 独立品牌、主题、引导页和产品体验策略，统一控制设置、主工作区、资源访问及不可用功能的运行生命周期。
- 内置 Agents MCP Adapter 和 Agents 执行助手，支持 catalog inventory、精确 schema 描述、session cache、单 Agent 直接调用及经授权的本地文件上传。
- 修复 macOS Dock 图标主体占满画布导致视觉尺寸过大的问题，并增加 ICNS 透明边距回归检查。
- 修复正式发布校验在安装依赖前读取产品映射，导致干净 runner 缺少 `js-yaml` 而失败的问题。
- `ki-buddy-v0.1.2` 在版本校验阶段失败，没有开始六平台构建，也没有创建 GitHub Release；该 tag 保留且不移动，本版本使用相同产品映射恢复正式发布。

### AionUi 上游更新

- 继续基于 [AionUi v2.1.49](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.49)，commit `28a2a9f57f1bf4f9111b9c33e0cfc1eb918effc8`；本版本没有引入新的 AionUi 上游变化。

### Ki-Core 更新

- 从最近公开 Ki-Buddy 版本使用的 [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0) 累计更新到 [Ki-Core 0.1.2](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.2)，release commit `59c32d9284dd33b344e286404a6292d39df323a0`。
- 累计包含 Ki-Core 0.1.1 的 Agents 执行助手，以及 Ki-Core 0.1.2 的调用前文件上传规则；完整差异见 [ki-core-v0.1.0...ki-core-v0.1.2](https://github.com/xlihub/Ki-Core/compare/ki-core-v0.1.0...ki-core-v0.1.2)。
- Ki-Core 仍对应 [AionCore v0.1.59](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59)，peeled commit `815e61ed9bbe942339347dc1e69ddce176cded76`。

## [0.1.2] - 2026-08-24

### Ki-Buddy 定制变化

- 增加 Agents 平台账户登录、退出和会话生命周期，并按 Agents 部署与平台账户隔离本地状态；默认使用简体中文产品体验。
- 建立 Ki-Buddy 独立品牌、主题、引导页和产品体验策略，统一控制设置、主工作区、资源访问及不可用功能的运行生命周期。
- 内置 Agents MCP Adapter 和 Agents 执行助手，支持 catalog inventory、精确 schema 描述、session cache、单 Agent 直接调用及经授权的本地文件上传。
- 修复 macOS Dock 图标主体占满画布导致视觉尺寸过大的问题，并增加 ICNS 透明边距回归检查。

### AionUi 上游更新

- 继续基于 [AionUi v2.1.49](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.49)，commit `28a2a9f57f1bf4f9111b9c33e0cfc1eb918effc8`；本版本没有引入新的 AionUi 上游变化。

### Ki-Core 更新

- 从上一公开 Ki-Buddy 版本使用的 [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0) 累计更新到 [Ki-Core 0.1.2](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.2)，release commit `59c32d9284dd33b344e286404a6292d39df323a0`。
- 累计包含 Ki-Core 0.1.1 的 Agents 执行助手，以及 Ki-Core 0.1.2 的调用前文件上传规则；完整差异见 [ki-core-v0.1.0...ki-core-v0.1.2](https://github.com/xlihub/Ki-Core/compare/ki-core-v0.1.0...ki-core-v0.1.2)。
- Ki-Core 仍对应 [AionCore v0.1.59](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59)，peeled commit `815e61ed9bbe942339347dc1e69ddce176cded76`。

## [0.1.1] - 2026-08-07

### Ki-Buddy 定制变化

- 修复正式 tag 构建无法解析 AionUi 上游 tag 的问题；正式校验会先从版本映射中读取并验证上游仓库与 tag，再获取对应 tag。
- 将产品映射改为只描述当前待发布版本；历史来源继续由不可变 Ki-Buddy tag、CHANGELOG 和 Release provenance 保存。
- `ki-buddy-v0.1.0` 在版本校验阶段失败，没有开始六平台构建，也没有创建 GitHub Release；该 tag 保留且不移动，本版本作为首次正式发布恢复版本。

### AionUi 上游更新

- 继续基于 [AionUi v2.1.49](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.49)，commit `28a2a9f57f1bf4f9111b9c33e0cfc1eb918effc8`；本版本没有引入新的 AionUi 上游变化。

### Ki-Core 更新

- 继续固定 [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0)，release commit `209e6844d39bac0762c61e198c1ba3a007f9dd2e`。
- Ki-Core 仍对应 [AionCore v0.1.59](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59)，peeled commit `815e61ed9bbe942339347dc1e69ddce176cded76`。

## [0.1.0] - 2026-08-06

### Ki-Buddy 定制变化

- 建立 Ki-Buddy 独立产品版本、版本映射、版本准备校验和正式发布流程。
- 正式构建固定消费 Ki-Core Release，校验六个平台 checksums、archive 内容和来源信息。
- 手工构建保留 Ki-Core Candidate Build 联调入口，本地开发保留显式本地 binary/bundle。

### AionUi 上游更新

- 基线更新到 [AionUi v2.1.49](https://github.com/iOfficeAI/AionUi/releases/tag/v2.1.49)，commit `28a2a9f57f1bf4f9111b9c33e0cfc1eb918effc8`。
- 增加音频附件、语音输入、结构化问题卡片和 ACP 命令实时终端卡片。
- 增加 Team 消息与任务活动视图，并完善按项目保存的预览面板。
- 包含移动端文件操作、长任务会话状态、慢速后端启动和 agent 进程清理等修复。

### Ki-Core 更新

- 固定 [Ki-Core 0.1.0](https://github.com/xlihub/Ki-Core/releases/tag/ki-core-v0.1.0)，release commit `209e6844d39bac0762c61e198c1ba3a007f9dd2e`。
- Ki-Core 对应 [AionCore v0.1.59](https://github.com/iOfficeAI/AionCore/releases/tag/v0.1.59)，peeled commit `815e61ed9bbe942339347dc1e69ddce176cded76`。
- AionCore 提供原生图片/音频内容块、Team mailbox/task API 与实时事件；Aion CLI runtime 更新到 `v0.2.9`。
