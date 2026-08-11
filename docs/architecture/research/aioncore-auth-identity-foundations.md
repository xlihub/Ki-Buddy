# AionCore 发布版与 upstream 认证、身份基础设施调研

> 产品策略更新（2026-08-11）：本文关于 AionPro 与 AionCore 的事实结论继续有效；“复用 AionPro 当前账户作为 Ki-Buddy 身份入口”的早期设计推论已被 ADR 0003 取代。Ki-Buddy 直接使用 Agents 平台账户登录，只借鉴 AionPro 将外部产品身份投影为 Core 用户的协作方式。

## 结论

AionUi 官网 v2.1.52 已内置 AionCore v0.1.62，并以 `aionpro` identity mode 运行。桌面主进程把已登录的 AionUi cloud account 投影为 AionCore external user，再通过 bootstrap-secret 保护的 internal endpoint 换取 Core session；退出或切换账号时撤销该 external user 的 Core session。用户截图中的桌面账户并非 WebUI 本地 admin，也不是 `system_default_user`。

AionCore v0.1.62 与本次刷新后的 upstream `main` 都具备可供 Agents MCP Adapter 产品化复用的本地身份基础设施：认证中间件产出稳定的 `CurrentUser.id`，MCP server 配置与 MCP OAuth token 均按该用户 ID 隔离；AionPro external session 可以建立和撤销投影到 Core 的用户会话，撤销时会清理 WebSocket、Team、Channel 与 conversation runtime。v0.1.62 到 upstream `main` 的认证、external session、MCP、OAuth 相关路径没有功能改动。

这些能力解决的是 **AionUi/AionCore 本地身份与资源隔离**，不能替代 **Agents 平台认证 contract**。AionCore 的 MCP OAuth client 只有在远端服务提供标准 OAuth/OIDC discovery、authorization endpoint、token endpoint 和 refresh grant 时才能工作；Agents 平台当前没有发布这些 contract。

另有一个阻止直接复用的安全缺口：MCP OAuth 数据模型要求调用方加密 token，但当前 `McpOAuthService` 将 authorization/refresh 响应中的 token 原样交给 SQLite repository，composition root 也没有传入 encryption key。因此不能把现有 MCP OAuth token repository 直接用于 Agents credential。

## 调研基线

- 调研时间：2026-08-10。
- upstream remote：`git@github.com:iOfficeAI/AionCore.git`。
- upstream 默认分支：`main`。
- 2026-08-10 执行 `git fetch upstream --prune --tags` 后，远端最新提交为 `f0f4fbd1234a039861f2b3e857cd821337c37672`。
- 用户安装的官网 AionUi v2.1.52 内置 `aioncore 0.1.62`；对应 upstream tag 为 `v0.1.62`，commit `35707c0a249964227c1b227b34b93e2bcf0d08f8`。
- 实际发布物：`/Applications/AionUi.app/Contents/Resources/app.asar`，SHA-256 `29c8eb4af1b248d4b831343d602c9c98058a54b6d9ac656acb12f6d1277aca97`；内置 Core binary SHA-256 `56de1278e00c9861117f614f0f84dafebcb917f9aa45f9ccc0519b9a6f23ee3a`。
- `/Users/xli/AionCore` 当前分支：`product/main`，HEAD `5d66f83408e731299a8abe06173fff960c6b6655`。
- 当前分支相对 upstream `main` 为左侧 26、右侧 18，已经分叉。
- 正文使用 `git show <ref>:<path>`、`git diff v0.1.62..upstream/main` 和实际发布物的只读解包结果交叉检查；没有 checkout、pull 或修改 AionCore 工作区。
- 本次没有执行测试。文中的 **Tested** 仅表示 upstream commit 中存在相关测试源码。

## 能力矩阵

