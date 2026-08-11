# Agents 认证 Contract 事实调研

## 结论

截至 2026-08-11 已刷新的上游基线 `bed8ba415d2d34f98c65fceffefc1b4bfaba590e`，**没有发现 Agents 平台向第三方客户端承诺的稳定 OAuth 2.0 / OIDC 认证 contract**。具体缺失项包括 OIDC discovery、标准 authorization endpoint、标准 token endpoint 响应、PKCE、`refresh_token` grant、token revocation、公开 logout、稳定的 issuer/audience/tenant/org claims，以及登录 JWT 的 JWKS。

仓库中存在可运行的登录、JWT、SSO 和 token 缓存代码，但它们属于以下三类内部实现，不能直接视为第三方集成承诺：

1. Agents Java app 自定义登录和 HMAC JWT；
2. Java app 作为 OAuth2 客户端接入外部 SSO；
3. `server_next` Bridge 从请求、会话注册表或环境变量取得 credential，再转发给 Java app 校验。

因此，Agents MCP Adapter 产品化时不应把现有实现包装成“支持 OAuth/OIDC”。如果 Adapter 需要第三方授权，应先定义并发布独立的认证 contract，或者明确把 Agents 作为受信任后端，由 Adapter 使用受控的服务凭证并另行完成终端用户授权。

## 调研基线与工作区记录

- 初次调研时间：2026-08-10；基线复核时间：2026-08-11。2026-08-11 已成功执行 `git fetch origin dev`；没有 checkout 或 pull。
- `/Users/xli/agents` 当前分支：`feat/browser-control-service-scaffold`。
- 当前 HEAD：`acab8f46f03ac30ace3f1e93a9a469de5e49d707`。
- 当前 upstream：`origin/feat/browser-control-service-scaffold`，本地记录的 upstream 与 HEAD 相同。
- remote：`origin = git@gitlab.kingsware.cn:AI/product/agents.git`（fetch/push）。
- fetch 后的 `origin/dev`：`bed8ba415d2d34f98c65fceffefc1b4bfaba590e`，提交时间 `2026-08-11T10:28:34+08:00`，作为本报告当前上游基线。
- 当前 HEAD 与 `origin/dev` 的 merge-base 是 `129c7af5a9e3d7a02c910addd5a4ef3fde261ad1`；`git rev-list --left-right --count HEAD...origin/dev` 为 `57 836`，两者已明显分叉。
- 工作区在调研开始前已有改动：4 个 staged、3 个 tracked unstaged、9 个 untracked，共 16 个路径，集中在 `browser-control-service/` 和 `browser-use-server/`。本次调研未修改这些内容。
- 正文源码行号仍以初次取证的 Git 对象 `f4b82997…` 为准。2026-08-11 对比 `f4b82997…bed8ba415` 后，`JwtTokenFilter`、`TokenLibrary`、auth controllers、`server_next/agent_engines/openclaw/bridge_router.py` 和 `server/core/kagent/kagent_api.py` 均无相关改动，因此正文旧证据继续适用。引用中的 `@ f4b82997…` 表示取证位置，且已复核至 `bed8ba415…`。

## 状态定义

| 状态            | 含义                                                        |
| --------------- | ----------------------------------------------------------- |
| **Implemented** | 基线源码中存在执行路径；不代表稳定或公开                    |
| **Tested**      | 基线仓库中有测试源码覆盖该行为；本次没有执行测试套件        |
| **Proposed**    | 只在设计稿、PRD 或待确认项中出现                            |
| **Unknown**     | 在约定的源码、路由、测试和文档范围内未发现可确认的 contract |

## 能力矩阵

