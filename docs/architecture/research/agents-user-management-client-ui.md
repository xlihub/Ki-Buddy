# AionUi v2.1.52 产品账户与 upstream 认证实现调研

> 产品策略更新（2026-08-11）：本文对 AionPro 生产发布物的观察继续有效；其中“复用产品当前账户”的早期设计推论已被 ADR 0003 取代。Ki-Buddy 不使用 AionPro cloud account，而是直接登录 Agents 平台，并把 AionPro 的主进程身份边界、Core 用户投影和退出清理作为产品经验。

## 结论

用户安装的官网 AionUi v2.1.52 已经实现真实的桌面账户体系，并在首次启动或 session 失效时要求登录。桌面端包含账户页、用户 ID、邮箱和退出登录；登录使用浏览器 + PKCE，refresh token 存入系统钥匙串，access token 只保存在 Electron 主进程内存。refresh 支持 token 轮换，logout 会先请求 cloud session revoke，再清除本地 session。

同一产品构建还固定以 `aionpro` identity mode 启动 AionCore：AionUi cloud user 被投影为 Core external user，主进程换取 Core session；退出或账号变化时撤销该用户的 Core session。这套能力已经提供可用于本地数据隔离的真实用户身份。

公开仓库的 `v2.1.52` tag 与官网 v2.1.52 安装包不是同一套认证实现。公开 tag 的 Electron `AuthContext` 仍直接标记 authenticated 且 `user=null`；官网安装包则包含公开 tag 中不存在的 desktop auth、Account UI、`keytar`、Firebase 和 CoreUserBridge 代码。公开 workflow 和更新文案也明确区分 OSS AionUi build 与 AionPro build，并说明新版安装包由官网分发、需要登录。因公开资料没有给出官网安装包对应的私有 branch/commit，不能把公开 tag 的行为用于推断产品安装包，也不能反向声称已经定位产品源码 commit。

这改变了 Agents MCP Adapter 的设计前提：产品不应新增第二套“本地当前用户”，也不应让 Adapter 自行保管 AionUi refresh token。仍未解决的是 AionUi cloud identity 与 Agents platform identity 的绑定，以及 Agents 是否提供可长期依赖的 token exchange、OAuth/OIDC、refresh 和 revocation contract。

## 基线与方法

### 官网产品发布物

- 用户截图与实际安装路径：`/Applications/AionUi.app`。
- `CFBundleShortVersionString`：`2.1.52`。
- `app.asar`：`/Applications/AionUi.app/Contents/Resources/app.asar`。
- `app.asar` SHA-256：`29c8eb4af1b248d4b831343d602c9c98058a54b6d9ac656acb12f6d1277aca97`。
- 内置 Core：`/Applications/AionUi.app/Contents/Resources/bundled-aioncore/darwin-arm64/aioncore`。
- Core `--version`：`aioncore 0.1.62`。
- Core binary SHA-256：`56de1278e00c9861117f614f0f84dafebcb917f9aa45f9ccc0519b9a6f23ee3a`。
- 只读解包目录：`/tmp/aionui-asar-analysis.mWnkEB/extracted`。

发布物观察标为 **Observed**。解包结果可以证明用户实际安装的二进制包含哪些行为，但不能证明其私有源码 commit、服务端部署版本或所有线上错误路径。

### 公开 upstream

- remote：`git@github.com:iOfficeAI/AionUi.git`。
- 2026-08-10 执行 `git fetch upstream --prune --tags` 后，`upstream/main` 为 `85627c80454e0a85e7b81a9dd8dc967900df2b05`。
- 公开 `v2.1.52` tag 为 `7ebae30aaf33c03dd035b0621346c568b4eab897`。
- 当前设计分支：`design/agents-mcp-productization`；没有 checkout、pull、commit 或 push。

公开源码状态标为 **Implemented**；仓库中存在直接自动化测试时标为 **Tested**；找不到可发布 contract 或产品源码映射时标为 **Unknown**。

## 产品 v2.1.52 的桌面认证

### 登录入口与强制认证

