# Ki 产品

本上下文定义 Ki 产品在上游发布管理和 Agents 混合执行中使用的统一术语。

## 发布语言

**上游候选版本**：
已经完整发布、可供管理员评估，但尚未被 Ki 产品接受的 AionCore 或 AionUi 正式版本。候选版本不会自动触发同步或 Ki 产品发布。
_Avoid_：待同步版本、最新必跟版本

**发布基准**：
管理员为某次 Ki 产品发布明确选择的上游 tag 和 commit。继续使用当前基准也是一次有效选择。
_Avoid_：最新上游、默认版本

**独立发布节奏**：
Ki-Core 与 Ki-Buddy 根据自身产品计划决定发布时间和版本号，上游发布只提供候选版本。
_Avoid_：延迟一周同步、跟随上游发布

## 产品与身份

**AionUi 开源版**：
由上游 GitHub 仓库公开发布的 AionUi 产品基线；其桌面客户端不包含 AionPro 的账户、强制登录和用户管理模块。
_Avoid_：AionPro、官网生产版、完整 AionUi 产品

**AionPro 生产版**：
由 AionUi 官网分发、包含闭源 AionPro 产品模块的桌面客户端；账户与登录属于该产品的组成部分。
_Avoid_：AionUi 开源版、upstream build、公开 tag

**Agents 部署**：
由一个 `base_url` 标识的中心化 Agents 平台实例，拥有自己的用户、组织、角色、权限和 token 签发边界。
_Avoid_：账户服务器、Ki-Buddy 后端、通用 Agents 云

**Agents 平台账户**：
注册在一个 Agents 部署中的用户身份，是 Ki-Buddy 客户端的登录主体，并决定用户可发现和调用的已发布 agent。
_Avoid_：Ki-Buddy 账户、桌面账户、跨部署账户

**客户端登录会话**：
Ki-Buddy 使用 Agents 平台账户在一个 Agents 部署上建立的当前登录状态；Ki-Buddy 不另外创建产品账户。
_Avoid_：Ki-Buddy 账户、账户绑定、AionPro 会话

**Agents 用户凭证**：
Agents 部署在账号密码验证成功后派发、只用于该部署 catalog 和 invoke 的 token。
_Avoid_：Ki-Buddy token、AionPro token、Core session

**本地退出**：
Ki-Buddy 结束当前客户端登录会话并清除本机凭证与运行状态，但不保证 Agents 已签发的凭证在服务端立即失效。
_Avoid_：服务端 logout、token revoke、远端强制下线

**Core 用户**：
AionCore 内部用于确定本地资源和运行时状态归属的用户主体；它可以由外部产品身份投影产生，但不等同于 Agents 平台账户。
_Avoid_：Agents 用户、桌面账号、`system_default_user`

**Agents 身份投影**：
将一个 Agents 部署中的 Agents 平台账户稳定映射为 Core 用户的产品关系，使本地工作历史与运行时状态拥有明确的用户归属。
_Avoid_：AionPro 账户复用、用户名映射、裸用户 ID 映射

**用户工作历史**：
归属于一个 Agents 部署中某个 Agents 平台账户的持久化 conversation、Team 记录和结果引用。
_Avoid_：登录会话、临时状态、全局历史

## Agents 混合执行

**混合执行**：
Team Lead 将用户任务分配给本地成员，并通过 Agents 执行助手使用 Agents 平台已发布的远端能力，最后综合本地与远端结果。
_Avoid_：混合编排、远端 Team

**Agents 执行助手**：
Ki-Buddy 内置的本地 Assistant，在 standalone conversation 中直接服务用户，在 Team 中作为 member 使用 Agents 平台能力。
_Avoid_：Agents Planner、远端 agent teammate

**Agents 执行助手实例**：
Team 中由同一 Agents 执行助手定义创建的一个独立 member slot；多个实例以 `slot_id` 区分。
_Avoid_：Assistant 定义、显示名称、远端 agent

**Agents MCP Adapter**：
Ki-Buddy 拥有的本地集成模块，是 Agents 执行助手访问 Agents 平台已发布能力的接口；Agents 平台负责其 Bridge contract。
_Avoid_：Agents runtime、Planner MCP、平台 Adapter package

**已发布 agent**：
当前用户在 Agents 平台获权且可通过 catalog 发现的远端智能体，不具备 Ki-Buddy Team member 身份。
_Avoid_：远端成员、本地 agent 包