| 能力                             | 状态                         | 产品判断                                                                                                                                       |
| -------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地用户 session                 | Implemented / Tested         | `/login` 签发 Core JWT 并设置 session Cookie；认证中间件向业务路由提供 `CurrentUser`。                                                         |
| Core JWT refresh                 | Implemented / Tested         | `/api/auth/refresh` 校验当前 JWT、active user 与 `session_generation` 后签发新 JWT；这是 Core 私有 session refresh，不是 OAuth refresh token。 |
| 当前 token logout                | Implemented / Tested         | `/logout` 将当前 JWT 加入 blacklist 并清除 Cookie。                                                                                            |
| AionPro external user/session    | Implemented / Tested         | bootstrap-secret 保护的内部接口负责外部用户投影、Cookie session exchange 与 session revoke。                                                   |
| 官网桌面账号到 Core 的身份投影   | Released / artifact verified | v2.1.52 主进程固定使用 `aionpro` mode；以 cloud user id provision Core user，Core JWT 仅在主进程内存与 HttpOnly Cookie 中使用。                |
| 跨模块 session revoke            | Implemented / Tested         | revoke 会使旧 generation 失效，并断开 WebSocket、停止 Team session、关闭 Channel、终止 conversation runtime。                                  |
| MCP 配置用户隔离                 | Implemented / Tested         | MCP routes 从 `CurrentUser` 取得 user ID，service/repository 的 CRUD 均以 user ID 查询。                                                       |
| MCP OAuth 用户隔离               | Implemented / Tested         | OAuth pending state 与 token repository 以 `(user_id, server_url)` 隔离。                                                                      |
| MCP OAuth discovery/PKCE/refresh | Implemented / 部分 Tested    | 支持 RFC 8414/OIDC discovery fallback、Authorization Code + PKCE 和标准 refresh grant。是否可用取决于远端 server contract。                    |
| MCP OAuth provider revocation    | Unknown                      | logout 只删除本地 token，没有调用远端 revocation endpoint。                                                                                    |
| MCP OAuth token 加密             | 未实现                       | 模型要求调用方加密，但 service 直接存储 token，composition root 没有注入 encryption key。                                                      |

## 身份与会话边界

### 官网 v2.1.52 的实际桌面身份路径

官网安装包中的桌面主进程固定设置 `CORE_IDENTITY_MODE = "aionpro"`，并明确把开源嵌入版的 `--local` / `system_default_user` 与 AionPro 产品模式分开。`CoreUserBridge` 在 AionUi cloud account 认证成功后执行以下流程：

1. `PUT /api/auth/internal/external-users/{external_user_id}`，以 cloud user id 幂等 provision `user_type=aionpro` 的 Core user；
2. `POST /api/auth/internal/external-sessions`，换取 Core session Cookie；
3. Core JWT 只保存在主进程内存，并为 renderer 安装 HttpOnly `aionui-session` Cookie；
4. 退出或账号变化时调用 `POST /api/auth/internal/external-sessions/revoke`，清除主进程 token、renderer Cookie 和配对 WebUI session。

发布物证据来自上述 SHA-256 对应的 `app.asar` 只读解包：`out/main/index.js:39394-39410`、`out/main/index.js:44783-45145`。对应 Core endpoint 与测试同时存在于 v0.1.62 和 upstream `main`：

- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:250-435 @ v0.1.62 / f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-auth/tests/route_tests.rs:836-1045 @ v0.1.62 / f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-app/tests/session_revoke_cleanup_e2e.rs:1-190 @ v0.1.62 / f0f4fbd1`

这条路径已经提供真实的桌面用户与 Core `CurrentUser.id`，无需再设计第二套本地用户登录。它仍然没有建立 AionUi cloud account 与 Agents platform user/tenant 的认证关系。

### AionCore 自身的 session contract

AionCore 有两种认证身份模式：普通 `UserSession` 与 `AionPro`。普通模式允许用户名密码登录；AionPro 模式通过内部 external-user/session 接口把外部身份投影到 Core 用户。内部接口由 bootstrap secret 保护，external session exchange 设置 Core session Cookie：

- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:250-260 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:269-320 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:362-407 @ f0f4fbd1`

`POST /api/auth/refresh` 不是 OAuth `refresh_token` grant。请求 body 带旧 Core JWT；服务校验签名、active user 与 `session_generation`，再签发一个新 Core JWT：

- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:774-818 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-api-types/src/auth.rs:54-69 @ f0f4fbd1`

普通 logout 只 blacklist 当前 token 并清 Cookie。external-session revoke 则提升该用户的 session generation，并触发产品级清理 hook：

- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:522-534 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-auth/src/routes.rs:410-435 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-app/src/router/routes.rs:200-240 @ f0f4fbd1`

这套机制适合承担“某个 AionUi/Core 用户已退出或被撤销后，停止其 Adapter session 与 active invocation”的本地控制面。它不能撤销 Agents 平台 token，除非 Agents 平台另行提供服务端 revoke contract。

## MCP 用户隔离

所有 MCP routes 都要求调用方应用认证中间件。handler 从 `CurrentUser` 取得 user ID，再把它传给配置 service；OAuth status/login/logout/authenticated 同样以 user ID 为作用域：

- `/Users/xli/AionCore/crates/aionui-mcp/src/routes.rs:60-112 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/routes.rs:285-336 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/service.rs:50-174 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-db/migrations/030_user_scope.sql:268-301 @ f0f4fbd1`

因此发布版与 upstream AionCore 都已经证明 `CurrentUser.id` 可以作为本地 MCP inventory 与 credential 的隔离键。Agents MCP Adapter 不需要另造本地“当前用户 ID”；需要新增的是 AionUi cloud identity、Agents stable subject、tenant/org 与 Core user 的显式绑定。

