---
status: accepted
---

# 在 Adapter 内安全交付远端结果文件

Agents MCP Adapter 只识别 Bridge `result.outputs` 中的结构化文件输出，在确定性边界内下载并写入当前 Ki-Core effective workspace。用户选择项目时写入项目 workspace；未选择时写入当前 Core 用户的自动 workspace。远端 URI 不进入模型、conversation/Team 消息、结果 Markdown、普通日志或 invocation ledger。

默认只允许当前 Agents `base_url` 同源结果；部署管理员可以通过 MCP env 配置额外精确 origin，每次重定向都重新校验且不转发 Agents 凭据。下载使用流式传输、受控临时文件和不可覆盖的最终发布；单文件与单次 invoke 累计字节预算由 env 配置，默认 500 MiB 和 1 GiB。

## Considered Options

- 由 Assistant 调用普通下载工具：会让不可信 URI 进入模型和历史。
- 在 Ki-Core 或主进程解析 Agents 输出：会把 Agents 特有 contract 分散到 Adapter 之外。
- 建立 Ki-Buddy 全局结果目录：需要第二套账号归属、清理和导出模型，也违背项目 workspace 选择。

## Consequences

- 不对结果文件数量设置固定上限，但下载必须使用有界并发或顺序处理，共享累计预算；大量小文件的请求和 inode 风险是首发已知限制。
- 文件名、路径、类型、大小和内容都视为不可信。路径只取清理后的 basename；同名时原子创建递增序号副本，绝不覆盖 workspace 现有文件。
- 远端 invoke 终态与本地文件交付状态分别记录。远端完成但部分文件未交付时保留已成功文件并标记 `partial` 或 `failed`，不能自动重新 invoke。
- 可重试的交付失败可以在当前 Adapter session 内通过一次性 `deliveryRef` 只重试未交付文件；引用不持久化，不能跨账号、部署、session 或 Adapter 重启恢复。Team 中由 Lead 让用户选择重试或接受当前结果。
- 成功发布后的结果沿用普通本地文件预览和系统打开体验，不自动打开，不增加 Agents 专用来源标签、类型 denylist 或警告层；恶意文件风险必须如实记录。
- 项目 workspace 受操作系统权限约束，不按 Agents 账户隔离；自动 workspace 继续遵循 Ki-Core 的 Core 用户和会话生命周期。
