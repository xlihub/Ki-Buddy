---
status: accepted
---

# 由 Ki-Buddy 拥有并运行 Agents MCP Adapter

Ki-Buddy 通过内置 Agents 执行助手和本地 MCP Adapter 接入 Agents 平台，不在 Ki-Core 中增加原生 Agents runtime，也不接入 Agents `/chat auto` Planner。Adapter 只负责 Bridge 协议映射、安全边界和结果归一化，不运行额外 LLM。

Adapter 由 Ki-Buddy 维护并随桌面应用发布为自包含 JavaScript，由 Ki-Core managed Node runtime 启动；用户不需要安装 Bun、Node 或 Agents 平台另行提供的 package。每个 standalone conversation 或 Team member 的 Assistant session 拥有一个持久 stdio 进程，session 结束或宿主退出时终止；进程还必须通过 stdin EOF、终止信号和 parent PID 处理异常退出。

Adapter 的桌面嵌入采用 AionUi CDP built-in MCP 的现有模式：Ki-Buddy 打包 JavaScript entry，并通过现有 MCP API 注册 `builtin: true` 的 stdio server；Ki-Core 只负责通用 MCP 保存、managed Node 命令解析和 session 注入。动态登录态由 Electron main 持有，Adapter 通过继承的回环 bridge 地址和临时口令访问当前 catalog，不把 Agents token 或部署地址写入 MCP 注册记录。该模式不新增 Ki-Core `product_builtin` 来源、专用 DTO 或写保护 API。

## Considered Options

- 在 Ki-Core 中实现原生 Agents runtime：会扩大上游内核改造和同步成本。
- 由 Agents 平台独立发布 Adapter：可以独立修复协议，但会分散桌面生命周期、安全和兼容责任。
- App 级共享 Adapter：需要在 stdio 之上增加多调用方代理、身份和状态隔离协议。

## Consequences

- Adapter 修复通常需要发布新的 Ki-Buddy 版本，近期不建立独立更新通道。
- 同一 App 可以同时存在多个 Adapter 进程；跨 session 的幂等和账号状态不能只存在于进程内存。
- `agents-mcp-adapter` 在“工具”页面沿用现有 built-in MCP 的 `use` 交互：可展开工具并通过通用 MCP 测试连接执行 handshake 与 `tools/list`，不新增专用检测框架。
- 产品身份由 `builtin: true`、固定 server name、`node` command 和随包 script basename 的完整组合识别；这是与 CDP 一致的产品集成约定，不构成强于现有 MCP API 的可信来源。
