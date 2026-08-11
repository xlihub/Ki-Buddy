# Agents 已发布 Agent 表单文件上传与执行链路

## 调研基线

- `k-agent-flow-design`：已于 2026-08-11 fetch `origin/dev`，基线 commit 为 `45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2`（提交时间 2026-08-07 10:36:13 +0800）。该仓库是表单前端。
- `agents`：已于 2026-08-11 fetch `origin/dev`，基线 commit 为 `bed8ba415d2d34f98c65fceffefc1b4bfaba590e`（提交时间 2026-08-11 10:28:34 +0800）。该仓库包含文件服务、任务编排和各类 A2A adapter。
- 两个仓库均有未提交改动；调研直接读取 `origin/dev` 对象，没有切换分支或修改工作区。

本文只把源码直接证明的内容标为“事实”。跨模块意图但缺少完整运行时证据的内容标为“推断”，部署配置或源码没有说明的内容标为“未知”。

## 链路结论

本地文件不会进入 `/chat` 的 JSON。前端先把二进制上传到 Agents 文件服务，取回 `responseBody.fileUrl`，再把这个 URL 写入执行计划中对应文件参数的 `input.value`。用户确认执行后，前端把更新后的整个 `plan_info` 发送给 `/chat`。Agents core 随后将 URL 放入 A2A `DataPart.data.inputs[].value`；Workflow adapter 最终把它转换成 Dify 的 `remote_url` 文件对象。

```text
本地 File
  -> POST /kagent/sys/file/upload (multipart: file)
  -> responseBody.fileUrl
  -> plan_info[step].inputs[param].input.value
  -> POST /chat, method=tasks/send, params.type=flow_run
  -> A2A DataPart.data.inputs[].value
  -> Workflow: inputs[name] = { transfer_method: "remote_url", url, type }
```

这条结论由下文逐段证据支持，不应简化成“invoke 接口直接接收 multipart”或“先上传到 Dify”。

## 1. 表单字段如何触发上传

### 事实

