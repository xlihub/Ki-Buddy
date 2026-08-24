---
status: accepted
---

# 分离 Agents 平台与 Ki-Buddy 的安全责任

Agents 平台拥有用户、组织、角色、权限、已发布 agent、远端执行授权、内容治理和中心化审计。Ki-Buddy 拥有本地凭据边界、Core 用户隔离、Adapter 协议校验、用户文件授权和本地工具授权。远端执行生命周期由 ADR 0012 修订，结果文件能力由 ADR 0013 修订；正式 execution artifact contract 出现前，Ki-Buddy 不实现结果下载限制或交付状态。

首发把 catalog 描述和 invoke 返回作为普通 MCP tool 内容交给 Agents 执行助手，不增加 `trust=untrusted` 标记、启发式关键词过滤或专用 prompt-injection 边界。Agents 执行助手也沿用普通 AionCLI 的本地工具和 Ki-Buddy 现有授权策略，不创建专用受限 runtime 或额外确认层。

## Considered Options

- Ki-Buddy 镜像完整服务端审计：会复制用户输入输出并形成第二套保留、删除和访问控制责任。
- 客户端维护 agent 风险 allowlist 或内容过滤：容易与平台事实漂移，也无法可靠识别语义风险。
- 为 Agents 执行助手建立专用本地工具权限：可以减少部分影响，但会分叉普通 AionCLI 行为和产品授权模型。

## Consequences

- Ki-Buddy 不能宣称远端内容经过 prompt-injection 隔离或净化；恶意描述和结果可能影响模型后续判断。Adapter 的 schema、凭据、来源和容量校验不能被描述为内容安全防护。
- Agents 平台不能替代 Ki-Buddy 对本地文件、shell、浏览器和其他副作用的授权判断；远端 agent 权限与本地工具权限是两个独立边界。
- 明确执行请求当前构成一次 invoke 的同意，客户端不自行推断风险。Agents 后续发布 `sideEffect`、`riskLevel`、`requiresApproval` 等稳定 contract 时，Ki-Buddy 必须重新评估确认流程。
- 中心化审计完整性由 Agents 验证。Ki-Buddy 不保存远端执行状态副本或本地结果引用，也不建设管理员审计 UI。
- 扩大自动授权范围、支持一次请求多次 invoke，或平台内容治理无法满足要求时，必须同时重新评估远端内容信任和本地工具权限。