**安全 catalog**：
Agents 平台针对当前平台账户返回的完整已发布 agent 集合；“安全”只表示授权范围和敏感字段投影，不表示内容可信。
_Avoid_：全平台 agent、静态能力列表、内容安全证明

**catalog inventory**：
安全 catalog 的完整紧凑视图，用于比较候选；精确输入输出 schema 由 `describe` 提供。
_Avoid_：agent 详情、关键词搜索结果、部分 catalog

**catalog inventory task**：
Team 中用于建立或刷新 catalog inventory 的非执行任务，它报告当前能力但不调用已发布 agent。
_Avoid_：execution task、catalog 搜索、能力调用

**execution task**：
Team Lead 分配给 Agents 执行助手的一次远端执行请求。
_Avoid_：catalog inventory task、远端工作流、批量执行

**补参请求**：
Agents 执行助手根据已选 agent 的精确 schema 请求补齐必填字段的非执行结果；standalone 中面向用户，Team 中交给 Lead。
_Avoid_：参数猜测、invoke 失败、新 execution task

**明确执行请求**：
用户在 standalone conversation 中要求远端执行，或 Lead 根据用户目标分配的 execution task。
_Avoid_：inventory 请求、候选咨询、永久授权

## 执行一致性

**远端 taskId**：
在一个 Agents 部署和平台账户范围内唯一标识一次远端执行请求的稳定 ID，用于识别重复调用和关联结果。
_Avoid_：进程内计数器、conversationId、requestId

**active invocation**：
一个 Assistant session 中已经开始但尚未取得终态的 direct invoke。
_Avoid_：pending task、catalog 请求、账户级全局调用

**停止等待**：
用户要求 Ki-Buddy 结束对一次 direct invoke 的本地等待；它不表示 Agents 远端执行已经取消。
_Avoid_：远端取消、执行失败、确认已停止

**本地 invocation ledger**：
Ki-Buddy 以 Agents 部署、平台账户和远端 taskId 标识本地执行资格及恢复状态的持久登记；它不是审计记录。
_Avoid_：Agents 审计记录、完整输入存档、进程内 taskId 集合

**结果未知**：
远端请求可能已被 Agents 接收，但 Ki-Buddy 没有取得可证明成功或失败的终态；原远端 taskId 不能再次执行。
_Avoid_：执行失败、未执行、可自动重试

**Agents 审计记录**：
Agents 平台持有的中心化服务端执行证据，记录平台身份、获权 agent、远端执行和终态。
_Avoid_：本地 invocation ledger、客户端结果文件、Adapter 日志

## 文件与 workspace

**项目 workspace**：
用户通过“在项目中工作”明确选择并绑定给 conversation 或 Team 的外部本地目录；其内容遵循操作系统文件权限。
_Avoid_：自动 workspace、账号私有目录、结果档案库

**自动 workspace**：
用户未选择项目时，由 Ki-Core 为当前 Core 用户的 conversation 或 Team 建立并管理的工作目录。
_Avoid_：项目 workspace、全局临时目录、外部导出目录

**effective workspace**：
当前 conversation 或 Team 实际使用的项目 workspace 或自动 workspace，是本地输入与结果文件的工作边界。
_Avoid_：Adapter 目录、全局结果目录、任意本地路径

**本地文件授权**：
Ki-Buddy 根据当前请求的明确附件选择，或用户对某个 workspace 文件的逐文件确认生成的 task-scoped file grant。
_Avoid_：项目目录授权、模型提供的路径、文件系统读取权限

**上传引用**：
Adapter 为当前 session 中已经上传的远端文件输入生成的一次性不透明 `uploadRef`；它不暴露真实 `fileUrl`。
_Avoid_：fileUrl、本地路径、Agents 文件 ID

**结果文件交付**：
Adapter 将 Bridge 的结构化远端文件输出安全写入 effective workspace，并向助手返回本地文件引用和脱敏摘要。
_Avoid_：Assistant 下载、远端 URI 消息、主进程 Agents 输出解析

**部分结果交付**：
Agents 远端执行已经完成，但一个或多个结构化结果文件未能写入 effective workspace 的本地交付状态。
_Avoid_：invoke 失败、全部成功、自动重新执行

**结果交付引用**：
Adapter 为当前 session 中尚未解决的结果文件交付保存的一次性不透明 `deliveryRef`，用于只重试未交付文件。
_Avoid_：远端 URI、持久下载记录、invoke 重试