- 规划消息从 `result.plan_info[].inputs[]` 生成表单字段；字段键优先使用 `input.input.key`，否则使用 `${step_id}_${input.name}`。文件选择器的允许类型来自 `input.allowed_file_types`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentTypeMessage.js:19-48`。
- `type === "file"` 时，前端动态创建原生 `<input type="file">`。`allowed_file_types` 只被转换成 DOM `accept` 属性；选中文件后调用 `handleFileUpload(field, files)`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentInputField.js:107-121,123-160`。
- 上传期间执行按钮禁用；禁用条件包括任意 `uploadingFiles` 为真。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentSubmitButton.js:33-44`。

### 推断

- `accept` 只能约束文件选择器展示，不能作为可信类型校验；拖放、浏览器差异或手工请求都可能绕过。源码未在上传前检查 MIME、扩展名或文件内容。

## 2. 上传 API、请求字段与返回标识

### 事实

- `useFileUpload` 从 `localStorage.token` 读取 token，构造 `FormData`，字段名固定为 `file`，并向 `${NEXT_PUBLIC_API_URL}/kagent/sys/file/upload` 发送 `POST`；请求带历史 `token` header，不手工设置 `Content-Type`。多个文件使用 `Promise.all` 并行上传。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/hooks/useFileUpload.js:10-35,51-61`。
- 前端要求 HTTP 成功且 JSON `errorCode === 0`，随后返回 `responseBody` 全部字段并附加本地 `originalFile`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/hooks/useFileUpload.js:34-48`。
- 表单执行链只读取第一个上传结果的 `fileUrl`，其他服务端字段以及 `originalFile` 都不会写入执行计划。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentFormContext.js:98-125`。
- 服务端 endpoint 是 `POST /sys/file/upload`；结合全局 context path `/kagent`，对外路径即 `/kagent/sys/file/upload`。Controller 参数是 `MultipartFile file`，与前端字段一致。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:46-77`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/resources/application.yml:1-7`。
- `responseBody` 的类型是 `AppResFileDto`，包含 `sid`、`fileName`、`fileOriginalName`、`fileUrl`、`fileSize`、`fileType`、引用字段、创建用户和时间字段。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/pojo/system/dto/AppResFileDto.java:12-32`。
- 对当前表单链路而言，稳定注入执行参数的标识不是 `sid` 或存储 path，而是可下载 URL `responseBody.fileUrl`。服务端生成的 URL 形如 `<base><contextPath>/sys/file/download?path=<encoded storage path>`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:234-257`。
- Agents 内部统一上传工具也明确使用 multipart `file`，并只在 `errorCode === 0` 时读取 `responseBody.fileUrl`，与前端契约一致。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:shared/core/file_utils.py:72-93,121-152`。

## 3. `fileUrl` 如何进入 `/chat` 的执行请求

### 事实

- 上传成功后，`fileUrl` 写入 `formData[fieldKey]`。构造提交数据时，前端复制 `result.plan_info`，找到同一输入项并把值写入 `input.input.value`；字符串会先 `trim()`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentFormContext.js:117-125,137-158`。
- 前端提交的是 JSON-RPC 风格对象：`method = "tasks/send"`，`params.type = "flow_run"`，并携带 `conversation_id`、更新后的 `plan_info`、`flow_instance_id`、`message_id` 和本地 `uuid`。请求发送到 `${NEXT_PUBLIC_CHAT_API_URL}/chat`，header 为 `Content-Type: application/json` 和 `token`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentFormContext.js:137-173,175-199`。
- `/chat` 接收 `A2ARequestModel`，先调用 `validate_token`；`tasks/send` 进入 `send()`。当 `params.type == "flow_run"` 时，服务端从客户端请求读取 `plan_info` 并传给 `plan_exec`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/api_server.py:889-919,644-664`。
- `plan_exec` 先把用户确认后的 `plan_info` 写入执行记录，再用 `trans_agent` 将其中各 step 转为具体 AgentCard，并提交 `FlowInstance`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/utils/api_server_utils.py:273-315,317-358`。

## 4. 最终 agent invoke payload

### 事实

- `trans_agent` 不替换文件 URL；它把每一步的 `inputs` 原样放进对应的 Workflow/RPA/Browser Use/Custom A2A AgentCard。Workflow 还附带 `apiKey`、`userId`，RPA/Browser Use 附带各自 `flow_id`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/utils.py:105-163,185-230`。
- `AgentCardInFlow.get_payload()` 对非上一步输出的参数读取 `input.input.value`。文件值是 URL 时，`ParameterAdapter` 判断为 `url -> file` 并原样返回 URL。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/base.py:83-91,118-162`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/parameter_adapter.py:41-71`。
- 通用 A2A DataPart 结构为：

  ```json
  {
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            "inputs": [
              {
                "name": "<param>",
                "type": "file",
                "value": "<responseBody.fileUrl>",
                "required": true,
                "description": "..."
              }
            ],
            "outputs": [],
            "agent_request_params": {
              "conversation_id": "...",
              "flow_instance_id": "...",
              "agent_id": "..."
            }
          }
        }
      ]
    },
    "configuration": {
      "blocking": false,
      "acceptedOutputModes": ["text/plain", "application/json"]
    }
  }
  ```

  构造代码证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/base.py:88-186`。Workflow 再把 `api_key` 和 `user_id` 注入 `agent_request_params`：同文件 `189-198`。

- Agent runner 把该对象构造成 `SendStreamingMessageRequest` 并调用 A2A client 的 `send_message_streaming`。发送前会转换特定 FastDFS HTTPS URL、移除空值，并把完整调用参数写入日志。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/agent_runner.py:257-312`。
- Workflow adapter 读取 `data.inputs[]`。对于 `type == "file"` 且 `value` 非空的项，把 URL 转成 Dify 输入：`{"transfer_method":"remote_url","url":fileUrl,"type":...}`；最终请求为 `POST /v1/workflows/run`，body 含 `inputs`、`response_mode`、`user`，Bearer token 使用 agent 的 `api_key`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:a2a-server-workflow/src/server/dify_agent.py:193-198,219-287,375-405`。
- RPA adapter 不做 Dify 文件对象转换，而是把 `inputs[].value` 直接变成 RPA `Param{n}Value`；因此文件 URL 仍作为参数值传给 RPA。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:a2a-server-rpa/core/rpa_base/rpa_client.py:185-221`。
- Browser Use adapter同样把输入列表压成 `{name: value}` 后传给 Browser Use API，文件 URL 保持字符串。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:a2a-server-browser-use/core/browser_use_agent_executor.py:293-318,723-737`。

### 推断

- Ki-Buddy 要保持现有 Workflow/RPA/Browser Use 行为，应复用“先上传，执行参数保存 `fileUrl`”这一公共契约，而不是把本地路径、`sid` 或二进制直接放进 `flow_run`。
- Custom A2A 会把通用输入列表压成 name/value map，因此自定义 agent 的文件参数也只会得到 URL 字符串；自定义 agent 是否接受 URL、是否需要签名或二次下载由其协议决定。转换证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/base.py:233-274`。