**Observed**：实际 renderer 通过 Electron auth IPC 获取 `authenticated` / `unauthenticated` 状态。desktop auth 不再走公开 tag 中的直接放行逻辑，而是调用 `getSession`、`login`、`logout`、`refresh` 和 `changed`。发布物包含 “Sign in to AionUi”、Account、User ID、邮箱、logout modal 等 UI；未认证页面与业务路由分离，首次登录前的引导使用静态资源，避免请求会返回 401 的业务 API。

证据：

- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/renderer/assets/index-fF3BtVt4.js:71`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/renderer/assets/index-fF3BtVt4.js:7067`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/renderer/assets/index-fF3BtVt4.js:8482`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/renderer/assets/index-fF3BtVt4.js:8638`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:37439-37502`

renderer bundle 被打成极少数长行，因此其行号粒度较粗；主进程 bundle 保留了可读的模块边界与注释。

### Browser login 与 PKCE

**Observed**：桌面登录生成随机 `code_verifier`、S256 `code_challenge` 和 `state`，启动 loopback callback，然后打开 AionUi authorize 页面。callback token 与 `code_verifier` 被提交到自定义 `POST /account/login_by_token`。该流程使用 PKCE，但服务端接口不是从公开标准 metadata 发现的 OAuth/OIDC contract。

相关 endpoint：

- `/account/login_by_token`
- `/account/account/refresh_access_token`
- `/account/account/user_info`
- `/account/account/logout`

证据：

- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:8260-8316`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:8495-8668`

**Unknown**：官网服务是否发布 OIDC discovery、JWKS、标准 token endpoint、scope/audience contract 或 RFC 7009 revocation contract。安装包只能证明客户端使用上述私有 endpoint。

### Token 获取、存储与轮换

**Observed**：

- `CLIENT_ID` 为版本相关的 `aionui_desktop_${APP_VERSION}`；系统钥匙串使用稳定 account `refresh_token:${env}:aionui_desktop`，便于跨桌面版本读取同一产品 session。
- refresh token 通过 `keytar` 保存，macOS 上对应系统钥匙串；`auth.enc` 只保存 schema、环境、client id、过期时间与用户摘要，不保存 token。
- keytar 不可用时 session 只存在于内存，不以明文文件替代。
- access token 只在 Electron 主进程内存中，普通 cloud API 请求自动添加 Bearer header。
- access token 在过期前 60 秒刷新；401 会强制刷新并重试一次。
- refresh response 若返回新 refresh token，则更新钥匙串；refresh 失败会清除整个 session。
- HTTP debug logger 对 token、authorization、code verifier、password 和 cookie 做敏感字段过滤。

证据：

- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:7353-7488`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:7508-7525`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:7660-7735`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:8495-8768`

### Logout 与账号隔离

**Observed**：logout 给 cloud revoke 最多 5 秒；无论服务端成功、失败或超时，客户端都会取消进行中的登录并清除 access token、refresh token、用户摘要和钥匙串记录。当前产品 UI 展示单个 active account；账号变化通过退出后重新登录完成，没有观察到并列保存多个可切换账号的 UI。

证据：

- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:8677-8704`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:8558-8615`

**Unknown**：cloud logout 是撤销单个 refresh token、整个设备 session 还是账户的所有 session；安装包没有公开服务端 contract。也未观察到账号列表、tenant/org selector 或多账号并存的安全存储 schema。

## 产品 v2.1.52 与 AionCore 的身份投影

**Observed / Core Implemented**：产品主进程固定设置 `CORE_IDENTITY_MODE = "aionpro"`。`CoreUserBridge` 将 cloud user id 作为 external user id，执行：

1. `PUT /api/auth/internal/external-users/{external_user_id}` provision Core user；
2. `POST /api/auth/internal/external-sessions` 换取 Core session；
3. Core JWT 只保存在主进程内存，并为 renderer 写入 HttpOnly `aionui-session` Cookie；
4. 账号变化或 logout 时调用 `POST /api/auth/internal/external-sessions/revoke`，清除 renderer 与配对 WebUI 的 Core session。

internal endpoint 使用每次 Core 进程启动生成的 bootstrap secret，secret 和 Core JWT 都不通过 renderer IPC 暴露，也不持久化。

发布物证据：

- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:39388-39410`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:44778-45145`
- `/tmp/aionui-asar-analysis.mWnkEB/extracted/out/main/index.js:46662-46694`

AionCore v0.1.62 与刷新后的 upstream `main@f0f4fbd1` 都包含对应 external-user/session/revoke contract；两者在 auth、external session、MCP 与 OAuth 相关路径没有功能差异。详细证据见 `docs/architecture/research/aioncore-auth-identity-foundations.md`。

## 与公开 v2.1.52 tag 的差异

公开 tag 的 `AuthContext` 在 Electron 环境中仍有以下行为：

- `refresh()` 直接设置 authenticated，`user=null`；
- desktop `login()` 直接返回成功；
- desktop `logout()` 仍保持 authenticated。

证据：

- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:51 @ v2.1.52`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:121-127 @ v2.1.52`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:152-157 @ v2.1.52`
- `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:255-260 @ v2.1.52`

