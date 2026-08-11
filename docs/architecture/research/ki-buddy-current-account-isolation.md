# Ki-Buddy 当前账号隔离能力核查

## 结论

当前 Ki-Buddy **不具备**按“Agents 部署 + Agents 用户”隔离本地工作历史的完整能力。

固定版本的 Ki-Core 已经提供较完整的 Core User 隔离原语：conversation、message、artifact、Team、task、mailbox、自动创建的 workspace 等服务都能以 `CurrentUser.id` 作为访问边界，并且有跨用户访问测试。但 Ki-Buddy 桌面端当前以 `--local` 启动 Ki-Core，Core 会跳过认证并把每个请求都视为 `system_default_user`；桌面 renderer 同样把认证状态直接设为已登录且 `user = null`。因此这些底层原语没有在当前桌面产品中形成真实的账号边界。

此外，当前实现没有 Agents `base_url` 身份维度，部分 renderer `localStorage`、内存缓存、上传文件与直接本地文件路径也没有用户命名空间。仅把 Agents 登录页和 token 接入现有客户端，并不能自动获得端到端账号隔离。

## 核查基线

- Ki-Buddy 工作树：`design/agents-mcp-productization`，核查时 HEAD 为 `3e35a15dd84864e666b76c7900876108cad122d4`。
- 产品清单固定 Ki-Core 为 `ki-core-v0.1.0` / `209e6844d39bac0762c61e198c1ba3a007f9dd2e`，其上游 AionCore 基线为 `v0.1.59` / `815e61ed9bbe942339347dc1e69ddce176cded76`。证据：`/Users/xli/AionUi/ki-buddy-product.json:62-69`。
- Ki-Core 的结论均来自固定提交 `209e6844…`，没有使用 AionPro 私有发布物替代当前 Ki-Buddy 行为。
- 本次是静态源码和已有测试核查，没有运行两个真实 Agents 账号的桌面端切换测试；当前代码也没有可执行的桌面账号切换路径。

## 能力矩阵

| 范围                                 | Ki-Core 固定版本的原语                                    | Ki-Buddy 当前实际行为                                                                        | 当前是否满足“部署 + 用户”隔离 |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------- |
| 桌面登录身份                         | 支持 `Local`、`WebUi`、`AionPro` 三种 identity mode       | 桌面端不认证，`user = null`，始终视为已登录                                                  | 否                            |
| Agents 部署身份                      | 无内建 Agents deployment 维度                             | 没有 Agents `base_url` 登录或身份映射                                                        | 否                            |
| conversation / message / artifact    | handler 将 `CurrentUser.id` 传入 service；有跨用户测试    | 所有请求的 `CurrentUser.id` 都是 `system_default_user`                                       | 否；仅有未启用的底层原语      |
| Team / task / mailbox                | Team handler 全部使用 `CurrentUser.id`；有跨用户测试      | Team UI 回退到 `system_default_user`                                                         | 否；仅有未启用的底层原语      |
| 自动 workspace                       | Ki-Core 能按 Core User 建立不同目录                       | 当前只会使用默认用户目录                                                                     | 否                            |
| 用户选择的本地 workspace / 文件      | Project ref 能校验 user；部分直接路径允许访问主机文件系统 | 当前没有用户边界；同一 OS 用户选择的目录天然共享                                             | 否                            |
| upload / 临时结果                    | 有 managed upload root 和 conversation 子目录             | upload 路径不含 user，上传 handler 不提取 `CurrentUser`                                      | 否                            |
| renderer `localStorage` / 内存 cache | 不属于 Ki-Core                                            | 多数 key 按 project、workspace、team 或固定名称，而非账号；conversation store 是模块全局状态 | 否                            |
| 退出 / 切换账号                      | 非 local mode 有认证与 session 原语                       | Electron 中不显示退出入口，`logout()` 仍保持 authenticated                                   | 否                            |

## 1. 桌面端当前没有真实登录身份

`AuthProvider.refresh()` 在 Electron 环境中直接设置 `authenticated`，同时把 `user` 设为 `null`；`login()` 直接返回成功；`logout()` 清空 `user` 后仍把状态设为 `authenticated`。证据：

- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:51-52`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:121-127`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:152-157`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:255-260`

侧边栏只在非 Electron 的 WebUI 环境显示退出入口。证据：`/Users/xli/AionUi/packages/desktop/src/renderer/components/layout/Sider/index.tsx:31-38`。

当前 login contract 只有 `username`、`password`、`remember`，没有 Agents `base_url` 或部署标识。证据：`/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:16-20`。因此开源仓库中的 WebUI 登录页不能视为当前 Ki-Buddy 桌面账号体系。

