---
status: accepted
---

# 使用本地 ledger 保护远端 invocation

同一 Assistant session 同时最多有一个 active invocation，不同 session 使用不同 taskId 时可以并行。Ki-Buddy 在自己的应用数据目录维护产品自有 SQLite invocation ledger，以 `(规范化 base_url, Agents 用户标识, 远端 taskId)` 唯一约束跨 Adapter 进程和 App 重启的一次本地执行资格；它不进入 AionCore，也不承担中心化审计。

Adapter 在远端 dispatch 前通过数据库事务取得执行资格。只有能够证明尚未开始 dispatch 的 reservation 才能恢复；请求可能已送达但没有可信终态时记为结果未知，原 taskId 永不自动重试。Agents 当前同步窗口结束返回 `running`、dispatch 后断线、进程崩溃和用户停止等待都遵循该语义。

## Considered Options

- 只保存进程内状态：不能处理多个 Adapter 或 App 崩溃后的重复调用。
- 要求 Agents 首发提供服务端幂等和状态查询：保证更强，但会扩大外部平台改造范围。
- 自动重试未取得响应的请求：体验连续，却可能重复产生结果或外部副作用。

## Consequences

- ledger 只保存幂等、恢复和结果关联所需的脱敏字段，不保存 token、headers、密码、完整 inputs、完整远端结果、`fileUrl` 或本地文件内容。
- 结果未知既不是成功也不是失败。再次执行必须来自新的明确请求和新 taskId，并提示原请求可能已经执行。
- “停止”等产品动作必须表述为停止本地等待；首发不承诺远端 cancel。退出、网络恢复或重新登录不能改变结果未知状态。
- ledger 随关联 conversation 或 Team 历史保留；退出、切换账号和固定时间经过都不删除。用户显式删除工作历史并终止相关进程后，才删除对应记录。
- 如果 Agents 后续提供稳定 invocation ID、服务端幂等、status 或 cancel contract，可以重新评估结果未知和恢复策略。