| 能力                               | 状态                          | 事实判断                                                                                                                       | 是否可作为第三方稳定 contract                      |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| OIDC discovery / issuer metadata   | **Unknown**                   | 未发现 `/.well-known/openid-configuration`、OIDC discovery 或 issuer metadata 路由                                             | 否                                                 |
| OAuth authorization endpoint       | **Unknown**                   | Agents 自身没有 authorization server 路由；SSO 的 `login-url` 返回的是外部 provider 地址                                       | 否                                                 |
| 自定义 token issuance              | **Implemented**               | `/api/v1/getToken`、`/api/auth/login`、`/api/auth/external/login` 和 SSO callback 可签发 Agents JWT                            | 只能按私有 API 评估，不能称为 OAuth token endpoint |
| Bearer access token 接受           | **Implemented / Tested**      | Java filter 接受 `Authorization: Bearer`，也兼容 `token` header 和 query token；有 token 解析单测                              | 可确认兼容行为，尚无独立版本化 auth contract       |
| Cookie session                     | **Unknown**                   | 认证 filter/controller/client 范围内未发现 cookie 解析或 `Set-Cookie` 登录态                                                   | 否                                                 |
| PKCE                               | **Unknown**                   | 外部 SSO authorization-code 流程未构造 `code_challenge` / `code_verifier`                                                      | 否                                                 |
| OAuth `refresh_token` grant        | **Unknown**                   | 没有 `grant_type=refresh_token` 的 Agents endpoint                                                                             | 否                                                 |
| 临期自动换 JWT                     | **Implemented / 部分 Tested** | filter 在剩余不足 30 分钟时自签新 JWT，并通过 `X-Refreshed-Token` 返回；JWT 工具有单测，未发现 filter 端到端测试或前端接收逻辑 | 私有行为，不是 OAuth refresh                       |
| revocation endpoint                | **Unknown**                   | Redis 层可以删除 token，但未发现公开 revoke 路由                                                                               | 否                                                 |
| logout endpoint                    | **Unknown**                   | 未发现服务端 logout 路由；Web 客户端只删除本地存储                                                                             | 否                                                 |
| 稳定 subject / tenant / org claims | **Unknown**                   | `sub` 是 username；org/role 多在 Redis 登录对象中，普通 JWT 不携带；外部登录的自定义 claims 会在自动换 JWT 时丢失              | 否                                                 |
| 登录 JWT JWKS                      | **Unknown**                   | 登录 JWT 使用共享 HMAC secret；未发现对应 JWKS                                                                                 | 否                                                 |
| Bridge catalog/invoke 鉴权         | **Implemented / Tested**      | Bridge 解析或恢复 credential，但 Bridge 本身不验 JWT；无 header 时可使用会话或环境 token                                       | 目前是内部桥接机制，不是第三方认证边界             |

## 事实证据

### 1. Token issuance 是私有登录 API，不是 OAuth/OIDC token endpoint

`POST /api/v1/getToken` 带有 Swagger `@Operation`，但方法只接收 `clientId`、`clientSecret`，返回单个 `token` 字段；没有 `grant_type`、`token_type`、`expires_in`、`scope`、`refresh_token` 或 OAuth error contract。服务实现把 `clientId/clientSecret` 直接交给本地用户名密码登录逻辑：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/APILoginController.java:16-41 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/service/impl/APILoginServiceImpl.java:13-17 @ f4b82997…`

普通平台登录 `POST /api/auth/login` 同样调用本地用户名密码认证。`POST /api/auth/external/login` 则依赖静态 `systemId/systemSecret` 信任外部系统，并签发 Agents JWT。这两个响应自行写入 `expiresIn: 7200`，没有对应的 OAuth token response schema：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:37-55 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:65-92 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:99-122 @ f4b82997…`

`/api/auth/` 和 `/api/v1/getToken` 被列入 Java app 白名单，因此它们可以作为登录入口调用；这只能证明路由可达，不能证明 OAuth 合规或长期兼容承诺：

- `/Users/xli/agents/app/agents-app/src/main/resources/application-prod.yml:149-184 @ f4b82997…`

### 2. JWT 是 Agents 自签 HMAC token，身份语义依赖 Redis 登录对象