固定 Ki-Core 在非 local mode 已有 session revoke hook：可以按用户断开 WebSocket，停止 Team session、conversation runtime、channel session 与 file watch，而不会在此路径删除持久历史。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/src/router/routes.rs:192-248`。这是账号切换可复用的运行时清理原语，但当前 Ki-Buddy 桌面端没有启用它。

## 2. Ki-Buddy 强制以 local mode 启动 Ki-Core

桌面主进程为所有启动构造同一个应用 data directory，并通过 `BackendLifecycleManager.start()` 启动 Core。证据：

- `/Users/xli/AionUi/packages/desktop/src/index.ts:195-203`
- `/Users/xli/AionUi/packages/desktop/src/index.ts:765-775`
- `/Users/xli/AionUi/packages/desktop/src/process/utils/utils.ts:92-102`

`BackendLifecycleManager` 构造参数时固定传入 `local: true`，随后 `buildSpawnArgs()` 添加 `--local`。没有传入非 local 的 `--identity-mode`。证据：

- `/Users/xli/AionUi/packages/web-host/src/backend-launcher.ts:196-215`
- `/Users/xli/AionUi/packages/web-host/src/backend-launcher.ts:658-667`

固定 Ki-Core 明确定义 `--local` 为“跳过认证并使用 `system_default_user`”；环境解析还会让 `--local` 覆盖 identity mode。证据：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/src/cli.rs:40-46`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/src/bootstrap/environment.rs:45-61`

认证中间件在 local mode 不验证 JWT，直接注入固定的 `CurrentUser { id: "system_default_user", ... }`。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-auth/src/middleware.rs:57-65,91-100`。

这意味着当前 SQLite 中虽然存在 `user_id` 字段，所有桌面业务数据仍归到同一个本地默认用户；表中有列不等于产品已具备账号隔离。

## 3. conversation、message、artifact 的底层原语存在，但当前未启用

固定 Ki-Core 的 conversation routes 从 `CurrentUser` 取 `user.id`，并把它传给创建、列表、读取、修改、删除、message 与 artifact service：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-conversation/src/routes.rs:137-175`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-conversation/src/routes.rs:179-244`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-conversation/src/routes.rs:257-295`

已有测试证明另一个 Core User 不能读取 owner 的 message，响应不会泄露 message id 或内容。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/tests/message_e2e.rs:290-318`。

Ki-Buddy renderer 获取历史时请求 `/api/conversations`，没有自行提供用户标识；身份完全取决于 Core 注入的 `CurrentUser`。证据：

- `/Users/xli/AionUi/packages/desktop/src/common/adapter/ipcBridge.ts:1204-1233`
- `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts:161-178`

由于当前 Core 运行在 local mode，这些请求全部读取 `system_default_user` 的同一份历史。

## 4. Team、task、mailbox 的底层原语存在，但当前仍是单用户

固定 Ki-Core 的 Team routes 将 `CurrentUser.id` 用于 team 创建、列表、读取、删除、run state、mailbox 和 task：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-team/src/routes.rs:127-168`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-team/src/routes.rs:196-220`

跨用户测试证明另一个用户的 Team 列表为空，并且按已知 team id 访问、发消息或操作 session 均返回 `404`。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/tests/team_e2e.rs:478-546`。

Ki-Buddy Team UI 在 `AuthContext.user` 为空时明确回退到 `system_default_user`，列表的 SWR key 也只使用这个值。证据：`/Users/xli/AionUi/packages/desktop/src/renderer/pages/team/hooks/useTeamList.ts:11-18`。创建 Team 同样回退到该用户；虽然 renderer 参数中有 `user_id`，HTTP body mapper 没有把它发送给 Core，实际 owner 仍由后端 `CurrentUser` 决定。证据：

- `/Users/xli/AionUi/packages/desktop/src/renderer/pages/team/components/TeamCreateModal.tsx:95-127`
- `/Users/xli/AionUi/packages/desktop/src/common/adapter/ipcBridge.ts:2072-2083`

因此 task 与 mailbox 虽然通过 team ownership 间接隔离，当前所有 Team 仍属于同一个默认用户。

## 5. workspace、文件与结果目录只有部分多用户原语

固定 Ki-Core 已测试自动创建的 conversation workspace 使用 `conversations/users/{user_dir}/…`，两个 Core User 会得到不同目录。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/tests/conversation_e2e.rs:1225-1284`。

Project file ref 的 resolve 路径会使用调用者 `user_id`；但 `Upload` 只校验文件位于全局 managed upload root，`Local` 则允许访问用户通过主机文件选择器选到的任意本地文件。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-project/src/chat_files.rs:65-82,83-124`。

上传路径目前不具备用户命名空间：upload handler 不提取 `CurrentUser`，只传入文件名和可选 `conversation_id`；服务把文件写到系统临时目录下的 `aionui/{conversation_id|general}`。证据：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/routes.rs:523-537`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/service.rs:719-765`

部分旧 file endpoints（metadata、read、image base64）也不提取 `CurrentUser`；不能把整个文件面视为已经按账号隔离。证据：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/routes.rs:187-208`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/routes.rs:540-549`

用户显式选择的外部 workspace 是同一 OS 用户可访问的真实目录。即使未来 conversation 记录按账号隐藏，也不能声称这些目录内容在操作系统层面互相不可见；产品验收需要把“应用内历史不可见”和“本机文件权限隔离”分开。

## 6. renderer 状态不是按账号命名

已有一项安全处理：WebUI 退出时会删除所有 `preview-ui:` key，因为预览状态按 project/workspace 保存并可能含文件内容。它采用“退出时全删”，不是“按账号保留、换回账号恢复”。证据：

- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:53-80`
- `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/previewScope.ts:28-52,64-74`