## 5. 身份与权限语义

### 事实

- 前端上传 hook 强制本地存在 token，并发送 `token` header；没有 token 时客户端直接报错。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/hooks/useFileUpload.js:17-32`。
- 但 Agents app 的生产配置把 `/sys/file/` 整段放入白名单；JWT filter 对白名单请求直接放行。因此上传、下载和删除接口在该配置下不要求 token，前端 header 不是服务端权限边界。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/resources/application-prod.yml:149-179`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:61-79,89-100`。
- 新文件记录的 `createUserId` 来自当前登录用户；请求没有登录上下文时写空字符串。当前 `/sys/file/*` 白名单请求即存在这种情况。上传 Controller 也没有设置 `referTable` 或 `referSid`，因此该链路没有把文件绑定到 conversation、flow、agent 或参数。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/service/system/impl/AppResFileServiceImpl.java:100-115,237-242`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:143-169`。
- `/chat` 至少要求 `token` header 非空。是否远程验证 token 由 `TOKEN_VALIDATE_REMOTE` 控制；当前代码在该值为 `true`（默认值）时直接返回 token，只有为 false 时才调用远程验证。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/utils/api_server_utils.py:138-164`。
- `flow_run` 使用客户端提交的 `plan_info` 构造 AgentCard；本次追踪到的 `flow_run -> plan_exec -> trans_agent` 路径没有重新查询用户对每个 `agentId` 的授权。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/api_server.py:644-664`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/utils/api_server_utils.py:287-315`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/utils.py:120-236`。

### 未知

- 目标部署是否由 Higress、Caddy、WAF 或网络边界为 `/sys/file/*` 和 A2A 服务增加了额外认证、限流或 ACL；仓库内应用代码不能证明部署态策略。
- `TOKEN_VALIDATE_REMOTE` 在 Ki-Buddy 对接的实际环境取值。
- `flow_run` 前是否还有网关层对 `plan_info.agentId` 做权限复核。本文追踪的应用路径没有发现该复核，但不能据此断言所有部署均无复核。

## 6. 大小、类型和内容校验

### 事实

- flow-design 没有上传大小检查；文件类型只通过 DOM `accept` 提示。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentInputField.js:107-121,149-160`；`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/hooks/useFileUpload.js:10-32`。
- Agents app 的 production multipart 配置为单文件 500MB、单请求 500MB。仓库所带 Nginx 模板允许 1024MB，因此在这两层配置同时生效时，Spring 的 500MB 更严格。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/resources/application-prod.yml:105-108`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:docker/agents-nginx/default.conf.template:1-13`。
- `/sys/file/upload` Controller 没有文件类型白名单或 MIME 校验；它依据原文件名后缀记录 `fileType`，对 txt/text/md 增加 UTF-8 BOM 后写入 OSS 或 FastDFS。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:75-107,118-169`。
- Workflow adapter 将文件归类为 `document/image/audio/video/custom`，优先采用显式 metadata，否则依次回退 MIME、extension、filename 和 URL；这属于下游协议转换，不是上传准入校验。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:a2a-server-workflow/src/server/dify_agent.py:313-369,375-430`。

### 未知

- Higress/Caddy/对象存储的实际 body 大小、超时、病毒扫描、DLP 和文件后缀策略。
- Dify、RPA、Browser Use 各 agent 对具体文件类型和大小的最终限制；这些限制可因已发布 agent 配置而不同。

## 7. 生命周期、删除与审计

### 事实

- `app_res_file` 持久化模型只有文件标识、存储 path、原名、大小、类型、引用、创建用户和创建/更新时间，没有 TTL、过期时间或临时/已绑定状态。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/pojo/system/persistent/AppResFile.java:19-49`。
- 上传 endpoint 会按“原文件名 + 大小”查找最近记录；命中时重新上传并更新原记录的存储 path，未命中时新建记录。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:109-169`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/service/system/impl/AppResFileServiceImpl.java:190-205`。
- 文件删除接口是 `POST /sys/file/delete`，接收 storage `path`，直接删除 FastDFS 文件和数据库记录，没有 owner 校验。该路径也落在 `/sys/file/` 白名单内。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/system/FileToolsController.java:357-363`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:app/agents-app/src/main/resources/application-prod.yml:149-163`。
- flow-design 的表单上传链路没有调用服务端删除接口。`removeUploadedFile` 只移除 React hook 的本地数组；表单实际只消费 `fileUrl`。证据：`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/hooks/useFileUpload.js:64-79`；`45eb4e94f0e1ebcbf99919cfa3a9acab87c0ccb2:app/components/message-types/PlanAgentFormContext.js:117-125`。
- `/chat` 会记录收到的完整 request；`flow_run` 记录计划步数；远程 agent 执行前 `[AUDIT_AGENT_INPUT]` 会记录完整 `send_message_payload`，其中包含文件 URL，并可能包含 Workflow `api_key`。证据：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/api_server.py:889-903,644-653`；`bed8ba415d2d34f98c65fceffefc1b4bfaba590e:server/core/agent/agent_runner.py:282-303`。

### 推断

- 用户选中文件但未提交、提交失败、替换文件或放弃会话时，已上传对象会继续存在；当前源码没有自动回收动作。由于模型没有 TTL，不能假设后台会自动清理。
- `fileUrl` 是无签名的下载地址，且下载 endpoint 位于匿名白名单；得到 URL/path 的主体可以直接下载。Ki-Buddy 不应把它当作用户隔离凭据。
- 按“同名 + 同大小”更新已有记录而不先删除旧 storage path，可能产生无法由数据库引用的旧对象；需要运行态存储检查才能确认实际泄漏规模。

### 未知

- 是否存在仓库外的定时清理任务、对象存储生命周期策略、杀毒/DLP 服务或集中审计脱敏规则。
- 日志系统的保留期、访问权限，以及 `api_key`、文件 URL 是否在采集链路中脱敏。

## 对 Ki-Buddy 集成的直接约束

以下是由现有契约推导出的兼容要求，不代表 Agents 已具备安全文件域：

1. 上传阶段使用 multipart `file` 调用 `/kagent/sys/file/upload`，成功条件为 `errorCode === 0`，保留 `responseBody.fileUrl`。
2. 执行阶段把 `fileUrl` 写入对应 agent 输入值；不要把 Ki-Buddy 本地绝对路径暴露给 Agents，也不要把 `sid` 当作 invoke 值。
3. 必须等待上传完成后才能允许执行；现有 flow-design 也是通过 `uploadingFiles` 禁用按钮。
4. Ki-Buddy 自己需要定义草稿取消、失败、替换、会话删除时的文件回收策略。现有 Agents 接口没有 TTL/owner 语义，且删除接口按 path 操作，不适合作为可信的用户级资源 API。
5. 对外展示前应明确 500MB 只是当前 Agents app 配置，不是跨所有网关和 agent 类型的统一保证。
6. 文件 URL、agent `api_key` 和完整 invoke payload 可能进入日志；集成设计需要单独规定敏感字段脱敏和审计访问权限。