`JwtTokenUtil` 使用共享 HMAC key 验签和签名。标准字段包括 `iss=kingsware`、`sub`、`iat`、`exp`，另有私有 `created`；代码中的 `audience` 是自定义 claim 名，不是明确发布的 OIDC `aud` contract：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:30-45 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:117-126 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:185-203 @ f4b82997…`

普通登录只把 username 放进 `sub`。权限、用户 uuid、orgId、roles 等在登录响应和 Redis session object 中，不在普通 JWT 中：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/service/basic/impl/LoadUserAuthorityImpl.java:89-103 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/service/basic/impl/BasicUserServiceImpl.java:952-962 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/global/TokenLibrary.java:226-258 @ f4b82997…`

因此，`sub` 当前表示可登录 username，不是已承诺的不可变 user id；也没有统一 tenant/org claim。Adapter 仅离线解析 JWT 无法重建 Java app 实际采用的组织和权限上下文。

### 3. Bearer、header、query token 都是兼容输入；真正校验发生在 Java filter

`JwtTokenFilter` 的解析优先级是 `token` header、`Authorization: Bearer`、`token` query、`_token` query。之后它检查 JWT 过期时间，从 Redis 取登录对象或按 `sub` 重新加载用户，再把认证对象放入 Spring Security context：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:94-140 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:142-178 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:198-215 @ f4b82997…`

仓库单测确认了四种 token 输入的优先级，但没有覆盖完整的 Redis、失效、自动换 token 和 Spring Security 过滤链：

- `/Users/xli/agents/app/agents-app/src/test/java/com/kingsware/aiam/manage/filter/JwtTokenFilterTest.java:9-31 @ f4b82997…`

`POST /api/auth/token/verify` 提供私有校验 API，解析规则与 filter 类似，并返回完整 login object。它不是 OAuth introspection endpoint：请求和响应没有 RFC 7662 的 `token` form contract、`active`、`client_id`、`scope` 等字段：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:125-170 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:173-191 @ f4b82997…`

### 4. “刷新”是活跃请求触发的自签 JWT 轮换，不是 refresh token grant

filter 在 JWT 剩余有效期不足 30 分钟时调用 `refreshToken(oldJwt)`，删除旧 token 的 Redis 映射、写入新 token，并把新 JWT 放在响应头 `X-Refreshed-Token`：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:149-166 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:273-276 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/global/TokenLibrary.java:261-270 @ f4b82997…`

`JwtTokenUtil.refreshToken` 只从旧 token 重建 `sub`、`audience`、`atoken`、`rtoken`。外部登录写入的 `externalUserId`、`deptId`、`userType` 不在保留清单中，因此这些 claims 在自动轮换后会消失：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:212-226 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:248-263 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:65-73 @ f4b82997…`

JWT 工具单测确认新 token 的时间戳变化，以及指定私有 claims 的保留；它没有把该机制定义成公开 refresh contract：

- `/Users/xli/agents/app/agents-app/src/test/java/com/kingsware/aiam/manage/security/JwtTokenUtilTest.java:41-62 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/test/java/com/kingsware/aiam/manage/security/JwtTokenUtilTest.java:299-320 @ f4b82997…`

前端统一请求代码只从 `localStorage.token` 发送 `token` header，未读取 `X-Refreshed-Token`。这意味着仓库内可见的客户端没有完成服务端轮换协议：

- `/Users/xli/agents/k-agentic-flow/app/utils/request.ts:124-167 @ f4b82997…`

默认 JWT 配置是 7 天，并按小时边界生成过期时间；这与两个登录接口硬编码返回的 `expiresIn: 7200` 不一致，所以客户端不能把 `expiresIn` 当成可靠 contract：

- `/Users/xli/agents/app/agents-app/src/main/resources/application-prod.yml:109-114 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/security/JwtTokenUtil.java:129-143 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:87-90 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/api/controller/ExternalAuthController.java:108-118 @ f4b82997…`

### 5. Redis 删除能力不等于公开 revocation/logout contract

