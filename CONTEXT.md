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

## 产品能力控制

**产品体验策略**：
一个产品版本对 AionUi 功能、资源和默认行为作出的统一可用性声明；同一声明同时约束用户入口、直接访问和相关运行行为。
_Avoid_：页面显隐清单、菜单白名单、Ki-Buddy 条件判断

**随包产品策略**：
随 Ki-Buddy 安装包发布并由该版本唯一采用的产品体验策略；产品功能变化通过发布新版本生效。
_Avoid_：远程功能开关、用户功能开关、环境变量覆盖

**产品能力 ID**：
在产品体验策略中稳定标识一项完整产品能力的领域名称；入口、直接访问和运行行为可以共同引用同一个 ID。
_Avoid_：路由路径、组件名、菜单 ID

**产品功能状态**：
产品体验策略对一项完整产品能力作出的启用或停用决定；停用表示该能力不可展示、不可直接访问，也不启动其专属运行行为，但不构成底层接口的安全授权。
_Avoid_：仅隐藏、CSS 隐藏、菜单开关

**首发数据基线**：
Ki-Buddy 第一个正式版本使用独立且没有历史产品数据的运行空间；开发数据、AionUi 数据和未正式发布版本的数据不构成产品兼容输入。
_Avoid_：旧版 Ki-Buddy 数据、AionUi 数据迁移、预发布数据兼容

**产品资源访问**：
产品体验策略对一类 Agent、Assistant、Model、Skill 或 MCP 资源规定的隐藏、使用或管理范围；使用允许调用及必要的运行检测，但不允许改变资源定义，管理保留该类资源的完整管理能力。
_Avoid_：列表过滤、按钮显隐、资源权限

**产品内置资源**：
由 Ki-Buddy 随产品发布并负责定义和生命周期的 Agent、Assistant、Skill 或 MCP 资源；用户可以使用和检测，但不能修改其定义。
_Avoid_：上游内置资源、Custom 资源、Extension 贡献资源

**上游内置资源**：
由 AionUi 或 AionCore 提供、但没有被 Ki-Buddy 声明为产品内置资源的 Agent、Assistant、Skill 或 MCP 资源。
_Avoid_：产品内置资源、Custom 资源

**未分类资源**：
Ki-Buddy 无法依据稳定身份和来源归入已声明资源类别的上游或 Extension 资源；它不自动取得可见或可用状态。
_Avoid_：Custom 资源、默认允许资源

**Custom 资源**：
用户通过 Ki-Buddy 保留的内置扩展入口创建并管理的 Agent、Assistant、Model、Skill 或 MCP 资源。
_Avoid_：Extension 贡献资源、产品内置资源、上游内置资源

**Extension 贡献资源**：
AionUi Extension 运行时提供的设置页、Agent、Skill 或 MCP 资源；它不因表现得像 Custom 资源而取得 Custom 资源访问范围。
_Avoid_：Custom 资源、产品内置资源

**自动注入 Skill**：
AionCore 在 conversation 运行时自动提供、无需用户从 Skills 目录选择的 Skill；它是否注入与是否在 Skills 设置页展示是两个独立决定。
_Avoid_：产品官方 Skill、Custom Skill、目录可见 Skill

**定时任务**：
由一个 Assistant 按计划在新 conversation 或指定的现有 conversation 中执行的任务；Team 不是定时任务执行者。
_Avoid_：Team 定时任务、Team 执行计划

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

## Agents 执行生命周期

**Agents 执行生命周期**：
Agents 平台拥有的远端 task identity、服务端幂等、status、cancel、resume、retry 和审计语义，通过正式 MCP contract 提供给客户端。
_Avoid_：Ki-Buddy 执行状态、本地恢复状态机、客户端幂等登记

**远端 taskId**：
Agents MCP contract 在一个 Agents 部署和平台账户范围内提供、用于标识远端执行请求的稳定 ID。
_Avoid_：进程内计数器、conversationId、requestId

**active invocation**：
Agents MCP contract 明确报告为已经开始但尚未取得终态的远端调用；Ki-Buddy 不根据本地等待或进程状态推断该状态。
_Avoid_：本地请求等待、pending task、catalog 请求

**停止等待**：
用户要求 Ki-Buddy 结束对一次 direct invoke 的本地等待；它不表示 Agents 远端执行已经取消。
_Avoid_：远端取消、执行失败、确认已停止

**Agents 审计记录**：
Agents 平台持有的中心化服务端执行证据，记录平台身份、获权 agent、远端执行和终态。
_Avoid_：客户端 conversation 历史、客户端结果文件、Adapter 日志

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
Ki-Buddy 根据当前请求的明确附件选择，或用户对某个 workspace 文件的逐文件确认生成的一次性 file grant；它不表示远端 task identity 或执行状态。
_Avoid_：项目目录授权、模型提供的路径、文件系统读取权限

**上传引用**：
Adapter 为当前 session 中已经上传的远端文件输入生成的一次性不透明 `uploadRef`；它不暴露真实 `fileUrl`。
_Avoid_：fileUrl、本地路径、Agents 文件 ID

**结果文件交付**：
Adapter 将正式 MCP result-file contract 返回的结构化远端文件安全写入 effective workspace，并向助手返回本地文件引用和脱敏摘要。
_Avoid_：Assistant 下载、远端 URI 消息、主进程 Agents 输出解析

**部分结果交付**：
MCP contract 已明确返回成功结果，但一个或多个结构化结果文件未能写入 effective workspace 的本地交付状态。
_Avoid_：invoke 失败、全部成功、自动重新执行

**结果交付引用**：
Adapter 为当前 session 中尚未解决的结果文件交付保存的一次性不透明 `deliveryRef`，用于只重试未交付文件。
_Avoid_：远端 URI、持久下载记录、invoke 重试