这不是官网 v2.1.52 的产品行为。以下公开材料解释了两条发布线的存在：

- workflow 注释写明 OSS `-final` build 引导用户到 AionPro 官网，AionPro 有自己的 release tags：`/Users/xli/AionUi/.github/workflows/_build-reusable.yml:34-38 @ v2.1.52`。
- 中文更新文案写明新版需要登录，支持 Google 登录，安装包与更新由官网提供：`/Users/xli/AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-CN/update.json:80-93 @ v2.1.52`。
- 官网安装包的 package 依赖包含 `firebase`、`keytar`、`node-machine-id`，公开 tag 的 root package 不包含这些依赖。

因此版本号只能证明产品版本，不能证明官网发布物与公开 tag 使用同一源码树。

## 对 Agents MCP Adapter 的直接约束

1. **复用产品当前账户作为本地身份入口。** Core `CurrentUser.id` 已由 cloud user 投影产生，可作为 inventory、catalog cache 与本地文件引用的第一层隔离键。远端 task 与审计记录由 Agents 平台拥有。
2. **不新增第二套本地用户系统。** 仍需定义 `AgentsIdentityBinding`，把 AionUi cloud user、Core user、Agents stable subject 与 tenant/org 显式绑定。
3. **Adapter 不接触 AionUi refresh token。** refresh token 继续只由 Electron 主进程和系统钥匙串持有；renderer、AionCore 与 stdio Adapter 都不能读取它。
4. **不能把 AionUi 私有 auth endpoint 称为稳定 OAuth/OIDC contract。** 产品已实现 PKCE、refresh rotation 与 cloud logout，但公开 discovery、claims、audience、revocation 语义仍是 Unknown。
5. **不能直接把 AionUi access token 发送给 Agents。** 只有在 issuer/audience 与 Agents 验证 contract 被双方明确发布后才可复用；优先考虑由受信任后端执行 token exchange，向客户端签发短时、Agents-audience 的调用凭证。
6. **统一退出链路。** AionUi logout、Core external-session revoke、Adapter 停止本地等待、按用户缓存清除与 Agents credential 失效必须形成显式状态机。客户端退出不表示远端 active invocation 已取消；cancel 与后续状态只能通过正式 MCP contract 获得。
7. **MCP server OAuth 与产品账户是不同身份域。** AionCore 现有 MCP OAuth 不能代替 Agents 平台用户认证；其 SQLite token 路径当前也未证明真实加密，不适合保存 AionUi cloud refresh token。

## 仍需平台 contract 回答的问题

- Agents 是否接受 AionUi cloud identity，还是要求独立登录。
- 是否提供稳定的 token exchange/on-behalf-of endpoint，以及 subject、tenant/org、scope、audience 与 expiry contract。
- 是否提供 refresh、rotation、logout/revocation、account disable 与 tenant membership change 的通知或查询机制。
- catalog 和 invoke 是否按同一主体与 tenant 执行授权，错误是否能区分 unauthenticated、forbidden、tenant mismatch 与 credential expired。
- Bridge 当前的私有 JWT/registry/environment token 路径何时退出，是否允许没有终端用户凭证的内部 token 继续访问用户 catalog。

## 验证说明

本次只读检查用户实际安装的官网 v2.1.52、公开 `v2.1.52` tag、刷新后的 AionUi upstream `main` 与 AionCore upstream `main`。没有执行登录 E2E、修改安装包、切换分支、commit 或 push。发布物行为标为 Observed；服务端语义与私有源码映射无法由安装包证明的部分均标为 Unknown。