其他持久 UI 状态也没有账号维度，例如：

- 最近 workspace 使用固定 key `aionui:recent-workspaces`：`/Users/xli/AionUi/packages/desktop/src/renderer/components/workspace/recentWorkspaces.ts:7-23`。
- Team 状态只按 `team_id`：`/Users/xli/AionUi/packages/desktop/src/renderer/pages/team/utils/teamStorage.ts:7-15`。
- cron 未读状态使用固定 key `aionui_cron_unread`：`/Users/xli/AionUi/packages/desktop/src/renderer/pages/cron/useCronJobs.ts:274-302`。
- conversation 分组折叠和 workspace 展开状态使用固定 key：`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversations.ts:18-29,142-160`。

conversation sidebar store 还是模块级单例：`conversationsState`、generating/unread sets 与初始化标记不以用户为 key，而且初始化只执行一次。证据：`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts:128-141,272-288`。未来直接增加账号切换而不重置或重建这些 store，会在切换瞬间保留旧账号状态，并可能继续接收旧 runtime 的事件。

## 7. “Agents 部署 + Agents 用户”比现有 Core User 多一个维度

固定 Ki-Core 的 external user 唯一性是 `(user_type, external_user_id)`，没有 deployment/base URL 列。证据：

- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/migrations/030_user_scope.sql:172-173`
- `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/src/repository/sqlite_user.rs:179-187`

如果两个 Agents 部署都存在相同用户 ID，直接把 Agents 用户 ID 当作 `external_user_id` 会合并为同一个 Core User。产品化必须让本地身份键包含规范化 deployment identity，例如把 `(normalized_base_url, agents_user_id)` 映射成稳定且无碰撞的 Core external identity，或者扩展 Core schema；当前代码没有这层映射。

Ki-Core 还包含“第一个 external user 接管 `system_default_user` 历史与文件”的升级原语。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-auth/src/service.rs:25-33,62-105`。这不能不经产品决定就直接用于 Ki-Buddy：在允许多个 Agents 部署时，第一次登录哪个部署、哪个账号，不应偶然决定全部既有本地历史的归属。

## 对产品设计的约束

AionPro 生产版证明了这些 Core User 原语可以由桌面产品真正启用：闭源桌面模块先建立产品登录身份，再由主进程把外部用户投影为 Core 用户、换取只供本地 Core 使用的 session，并在退出或账户变化时撤销 Core session。完整发布物与 Core 证据见 [AionUi v2.1.52 产品账户与 upstream 认证实现调研](./agents-user-management-client-ui.md) 和 [AionCore 发布版与 upstream 认证、身份基础设施调研](./aioncore-auth-identity-foundations.md)。

Ki-Buddy 应借鉴的是这条“产品身份 → Core 用户 → 本地资源作用域”的协作方式，不是 AionPro cloud account、私有 endpoint 或闭源代码。Ki-Buddy 的外部身份源是 Agents 平台，身份键还必须包含 Agents deployment。ADR 0003 决定近期借用当前 Core 只接受的 `Aionpro` external user type，等它无法满足 Agents 用户或权限产品需求时再通用化。

在实现之前，不能把“当前已具备账号隔离”作为前提。需要显式设计并验收以下内容：

1. 建立稳定的本地身份映射：`(normalized Agents base_url, stable Agents user id) -> local/Core user id`。
2. 改变 Ki-Buddy 桌面端与 Ki-Core 的身份连接方式，停止把业务请求统一注入为 `system_default_user`；具体采用 Ki-Core external identity/session，还是由 Ki-Buddy 自己维护本地 namespace，仍需 ADR 决定。
3. 逐类迁移或隔离 conversation、message、artifact、Team、task、mailbox、cron、assistant/provider/MCP 配置、自动 workspace、upload、结果文件和 renderer cache；不能只处理侧边栏列表。
4. 账号切换必须有运行时屏障：停止旧账号 conversation/Team/Adapter、撤销事件订阅、清空内存 store，再载入新账号数据。
5. ADR 0003 已将首个公开版本定义为干净安装且首次启动强制 Agents 登录；仅本地开发数据库允许首个 Agents 账号按现有 Core 行为接管 `system_default_user` 历史，不形成公开产品迁移 contract。
6. 验收至少覆盖两个 Agents 部署中相同用户 ID、同一部署两个用户、退出后离线重启、运行中切换、崩溃恢复、直接已知资源 ID 越权访问，以及 renderer 瞬时残留。
