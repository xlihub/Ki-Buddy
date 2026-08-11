---
status: accepted
---

# 在 Adapter 内上传经过授权的本地文件

Agents MCP Adapter 在 invoke 前调用 Agents 文件服务上传本地文件，取得 `fileUrl` 后写入精确文件参数。renderer 只负责文件选择与确认，Ki-Core 保持现有 workspace 语义，Bridge 不接收 multipart。选择“在项目中工作”只授予本地 workspace 能力，不自动授权把目录内容发送给 Agents。

Adapter 只能读取当前请求明确附加，或用户针对目标 deployment、agent 和输入字段逐文件确认的文件。授权通过不透明 file grant 传给 Adapter；`fileUrl` 只保存在当前 Adapter session 内存，并以一次性 `uploadRef` 间接提供给 invoke，不能进入模型、消息历史或 invocation ledger。

## Considered Options

- 由主进程上传：会把 Agents 文件 contract 和 schema 转换分散到 Adapter 之外。
- 允许 Adapter 读取 effective workspace 任意路径：会把本地访问权错误扩大为远端传输权。
- 持久保存上传映射：可跨进程恢复，但需要保存敏感 URL 并建设过期、加密和清理模型。

## Consequences

- file grant、上传状态和 `uploadRef` 必须绑定 deployment、账户、session、task、agent 和输入字段，并在文件替换、task 结束、退出、切换部署或 Adapter 重启时失效。
- 每个 `type=file` 参数首发只接受一个文件；需要多个文件时由 agent schema 声明多个字段。Adapter 不接受模型直接提供的本地路径或 `fileUrl`。
- 上传采用流式 multipart，不设置 Ki-Buddy 固定大小上限；实际准入由目标部署决定。Adapter 按精确 schema 的 `allowed_file_types` 校验 metadata，但不把它描述为内容扫描。
- 没有取得有效成功响应时不自动重传；用户显式重试可以继续使用尚未 invoke 的原 taskId。上传准备和失败都保持零 invoke。
- 当前 Agents 文件服务缺少可靠 owner、TTL、task binding 和安全删除 contract，失败、取消、替换或崩溃可能留下孤立远端文件；首发接受该平台限制，不能宣称远端上传文件按账户完整隔离。