## MCP OAuth 的可复用范围

`McpOAuthService` 已实现以下 OAuth client 行为：

- pending login state 按 `(user_id, oauth_state)` 隔离；
- 优先读取 RFC 8414 metadata，失败后读取 OIDC discovery；
- Authorization Code + PKCE；
- token expiry 前五分钟使用标准 refresh grant；
- refresh response 若没有新 refresh token，则保留旧值。

证据：

- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:65-104 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:164-190 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:272-313 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:432-499 @ f0f4fbd1`

logout 的语义仅是删除本地记录，没有读取 discovery metadata 中的 revocation endpoint，也没有把 token 发给远端撤销：

- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:141-156 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/routes.rs:311-323 @ f0f4fbd1`

即使未来 Agents 平台提供标准 OAuth，产品需求仍需明确 provider-side revocation、账号切换时旧 token 撤销、离线过期以及远端不可达时的行为。

## Token 存储安全缺口

`OAuthTokenRow` 注释写明 access/refresh token 应加密，并由调用方处理加解密：

- `/Users/xli/AionCore/crates/aionui-db/src/models/oauth_token.rs:4-23 @ f0f4fbd1`

实际 service 在 authorization-code exchange 和 refresh 后把 token secret 原样传给 repository。`build_mcp_state` 只构造 repository 与 HTTP client，`McpOAuthService::new` 也只接收这两项，没有 encryption key 或 secret store：

- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:70-84 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-mcp/src/oauth_service.rs:464-499 @ f0f4fbd1`
- `/Users/xli/AionCore/crates/aionui-app/src/router/state.rs:522-532 @ f0f4fbd1`

AionCore 其他模块已经使用 `derive_encryption_key` 与 AES-256-GCM helper 保护 provider、remote agent 和 channel credential，说明基础加密能力存在；但在 MCP OAuth 路径接入之前，不能声称 token 已加密保存。

## 对 Agents MCP Adapter 的设计约束

1. 使用 AionCore `CurrentUser.id` 作为本地 inventory、credential、catalog cache、task 与结果文件元数据的第一层隔离键；这个 ID 已由官网桌面账号投影产生。
2. 单独定义 `AgentsIdentityBinding`：AionUi cloud user、Core user 与 Agents stable subject、tenant/org 的绑定不能从 username 或任一 JWT `sub` 推导。
3. AionUi cloud refresh token 继续只由桌面主进程和系统钥匙串持有；renderer、AionCore 与 stdio Adapter 都不能取得它。Agents 调用凭证应由主进程或受信任 backend 按需提供。
4. 不在 Core SQLite MCP OAuth repository 保存 AionUi cloud refresh token；该路径当前没有真实加密。若 Agents 采用独立 OAuth，也必须先补齐加密或改用系统凭据存储。
5. AionUi logout 触发的 cloud revoke 与 Core external-session revoke 必须停止该用户的 Adapter process、active invocation 与缓存；是否同时撤销 Agents token 取决于 Agents 平台 contract。
6. 不把 AionCore `/api/auth/refresh` 描述为 Agents refresh 或 OAuth refresh；两个 token 生命周期必须分别建模。
7. AionCore MCP OAuth client 只有在 Agents 发布 discovery、PKCE、refresh、revocation 与稳定 identity claims 后，才可成为首选登录实现。

## 尚未解决的问题

- 官网 AionUi v2.1.52 已获得真实 cloud user，并投影为 Core `CurrentUser`；公开 AionUi tag/main 仍缺少这部分产品源码，不能以公开 renderer 的旧 `AuthContext` 代表官网安装包。
- Agents 平台是否接受 AionUi cloud access token，或提供 token exchange/on-behalf-of；当前 Agents 仓库没有发布对应 contract。
- 如果 Agents 不能复用 AionUi cloud identity，是否接受第二次登录带来的账号映射与退出一致性成本。
- Agents stable subject、tenant/org、scope/audience 与账号切换 contract。
- Agents provider-side revoke 与 Core session revoke 的事务顺序、失败重试和审计证据。
- token 加密密钥的生命周期、系统钥匙串集成、备份/恢复与用户切换策略。

## 验证说明

本次刷新了 AionCore upstream refs，并只读检查官网 v2.1.52 发布物、v0.1.62 tag 与远端最新 `f0f4fbd1`；没有运行 AionCore 测试套件。已核对认证 routes、API types、session revoke hook、MCP routes/service、OAuth service、SQLite repository/model 与 composition root。`Tested` 仍只表示仓库存在相关自动化测试源码；发布物身份路径标记为 artifact verified，不代表执行了登录 E2E。
