---
status: accepted
---

# 探测 Bridge contract 并以打包目录 E2E 验收发布

Agents Bridge 当前没有稳定版本化 capability contract。Ki-Buddy 不维护 Agents release 白名单，而是在每次实际响应中严格校验 catalog、describe 与 invoke envelope；不兼容时 fail closed。工具页沿用通用 MCP 测试连接，只验证实际随包 Adapter 的 stdio handshake 和 `tools/list`，不建立第二套产品检测生命周期。Ki-Buddy 从已验证 Agents 基线采集并维护脱敏 contract fixtures，Agents 平台首发不承担客户端 fixture 发布责任。

发布自动化以 contract tests 和 electron-builder `out/` 中 unpacked packaged app 的 Playwright Electron E2E 为门槛。真实登录、权限、invoke 和文件链路连接共享非生产部署中的专用 E2E 组织；需要精确控制断线、崩溃、超时、容量和恶意响应时使用本地 fake Bridge/file server。最终安装版发布后采用人工测试与反馈，不建设 DMG、NSIS 或 DEB 安装后的自动化 Agents E2E。

## Considered Options

- 要求 Agents 首发增加 contract version/capability 接口：边界清晰，但会扩大平台配合范围。
- 仅使用本地 fixtures：结果稳定，却不能证明真实平台身份、权限和执行链路。
- 所有故障场景连接真实 Agents：真实度高，但共享环境无法安全、可重复地制造异常。
- 自动化安装最终分发包：覆盖更多安装问题，但多平台安装、签名和权限驱动成本较高。

## Consequences

- 运行时结构探测不能证明字段语义没有变化；支持的 Agents 基线仍需 contract tests 和真实非生产 E2E。
- Agents 管理员预先维护专用组织、普通测试账号、权限差异和受保护测试 agents；E2E 只读校验版本化 manifest，不持有管理员权限或自动修改平台配置。
- 真实层与本地故障层必须启动同一 unpacked packaged app，并用不同证据类型标记；本地 fixture 通过不能替代真实平台场景。
- evidence 只保存产品 commit、fixture 版本、场景、脱敏关联 ID、状态、workspace 相对路径和断言，不保存凭据、完整 `base_url`、业务输入、远端 URI 或文件内容。
- 安装器路径、系统钥匙串权限、首次启动、升级、签名和杀毒软件问题不会被 Agents 自动化完全覆盖，这是首发接受的发布风险。
