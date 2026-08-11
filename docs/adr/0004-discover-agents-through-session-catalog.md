---
status: accepted
---

# 通过 session 级完整 catalog 发现 Agents 能力

Agents 执行助手先通过 `agents_list` 取得当前账户安全 catalog 的完整紧凑 inventory，再用精确 `agentId` 调用 `agents_describe` 获取输入输出 schema。Adapter 不通过关键词搜索、推荐排序或静默截断替代完整能力发现。

inventory 按规范化 `base_url`、Agents 用户和 Adapter session 在内存中短期缓存，默认 TTL 为 5 分钟并支持强制刷新；它只保存候选选择所需的身份和能力摘要，不持久化原始 Bridge 响应。invoke 始终由 Agents 按当前凭证和权限再次校验。

## Considered Options

- 每次都实时读取 catalog：权限变化及时，但会在多阶段交互中重复请求和传输。
- App 级持久缓存：启动更快，但扩大账号隔离、权限撤销和数据保留范围。
- 只返回搜索或推荐结果：上下文较小，但模型无法证明已比较当前完整获权能力。

## Consequences

- 缓存不能跨部署、账户或 Adapter 进程复用；退出、认证失效和权限失效立即清除。
- 刷新失败时不能继续把旧 inventory 表述为当前完整 catalog。
- catalog 规模超过单次完整紧凑视图的响应或模型预算时，应引入平台版本、增量传输或分层 inventory contract，而不是静默改变完整性语义。
- `describe` 或 invoke 发现 agent 已下架或被撤权时，当前请求不自动改选其他 agent；刷新 inventory 后由用户或 Lead 决定后续动作。
