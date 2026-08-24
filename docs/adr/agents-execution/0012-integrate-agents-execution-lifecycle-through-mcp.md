---
status: accepted
---

# 通过 MCP 接入 Agents 执行生命周期

Ki-Buddy 是运行在用户电脑上的 MCP 客户端。它通过官方 Assistant 和内置 Agents MCP Adapter 调用 Agents 暴露的接口，但不拥有 Agents execution lifecycle。Ki-Buddy 不生成远端 taskId，不维护 invocation ledger，不为远端调用取得本地 dispatch 资格，也不在断线、超时、进程退出或 App 重启后推断或恢复远端执行状态。

Agents 拥有 task identity、服务端幂等、status、cancel、resume、retry 和中心化审计。以上能力必须通过正式 MCP contract 提供；Ki-Buddy 只接入并呈现该 contract，不根据任意 JSON 字段、HTTP 等待窗口或本地进程状态建立 Agents 专用状态机。异常后新的执行由用户发起。

Ki-Buddy 继续负责客户端安全边界，包括本地凭据、Core 用户隔离、Adapter protocol 与 schema 校验、用户文件授权、结果下载限制和本地工具授权。这些能力可以维护本地短期 grant 或 delivery 引用，但不得赋予它们远端 task identity、执行恢复或取消语义。

## 对既有决策的修订

- 取代 ADR 0006。客户端不实现本地幂等登记、结果未知持久化、跨进程 dispatch qualification 或 active invocation 恢复。
- 修订 ADR 0005。Assistant session 继续使用现有队列，不在 Adapter 内增加队列；远端 task identity 与执行状态只使用 MCP contract 提供的值。
- 修订 ADR 0007。file grant 和 `uploadRef` 属于客户端文件授权，绑定 deployment、账号、conversation、Adapter session、agent 和输入字段；不绑定 Ki-Buddy 自建 taskId，也不表示远端执行状态。上传能力必须依据正式 MCP file-input contract。
- 修订 ADR 0008。结果文件只按正式 MCP result-file contract 识别；本地 delivery 状态不构成远端执行状态副本，下载失败不能触发新的 invoke。
- 修订 ADR 0009。Agents 平台同时拥有远端执行生命周期；Ki-Buddy 不保存脱敏执行状态副本或提供管理员审计查询。

## Considered Options

- 在 Ki-Buddy 中维护 SQLite ledger：可以降低部分客户端重复调用风险，但会让客户端拥有远端执行身份、防重和恢复语义。
- 根据 Gateway JSON、超时或进程状态推断执行结果：缺少正式 contract，容易把本地传输状态误判为远端业务状态。
- 等待 Agents 提供 MCP lifecycle contract：保持产品职责清晰，也允许 status、cancel、resume 和服务端幂等随平台能力演进。

## Consequences

- #21 关闭为 `not planned`，不开发 Ki-Buddy 本地 ledger。
- #67 的 direct invoke contract 保持不变：Adapter 不增加 describe grant 或请求级本地防重，合法成功 JSON 继续完整透传。
- 用户 Stop 只结束本地会话等待；没有 MCP cancel contract 时不能宣称远端已取消。
- MCP 调用断开或超时时，Ki-Buddy 只报告本地调用结果。用户后续发起的新请求按新的 MCP 交互处理。
- #23–#26 的本地文件授权和交付能力不依赖 #21；涉及上传、远端结果或执行生命周期的部分必须基于正式 MCP contract。
- 本决策不要求修改 Ki-Core，也不增加 Team runtime。
