---
status: accepted
---

# 由 Ki-Buddy 拥有并运行 Agents MCP Adapter

Ki-Buddy 通过内置 Agents 执行助手和本地 MCP Adapter 接入 Agents 平台，不在 Ki-Core 中增加原生 Agents runtime，也不接入 Agents `/chat auto` Planner。Adapter 只负责 Bridge 协议映射、安全边界和结果归一化，不运行额外 LLM。

Adapter 由 Ki-Buddy 维护并随桌面应用发布为自包含 JavaScript，由 Ki-Core managed Node runtime 启动；用户不需要安装 Bun、Node 或 Agents 平台另行提供的 package。每个 standalone conversation 或 Team member 的 Assistant session 拥有一个持久 stdio 进程，session 结束或宿主退出时终止；进程还必须通过 stdin EOF、终止信号和 parent PID 处理异常退出。

## Considered Options

- 在 Ki-Core 中实现原生 Agents runtime：会扩大上游内核改造和同步成本。
- 由 Agents 平台独立发布 Adapter：可以独立修复协议，但会分散桌面生命周期、安全和兼容责任。
- App 级共享 Adapter：需要在 stdio 之上增加多调用方代理、身份和状态隔离协议。

## Consequences

- Adapter 修复通常需要发布新的 Ki-Buddy 版本，近期不建立独立更新通道。
- 同一 App 可以同时存在多个 Adapter 进程；跨 session 的幂等和账号状态不能只存在于进程内存。
- `agents-mcp-adapter` 在“工具”页面按 built-in MCP 只读显示，可展开工具并启动独立短生命周期检测实例，但不能编辑、删除、禁用或暴露受管 env。
- Assistant session 的 Adapter、工具页检测实例和产品凭据管理边界彼此分离；检测不能复用或改变正在执行的 session 状态。
