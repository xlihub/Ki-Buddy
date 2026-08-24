---
status: accepted
---

# 等待 Agents 提供远端执行文件产物 contract

Ki-Buddy 暂不实现远端执行文件产物的识别、下载、部分交付或重试。文件与某次远端执行的关联、可用状态、授权和获取方式属于 Agents execution lifecycle；当前 Agents 没有提供正式 execution artifact contract，客户端根据 invoke JSON、URL 或字段名称推断这些语义会形成一套未经平台定义的协议。

`agents_invoke` 保持 #67 的 direct invoke contract，合法成功 JSON 继续完整透传。Adapter 不默认下载疑似文件、不创建 `deliveryRef`，也不把本地下载结果建模为远端执行状态。任意 URL 或 file-like JSON 只是普通远端结果内容，不被 Ki-Buddy 认定为远端执行文件产物。

## Considered Options

- 根据 `result.outputs` 或常见 URL 字段推断并自动下载：客户端无法证明文件属于哪次执行、是否已经可用或应使用什么授权，且会改变 `agents_invoke` 的成功与失败语义。
- 在 Adapter 内先设计 `deliveryRef` 和部分交付状态：会让 Ki-Buddy 提前定义 Agents 尚未提供的文件产物生命周期。
- 由 Assistant 使用普通下载工具处理远端 URL：无法形成 Agents 文件产物的可信关联，也不属于 Agents Adapter 的协议适配。

## Consequences

- ADR 0008 被本决策取代；#25、#26 当前不实施。
- Ki-Buddy 目前不提供 Agents 远端执行文件产物的专用本地交付体验，也不宣称普通结果中的 URL 是可下载产物。
- Agents 后续提供正式 contract 时，应先确认执行与文件的关联、产物状态、授权获取方式、元数据以及错误语义，再由 Adapter 映射该 contract。
- 接入正式 contract 后，effective workspace、origin、redirect、凭据、容量、临时文件、路径和覆盖策略仍由 Ki-Buddy 的客户端安全边界负责，并通过新的 issue 明确验收范围。