`TokenLibrary.logout(token)` 会删除 token key 和对应 online-user key，filter 在 token 解析失败、过期或用户禁用时也会调用它：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/global/TokenLibrary.java:304-316 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/filter/JwtTokenFilter.java:110-147 @ f4b82997…`

但是，在 controller、route definition、测试和仓库内官方文档中未发现面向客户端的 logout 或 revocation endpoint。Web 端 `handleLogout` 只删除 `localStorage` 并跳转或通知父窗口，没有通知服务端撤销 Redis 登录态：

- `/Users/xli/agents/k-agentic-flow/app/utils/auth.ts:12-42 @ f4b82997…`

### 6. SSO 是 OAuth2 client，不是 Agents 的 authorization server

Agents 的 SSO 路由只有“生成外部 provider 登录 URL”和“接收 code callback”。回调校验一次性 state、向外部 provider 换 access token、读取用户资料，然后签发 Agents 自有 JWT：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/controller/SsoAuthController.java:41-77 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/service/impl/SsoStateServiceImpl.java:17-30 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/service/impl/SsoLoginServiceImpl.java:34-57 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/service/impl/SsoLoginServiceImpl.java:59-87 @ f4b82997…`

provider 构造的是 authorization-code 请求，带 `client_secret` 换 token；没有 PKCE。代码读取并返回 access token，虽然日志检查上游响应中的 `refresh_token`，但没有保存或使用它：

- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/provider/impl/GjzqOauth2Provider.java:49-58 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/provider/impl/GjzqOauth2Provider.java:89-115 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/sso/provider/impl/GjzqOauth2Provider.java:124-141 @ f4b82997…`

单测覆盖 state、code exchange、用户创建后签发 Agents JWT，但没有 PKCE、OIDC id token、refresh、logout 或 revocation：

- `/Users/xli/agents/app/agents-app/src/test/java/com/kingsware/aiam/manage/sso/service/impl/SsoLoginServiceImplTest.java:43-115 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/test/java/com/kingsware/aiam/manage/sso/provider/impl/GjzqOauth2ProviderTest.java:43-64 @ f4b82997…`

仓库文档中的青松 `/oauth/token` 是 Java app 调用青松引擎的客户端配置，不是 Agents 对外 token endpoint：

- `/Users/xli/agents/app/agents-app/docs/agenticflow/tad/agenticflow-runtime-architecture.md:58-89 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/agenticflow/client/QingsongClientImpl.java:17-27 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/agenticflow/client/QingsongClientImpl.java:43-68 @ f4b82997…`

### 7. 登录 JWT 没有 discovery/JWKS；仓库中的 JWKS 仅是附件 ticket 提案

登录 JWT 使用共享 HMAC secret，因此当前没有供第三方自助验签的公钥发现机制。仓库中确有 `/.well-known/jwks.json` 文本，但它属于“跨服务文件下载 ticket”的设计提案，文档使用“建议增加”，并把是否开放 JWKS 列为待确认事项；它不是已实现的登录 JWT discovery：

- `/Users/xli/agents/app/agents-app/docs/agenticflow/prd/af-cross-service-file-download-auth-architecture.md:216-241 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/docs/agenticflow/prd/af-cross-service-file-download-auth-architecture.md:704-724 @ f4b82997…`

该项状态应标为 **Proposed**，且不能用来推导 Agents 支持 OIDC。

### 8. Bridge catalog/invoke 的 token 路径是 credential resolution，不是认证协议

`GET /bridge/agents/catalog` 和 `POST /bridge/agents/invoke` 的 token 来源依次包括显式 header、conversation/session registry、环境变量和字符串 `internal`。这个函数不验签、不检查 expiry，也不要求 token 必须来自终端用户：

- `/Users/xli/agents/server_next/agent_engines/openclaw/bridge_router.py:294-340 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/bridge_router.py:417-443 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/bridge_router.py:440-480 @ f4b82997…`

Bridge 的会话注册表把原始 token 保存在进程内存，默认 TTL 为 1 小时；这个 TTL 与 JWT 自身 expiry 无关，也没有 refresh/revocation 同步机制：

- `/Users/xli/agents/server_next/agent_engines/openclaw/token_registry.py:1-28 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/token_registry.py:45-76 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/token_registry.py:93-126 @ f4b82997…`

Bridge 把 token 作为历史 `token` header 转发到 Java app 的 `/kagent/agentMarket/all`，由 Java `JwtTokenFilter` 建立 login object；agent list 再按该 login object 中的 orgId、uuid 和 roles 过滤：

- `/Users/xli/agents/server/core/kagent/kagent_api.py:9-42 @ f4b82997…`
- `/Users/xli/agents/server_next/legacy_server.py:29-71 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/controller/agents/AgentConfigController.java:363-380 @ f4b82997…`
- `/Users/xli/agents/app/agents-app/src/main/java/com/kingsware/aiam/manage/service/agents/impl/AgentConfigServiceImpl.java:2752-2785 @ f4b82997…`

Bridge 单测确认 Bearer 和 `X-KI-Token` 只是被原样交给 `get_catalog`；同时也明确测试了**无请求 token**时使用环境内部 token，以及 invoke 无认证 header 仍能进入调用路径：

- `/Users/xli/agents/server_next/agent_engines/openclaw/tests/test_bridge_router.py:31-36 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/tests/test_bridge_router.py:58-78 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/tests/test_bridge_router.py:127-142 @ f4b82997…`

仓库内 OpenClaw skill 的 catalog/invoke 示例也不带认证 header，只传 conversation id，说明当前设计预期依赖内部会话恢复，而不是第三方 OAuth client：

- `/Users/xli/agents/server_next/agent_engines/openclaw/kiagents/SKILL.md:26-57 @ f4b82997…`
- `/Users/xli/agents/server_next/agent_engines/openclaw/kiagents/SKILL.md:99-145 @ f4b82997…`

官方集成方案记录了 header、registry、环境变量和内部 token 的解析优先级。这是内部桥接说明，未定义 token issuance、refresh 或 revocation：

- `/Users/xli/agents/docs/OpenClaw集成技术方案.md:549-631 @ f4b82997…`
- `/Users/xli/agents/docs/OpenClaw集成技术方案.md:654-680 @ f4b82997…`

## 不修改 Agents 时的首发影响

Agents 不配合修改不会阻止 Ki-Buddy 完成首个公开版本的基础用户接入，但会把认证能力限制为“固定 JWT + 失效后重新登录”，不能提供滑动会话和服务端 logout。

Ki-Buddy 可以独立完成以下功能：

1. 调用 Agents 现有私有登录 API，取得 JWT。
2. 将 JWT 保存到操作系统钥匙串，不写入普通配置文件或 renderer 存储。
3. 在 Bridge catalog/invoke 请求中携带固定 JWT。
4. 收到 `401` 后清除本地凭据并要求用户重新登录。
5. 用户点击 logout 时清除钥匙串和 Ki-Buddy 本地登录状态。

首发限制如下：

1. **无法形成滑动会话。** Java `JwtTokenFilter` 临期签发的新 JWT 只通过下游响应头 `X-Refreshed-Token` 返回。现有 Bridge catalog/invoke 路径只转发 credential 并返回业务结果，没有把 Java 下游的该响应头传回 Ki-Buddy；Ki-Buddy 因此无法更新钥匙串中的 token。
2. **logout 只在本地生效。** Ki-Buddy 删除本地 token 后，Agents 没有公开 logout/revoke endpoint，已签发 token 仍可能在远端有效到 JWT 的 `exp`。共享设备、token 泄露和需要立即撤销权限的场景会受到影响。
3. **有效期提示不可靠。** 登录响应写死 `expiresIn: 7200`，默认 JWT 配置却是 7 天。Ki-Buddy 不能据此准确安排刷新或提示剩余登录时间，只能以服务端 `401` 作为重新登录依据。
4. **请求可能被登录失效打断。** catalog/invoke 或长任务遇到 token 失效时需要结束当前操作并重新登录；首发版本不具备无感续期能力。

这些限制在首个公开版本可以接受，前提是产品明确采用本地退出、不承诺服务端立即撤销，并且 token 只存放在操作系统凭据存储。企业共享设备、强制即时登出、凭证泄露处置或更严格安全要求出现后，现状不再适合。

## 已确认的首发范围与远期需求

2026-08-11 的产品决定见 ADR 0003：首发允许使用 Agents 现有固定有效期 token，到期后返回登录页；Bridge 自动续期是高优先级后续需求，不阻塞首发。续期完成后不设置绝对会话上限，退出仍只清除 Ki-Buddy 本地凭证和运行状态。服务端 logout/revoke、强制下线和绝对会话上限不属于首发 Agents 配合范围。

该选择没有消除以下事实：旧 token 副本不会因本地退出立即失效；能够持续触发轮换的凭证副本可能长期保持访问；登录响应的 `expiresIn` 与 JWT 默认配置仍不一致。服务端 logout/revocation 已作为远期需求记录，触发原因包括共享设备、管理员强制下线、密码修改后立即失效、权限事件要求立即终止既有会话、凭证泄露处置、合规审计和多设备会话管理。

## 对 Agents MCP Adapter 的直接约束

1. **不能宣称 OAuth/OIDC 支持。** 当前最多能描述为“接受 Agents 私有 JWT 或内部服务 credential”。
2. **不要把 `/api/v1/getToken` 当 OAuth token endpoint。** 它缺少标准 request/response/error/refresh/revocation contract，且本质上是本地用户名密码登录。
3. **不要在 Adapter 内只解析 JWT 并自行授权。** `sub` 是 username，orgId/uuid/roles 来自 Redis login object；正确权限结果依赖 Java app。
4. **Bridge 必须新增明确的入口鉴权边界。** 现状允许 registry/env/internal credential resolution，适合受信任内部部署；直接暴露给第三方会把服务账号能力间接开放给无 token 调用者。
5. **完成 Bridge contract 后才能依赖 `X-Refreshed-Token`。** 当前 Bridge 和可见客户端尚未传递或接收它；首发改造必须覆盖所有能够触发轮换的远程路径，并验证系统凭据存储确实更新。
6. **本地退出不等于 logout/revocation。** 仅清理客户端凭证不会撤销 Redis token；Bridge registry 也不会同步撤销。首发接受该限制，远期服务端失效能力仍需要独立 contract。
7. **如要支持用户委托授权，应先确认 identity model。** 至少需要稳定 `sub`、tenant/org、scope/audience、token lifetime、key rotation、revocation 行为和 service-account impersonation 边界。

## 尚未解决的阻塞项

- Agents 产品是否愿意成为 OAuth 2.0 Authorization Server / OIDC Provider，还是由现有企业 IdP 负责；源码无法回答产品责任边界。
- 第三方 Adapter 使用终端用户 token、服务账号 token，还是 token exchange/on-behalf-of；现有 contract 没有定义。
- `sub=username` 是否允许改为不可变 user uuid；组织隔离应使用 `orgId`、`deptId`、tenant id 中的哪一个；现有实现不一致。
- 是否允许 Bridge 的环境 token 代表所有调用者，以及如何做调用者级审计和权限缩减。
- 登录 JWT 的签名算法、issuer、audience、JWKS/key rotation 是否会公开并版本化。
- refresh 后自定义 claims 丢失、`expiresIn` 与 JWT expiry 不一致、前端未接收新 token，这些实现问题在成为任何 contract 前需要先解决并补充端到端测试。

## 验证说明

- 2026-08-11 已成功 fetch `origin/dev`，当前复核基线为 `bed8ba415d2d34f98c65fceffefc1b4bfaba590e`。
- 本次通过 `git diff --name-only f4b82997..bed8ba415` 和工作区只读检查进行静态核查；指定的 auth 与 Bridge 路径没有相关改动。没有访问运行中的 Agents 部署。
- 检查范围覆盖 `server_next`、legacy Python server、Java app、`k-agentic-flow` Web client、route/OpenAPI annotations、测试和仓库内官方文档。
- 针对 `openid-configuration`、OIDC、authorization/token endpoint、PKCE、`code_challenge`、`code_verifier`、`refresh_token` grant、logout、revocation、JWKS、Bearer、cookie、claims 和 Bridge 路径进行了仓库检索。
- **本次未运行 Java、Python 或 Web 测试套件。** 文中的 **Tested** 仅表示基线仓库存在相应测试源码，不表示本次确认测试通过。
