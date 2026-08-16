# AionUi Extension 模块能力边界与 Ki-Buddy 产品化研究

## 研究范围

本文只使用以下一手资料：

- [xlihub/Ki-Buddy Issue 18](https://github.com/xlihub/Ki-Buddy/issues/18)；
- `/Users/xli/AionUi` 当前 `product/main` 工作树中的源码、测试、示例和仓库文档；
- `/Users/xli/AionCore` 当前工作树中的 extension、assistant、skill、agent、MCP 和 managed runtime 源码与测试。

研究快照：AionUi `0eadee0eae90e91b92bce671232b49cbe6271fac`，Ki-Core/AionCore
`5d66f83408e731299a8abe06173fff960c6b6655`，两者均为 `product/main`。

路径前缀 `AionUi/`、`AionCore/` 分别指上述两个工作树。本文分析当前实现，不把旧文档或注释当成高于运行代码和测试的事实。

## 结论

当前 extension 是一个通用贡献系统，不是产品定制系统。它已经具备 manifest 解析、扫描、按用户启停、独立查询 API，并在 renderer 中实际接入了主题候选项、设置页和 MCP 展示；但 assistant、skill、agent/ACP adapter 目前只停留在 manifest/registry/独立 API，业务 catalog 没有消费它们。

因此，不能用一个普通 extension 完成 Ki-Buddy 产品化。品牌、宿主产品语义、默认 token、模块显隐和 Issue 18 的安全边界都需要产品配置或源码接缝。Ki-Buddy 的内容资源可以复用现有 manifest 字段或内置资源格式，但加载结果必须进入受信任的 product built-in 来源，不能伪装成可由用户禁用的普通 extension。

| 目标                 | 当前 extension 可直接实现                                       | 必须修改源码或增加产品接缝                                                                                                 |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 品牌、产品语义、图标 | extension 自己的名称、icon、私有设置页和 namespace i18n         | 安装包身份、应用图标、renderer logo、宿主文案、产品链接、默认主题与 token                                                  |
| renderer 显隐        | 只能新增设置页，不能移除或替换宿主模块                          | product capability、导航过滤、路由保护、隐藏功能的后台初始化条件                                                           |
| 助手                 | manifest 可解析并通过 `/api/extensions/assistants` 独立查询     | 当前 `/api/assistants` 明确排除 extension，renderer 不查询独立接口；需复用 builtin assistant 路径并增加产品来源与 MCP 绑定 |
| 技能                 | manifest 可解析并通过 `/api/extensions/skills` 独立查询         | `/api/skills` 尚未接入 ExtensionRegistry，renderer 只消费 `/api/skills`；产品内置技能应走 builtin/product corpus           |
| MCP                  | extension MCP 已在 Tools 页只读展示，可复用卡片和 tools list UI | 安全 DTO、受保护 product ID/name、后端不可编辑/删除/禁用、同名保护、managed Adapter、专用检测、认证与打包测试              |
| agent / ACP adapter  | manifest 可解析并通过独立 extension API 查询                    | extension row 尚未进入 `agent_metadata`，renderer 不消费独立 API；产品 agent 需进入正式 agent registry 并隐藏 command/env  |
| 主题                 | 可进入 Appearance 候选列表                                      | 当前 active resolver 不含 extension theme，点击后不会按该 CSS 正确应用；产品默认主题更不能依赖异步 extension registry      |

建议定位：extension 可以作为“贡献格式”和“资源容器”复用；产品身份、安全边界和默认行为由 Ki-Buddy product adapter / product catalog 拥有。Issue 18 可复用 AionCore 的通用 MCP connection-test 内核，但不应把普通 extension MCP 直接提升为产品 built-in。

## 1. Extension 的真实架构

### 1.1 Manifest schema 与解析

AionCore 中的 `ExtensionManifest` 是当前实际 schema。顶层支持 metadata、engine、dependencies、entry point、permissions、lifecycle、i18n 和 `contributes`（`AionCore/crates/aionui-extension/src/types.rs:343-375`）。`contributes` 支持：

- `acp_adapters`
- `mcp_servers`
- `assistants`
- `agents`
- `skills`
- `themes`
- `channel_plugins`
- `webui`
- `settings_tabs`
- `model_providers`

对应定义见 `AionCore/crates/aionui-extension/src/types.rs:282-305`。AionUi 示例使用 camelCase 字段和 `$file:`，例如 `AionUi/examples/hello-world-extension/aion-extension.json:27-34`。

实际 parser 会：

- 递归解析 `$file:`，canonicalize 后拒绝逃出 extension 根目录并检测循环引用（`AionCore/crates/aionui-extension/src/manifest.rs:50-134`）；
- 把 `displayName`、`apiVersion`、`acpAdapters`、`mcpServers`、`settingsTabs` 等兼容字段规范化为 Rust 字段名（同文件 `:136-208`）；
- 目前只显式校验 extension name 和 semver version（同文件 `:8-48`）；
- `ExtensionManifest` 没有 `deny_unknown_fields`，因此当前 serde 解析会忽略未声明字段，不能把示例 `$schema` 当作严格的运行时校验边界。

Manifest 支持声明不等于产品功能已经接入。后续每一类 contribution 都需要分别检查业务 catalog 和 renderer 是否消费。

### 1.2 扫描、优先级与启停

生产扫描路径按以下顺序解析：

1. `AIONUI_EXTENSIONS_PATH`；
2. `<data_dir>/extensions`；
3. 从 `<data_dir>` 推导的 legacy AppData sibling。

E2E 模式只读取环境变量路径（`AionCore/crates/aionui-extension/src/loader.rs:21-118`）。同名 extension 由最先扫描到的副本获胜，因此环境变量路径优先（同文件 `:134-159`）。来源枚举只有 `local | appdata | env`，没有 `builtin` 或 `product`（`AionCore/crates/aionui-extension/src/types.rs:382-409`）。

Registry 的 enable/disable 对所有已安装 extension 使用同一规则，没有产品保护分支（`AionCore/crates/aionui-extension/src/registry.rs:200-278`）。禁用后，registry 会过滤该 extension 的 ACP adapter、MCP、assistant、agent、skill、theme、settings tab 等全部贡献（同文件 `:483-516`）。

这意味着：把 Ki-Buddy built-in 放到普通 extension 扫描路径，会同时接受环境变量同名优先和用户 disable。它不符合 Issue 18 的稳定产品身份和不可禁用要求。

### 1.3 Main、preload、HTTP bridge 与后端

Extension 服务端在 AionCore，不在 Electron main：

```text
aion-extension.json / contribution files
        ↓
AionCore aionui-extension loader + registry
        ↓ /api/extensions/*
AionUi common HTTP bridge
        ↓
renderer 中各业务页面或 hook
```

证据：

- AionCore 注册 themes、assistants、ACP adapters、agents、MCP、skills、settings tabs、enable/disable 等路由（`AionCore/crates/aionui-extension/src/routes.rs:137-166`）。
- AionUi `ipcBridge.extensions` 对应映射到 `/api/extensions/*`（`AionUi/packages/desktop/src/common/adapter/ipcBridge.ts:1904-1920`）。
- `httpBridge` 说明原 IPC 已由 REST/WebSocket 替换，请求发送到本地 AionCore（`AionUi/packages/desktop/src/common/adapter/httpBridge.ts:1-8,155-213`）。
- Electron main 启动 `BackendLifecycleManager`，preload 只暴露 backend port 和产品 capability，不解析 extension manifest（`AionUi/packages/desktop/src/index.ts:203-213`；`AionUi/packages/desktop/src/preload/main.ts:18-39,81-91`）。
- 后端子进程继承 `process.env`，因此开发/E2E 的 `AIONUI_EXTENSIONS_PATH` 会传到 AionCore（`AionUi/packages/web-host/src/backend-launcher.ts:228-239`）。

这条边界决定了实现位置：数据来源、不可变规则、凭据和进程生命周期必须在 AionCore/Ki-Core；AionUi 只负责产品 runtime 选择、API contract 与 renderer 展示。

## 2. 每类 contribution 的加载与消费状态

### 2.1 Assistants：能解析、能独立查询，但没有进入可用助手目录

Extension registry 会解析 assistant，并由 `/api/extensions/assistants` 返回 `ext-*` ID、agentId、enabledSkills、prompts 等字段（`AionCore/crates/aionui-extension/src/routes.rs:225-256`）。但当前正式助手目录 `/api/assistants` 明确排除 extension assistant：E2E 断言列表中没有 `ext-helper`，也没有 `source=extension`（`AionCore/crates/aionui-app/tests/assistants_e2e.rs:366-401`）。

Renderer 的 Guid/Settings 只调用 `ipcBridge.assistants.list`，没有调用 `extensions.getAssistants`（`AionUi/packages/desktop/src/renderer/pages/guid/hooks/useCustomAgentsLoader.ts:21-45`；对 renderer 全量搜索只有 theme 与 MCP 调用 extension contribution API）。该 hook 在 `:14-16` 声称目录已合并 extension，是已经过时的注释，与服务端 E2E 不一致。

所以 extension assistant 当前只能“被 registry 解析和独立查询”，不能直接成为用户可选择的助手。

AionCore 已有可复用的 builtin assistant 路径：`BuiltinAssistant` 支持稳定 ID、i18n 名称/描述、avatar、`agent_ref`、enabled/custom/disabled skills、rule、prompts、models、sort order、default enabled（`AionCore/crates/aionui-assistant/src/builtin.rs:32-71`）。它由编译期 corpus 物化为 `source=builtin` 的 assistant definition（`AionCore/crates/aionui-assistant/src/service.rs:240-333`）。

但当前 builtin schema 没有 MCP 字段，物化时固定写入：

```text
default_mcps_mode = "auto"
default_mcp_ids   = "[]"
```

证据在 `AionCore/crates/aionui-assistant/src/service.rs:325-330`。因此 Ki-Buddy 自有助手可以复用 builtin assistant corpus 和 materialization 流程，但仍需：

- 增加可信的 `product_builtin` 来源或等价产品归属，避免与上游 builtin 语义混合；
- 增加显式 MCP 绑定字段及物化逻辑；
- 让 product capability 决定哪些上游 builtin 对 Ki-Buddy 可见；
- 保持 renderer 只消费统一 `/api/assistants`，不要再并行拼接 extension API。

### 2.2 Skills：extension registry 与正式 skills catalog 尚未接通

Extension registry 能解析 skill，并由 `/api/extensions/skills` 返回 name、description、location（`AionCore/crates/aionui-extension/src/routes.rs:378-397`）。但正式 `/api/skills` 使用 `skill_service`；其源码注释明确说明 `SkillSource::Extension` 只是为未来接入 ExtensionRegistry 预留，当前 pilot 只产生 builtin/custom（另有 cron 路径）（`AionCore/crates/aionui-extension/src/skill_service.rs:255-267`）。正式列表实现读取 builtin corpus 和用户/数据库技能，没有 registry contribution 合并（同文件 `:289-346`）。

Renderer 只调用 `/api/skills`（`AionUi/packages/desktop/src/common/adapter/ipcBridge.ts:773-784`），没有调用 `extensions.getSkills`。因此文档或类型中出现 `source: extension` 不代表它已可用。

Ki-Buddy 自有技能可以复用 AionCore 已有 builtin skill corpus、materialization、read/delete protection；若希望继续使用 extension manifest 的 skill 描述格式，需要新增 product resource → skill repository 的显式导入步骤。普通 extension contribution 目前不能直接满足“产品内置技能”。

### 2.3 Agents / ACP adapters：独立 API 存在，正式 agent registry 尚未接入

`/api/extensions/agents` 与 `/api/extensions/acp-adapters` 会返回声明，其中 ACP adapter 响应包含 `cliCommand`、`defaultCliPath`、args、env、endpoint 等完整执行配置（`AionCore/crates/aionui-extension/src/routes.rs:258-330`）。

当前应用启动代码明确注释：extension-contributed rows 要在后续工作中写入 `agent_metadata`，现在只依赖 builtin + internal seed rows（`AionCore/crates/aionui-app/src/router/state.rs:247-250`）。Renderer 的 Agent Settings 消费 `/api/agents/management`，并明确要求业务 assistant picker 不依赖 `/api/agents`（`AionUi/packages/desktop/src/renderer/hooks/agent/useManagedAgents.ts:27-45,62-69`）；renderer 没有调用 `extensions.getAgents` 或 `getAcpAdapters`。

所以这两种 contribution 目前也是“可解析/可查询”，不是已注册的执行 agent。Ki-Buddy 产品 agent 必须进入正式 `agent_metadata` / AgentRegistry，并为 product source 定义：

- managed runtime 与可信 executable 解析；
- 不向 renderer 暴露 command、args、env；
- 用户能否启停、修改 path/env；
- 与 assistant session 的绑定和更新策略。

### 2.4 MCP：唯一已接入主要 renderer 业务面的运行贡献

AionUi `useMcpServers` 同时获取后端 MCP catalog 和 `/api/extensions/mcp-servers`，把后者转换为 `IMcpServer` 并强制 `builtin: false`（`AionUi/packages/desktop/src/renderer/hooks/mcp/useMcpServers.ts:6-52`）。两组数据直接拼接，没有在客户端去重（同文件 `:62-69`）。

工具页将 extension MCP 放入独立只读列表（`AionUi/packages/desktop/src/renderer/pages/settings/ToolsSettings/McpManagement.tsx:189-200`）；`isReadOnly` 会隐藏测试、编辑、删除和 OAuth 操作（`AionUi/packages/desktop/src/renderer/pages/settings/ToolsSettings/McpServerHeader.tsx:180-228`）；tools 子列表只显示 name 与 description（`AionUi/packages/desktop/src/renderer/pages/settings/ToolsSettings/McpServerToolsList.tsx:10-39`）。这部分 UI 可以复用。

但服务端 extension MCP 响应把完整 `transport` 和包含 transport 的 `original_json` 都返回 renderer（`AionCore/crates/aionui-extension/src/routes.rs:332-375`）。AionUi 又原样保存它们（`AionUi/packages/desktop/src/renderer/hooks/mcp/useMcpServers.ts:36-46`）。这与 Issue 18 的“客户端不出现 command、args、env、token、base_url、workspace”直接冲突。

另外，extension MCP 不在通用 MCP repository 中：

- Add/Import 页的已有名称只来自普通 `mcpServers`，不包含 extension 列表（`AionUi/packages/desktop/src/renderer/pages/settings/ToolsSettings/McpManagement.tsx:205-215`）；
- 通用 MCP service 虽会拒绝覆盖 repository 中 `builtin=true` 的同名项，并在 import 时跳过（`AionCore/crates/aionui-mcp/src/service.rs:243-290,179-224`），但看不到独立 extension registry 的名字；
- 通用 `delete_server` 和 `toggle_server` 没有检查 builtin，`edit_server` 甚至允许更新 builtin flag（同文件 `:86-177`）；
- Create/Import 请求也允许客户端提交 `builtin`（`AionCore/crates/aionui-api-types/src/mcp.rs:56-106`）。

因此现有 `builtin` 布尔值不是 Issue 18 要求的可信保护边界；普通 extension 的 UI 只读也不是后端只读。

### 2.5 Themes：能列出，当前选择/应用链路不完整

Extension route 会将 CSS 内容返回为 `is_preset=true` 的主题（`AionCore/crates/aionui-extension/src/routes.rs:199-223`）。Appearance 页面按 builtin → extension → user 顺序合并并按 ID 首次出现去重（`AionUi/packages/desktop/src/renderer/pages/settings/AppearanceSettings/CssThemeSettings.tsx:276-314`）。

但点击主题最终只把 ID 传给 `setActiveTheme`（`AionUi/packages/desktop/src/renderer/hooks/system/useTheme.ts:90-93`），后者只用 `BUILTIN_THEMES + userThemes` 解析 active ID，没有 extension themes（`AionUi/packages/desktop/src/renderer/utils/theme/applyTheme.ts:46-52`）。所以 extension theme 目前只是候选卡片，无法可靠选择、持久化和恢复。

Ki-Buddy 默认 token 必须在 ThemeProvider 初始化前由产品 runtime 决定。可以复用 `Theme`/CSS token 数据格式，但不能依赖设置页异步读取 extension theme。

### 2.6 Settings tabs 与 i18n：可新增，不能覆盖宿主

Settings tab 是另一个已接入 renderer 的 contribution。`useExtensionSettingsTabs` 查询、缓存并监听 extension 状态变化（`AionUi/packages/desktop/src/renderer/hooks/system/useExtensionSettingsTabs.ts:27-78`）。SettingsSider 先创建固定的 builtin 列表，再按 before/after anchor 插入 extension tab（`AionUi/packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx:27-38,83-178`）。

这个 contract 没有 remove、replace、hide。Extension i18n 只解析 extension namespace，不能覆盖宿主 locale key（`AionUi/packages/desktop/src/renderer/hooks/system/useExtI18n.ts:27-65`）。

## 3. 目标一：替换品牌、产品语义、图标与主题 token

### 3.1 Extension 能做的范围

- extension 本身和 contribution 的名称、描述、icon；
- extension settings tab 的页面和 namespace i18n；
- 主题数据格式与设计预览。

这些只改变 contribution，不改变宿主产品身份。

### 3.2 必须走产品配置/源码的范围

Ki-Buddy 已有独立产品配置：`AionUi/ki-buddy-product.json:1-69` 定义 runtime identity、package/electron-builder metadata、协议和更新源；`AionUi/packages/shared-scripts/src/kiBuddyRelease.js:150-185` 生成有效 package 与 builder config。这是品牌替换的正确入口，不属于 extension。

仍需扩展的部分：

- electron-builder 平台图标目前固定使用 `resources/app.ico|icns|png`（`AionUi/packages/desktop/electron-builder.yml:116-171`）；
- renderer 多处使用固定 `@renderer/assets/logos/brand/app.png`，产品配置没有 renderer asset mapping；
- 宿主 locale 中的 AionUi、官方助手/技能、About、更新和支持链接无法由 extension i18n 覆盖；
- UnoCSS 已使用 CSS semantic variables（`AionUi/uno.config.ts:59-62,210`），但默认 token 的选择必须进入产品 theme 初始化，而不是 extension theme gallery。

推荐增加集中式 product brand contract，例如产品名称、logo/OS icons、locale namespace、support/update URL、light/dark theme ID/token。宿主组件只消费 brand adapter，不在各页面散布 `isKiBuddy` 判断。

## 4. 目标二：renderer 按 Ki-Buddy 产品语义显隐

Extension 不能完成这个目标。SettingsSider 的 builtin tabs 是静态数组，Router 也静态注册上游页面（`AionUi/packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx:27-38`；`AionUi/packages/desktop/src/renderer/components/layout/Router.tsx:77-125`）。Extension 只能插入 tab。

CSS 隐藏不构成功能边界，因为 route、快捷入口、键盘/无障碍节点和后台订阅仍然存在。实现时至少要同时处理：

- SettingsSider、主 Sider 和其他入口的过滤；
- Router 对隐藏 route 的拒绝或重定向；
- 隐藏模块存在后台 watcher、polling 或初始化副作用时，以同一 capability 阻止启动。

当前已有可扩展的产品链：main 判断 runtime identity → preload 暴露 Ki-Buddy capability → renderer 建立 `KiBuddyRendererRuntime` → Router/Settings 挂载 Ki-Buddy 页面（`AionUi/packages/desktop/src/index.ts:185-192,229-240`；`AionUi/packages/desktop/src/preload/main.ts:18-39`；`AionUi/packages/desktop/src/renderer/services/runtime/kiBuddyRuntime.ts:25-50`）。

推荐在这条链上增加窄的 `ProductUiCapabilities`，集中描述可见 settings tabs、routes、sider entries 和 feature flags。产品 owned 页面继续放在 Ki-Buddy 模块；AionUi 上游文件只做 selector/lazy mount，符合 `AionUi/docs/contributing/ki-buddy-product-development.md` 的产品隔离规则。

## 5. 目标三：Ki-Buddy 内置助手、技能、MCP 与 agent

### 5.1 助手与技能

两者都不应以“普通 extension 已经接入”为前提：当前业务 catalog 没有消费 extension assistants/skills。

更适合复用的源码路径是：

- assistant：builtin corpus + `materialize_builtin_definitions`；
- skill：embedded builtin skill corpus + startup materialization + skill repository；
- extension manifest：只作为内容 authoring/import 格式，若保留，需要构建时转为可信 product resources。

需要新增 `product_builtin`（或等价、不可由请求伪造的来源），定义固定 ID、默认启用、排序、可编辑性、同名优先级和升级替换策略。助手还必须扩展 builtin schema/definition materialization，才能明确绑定 Issue 18 的 MCP，而不是沿用当前 `auto + []`。

### 5.2 Agent / ACP adapter

可以复用 ExtAgent/ExtAcpAdapter 字段和 AgentRegistry 的 runtime 能力，但不能直接查询独立 extension API 后在 renderer 拼接。应由受信任 product resource 写入 `agent_metadata`，让 agent factory/session 使用正式 registry，并只向 renderer 返回安全诊断投影。

若 command、args、env、endpoint 属于产品实现细节，它们必须留在后端。当前 extension ACP API 和普通 `ManagedAgent` DTO 都会暴露这些字段，不适合直接作为 Ki-Buddy product agent contract。

### 5.3 Issue 18：可复用点与必需改造

Issue 18 要求 packaged 自包含 JS Adapter、managed Node、稳定产品 ID/name、只读安全摘要、后端保护、当前账号真实 Agents catalog 检测、独立短生命周期实例、严格 Bridge contract、错误分类、脱敏与 packaged app 测试。普通 extension MCP 只覆盖了“声明 transport”和“在 Tools 页只读显示”这一小部分。

| Issue 18 要求                 | 现有可复用实现                                                                                                                                                         | 仍需实现                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| stdio handshake 与 tools/list | `McpConnectionTestService` 创建临时 client，执行 initialize → initialized → tools/list（`AionCore/crates/aionui-mcp/src/connection_test/mod.rs:40-95,97-155,205-217`） | 产品专用 probe 由后端选择 config，不让 renderer 提交 transport                                                  |
| managed Node                  | stdio test 对 Node tool 调用 `ensure_runtime_command_with_reporter`（同文件 `:119-138`）                                                                               | Adapter JS 进入产品 managed resources；固定路径/checksum；禁止用户 PATH fallback 的产品 contract                |
| 独立短生命周期                | 通用 route 注释和实现表明创建临时 client，stdio 完成/超时后杀进程树（`AionCore/crates/aionui-mcp/src/routes.rs:193-218`；connection test `:140-154`）                  | 独立 owner/scope，证明不复用或替换 Assistant session Adapter；并持久化“最近检测”而非实时健康                    |
| 只读 tools 摘要               | 现有 MCP 卡片和 tools list                                                                                                                                             | 新安全 DTO，只含 product ID/name/status/tool name+description/total；不含 transport/original_json               |
| 后端不可修改                  | 通用 repo 对 builtin 名称已有部分 create/import 冲突保护                                                                                                               | product source 不可伪造；拒绝 edit/delete/toggle/extension disable；create/import 同时检查 product catalog name |
| 当前账号 Agents catalog       | 无                                                                                                                                                                     | product auth/Bridge client，`agents_list` 完整性、total、严格 envelope/字段校验和 fail-closed                   |
| 错误与脱敏                    | 通用 MCP test 有部分 transport/protocol error                                                                                                                          | 区分 network/auth/server/contract；stdout purity、stderr redaction、缺配置安全失败；脱敏 fixture                |
| packaged app 证明             | AionUi 已携带 AionCore managed resources                                                                                                                               | 每个平台验证 Adapter JS + managed Node 存在且可执行的 unpacked packaged test                                    |

通用 `/api/mcp/test-connection` 的请求包含完整 transport 和可由 renderer 提交的 `runtime_scope_id`（`AionCore/crates/aionui-api-types/src/mcp.rs:155-164`；`AionUi/packages/desktop/src/renderer/hooks/mcp/useMcpConnection.ts:142-164`）。内部 service 很适合复用，但公开 contract 不适合产品检测。

建议增加窄接口：

```text
GET  /api/product/ki-buddy/agents-mcp/summary
POST /api/product/ki-buddy/agents-mcp/detect
```

Renderer 不提交 command/args/env/token/base_url/workspace，只触发 stable product ID。后端从 product catalog 解析 Adapter、managed Node 和当前账户能力，创建专用 detect owner，复用 MCP handshake，再附加 Agents Bridge `agents_list` 验证并返回安全结果。

## 6. 构建与打包边界

AionUi production 包通过 `extraResources` 携带 `resources/bundled-aioncore` 和 `resources/hub`（`AionUi/packages/desktop/electron-builder.yml:106-115`）。构建脚本准备 AionCore、Hub fallback 后调用 electron-builder（`AionUi/scripts/build-with-builder.js:742-768`；`AionUi/scripts/prepareHubResources.js:96-155`）。

`examples/` 没有进入 production extraResources；它只通过开发/E2E 的 `AIONUI_EXTENSIONS_PATH` 使用。因此把 Ki-Buddy extension 放进 examples 不能满足 Issue 18。

正式包以 `--managed-resources-mode bundled` 启动 AionCore（`AionUi/packages/web-host/src/backend-launcher.ts:199-218`）。当前资源 manifest 记录 Node root/executable（`AionUi/resources/bundled-aioncore/darwin-arm64/managed-resources/manifest.json:1-8`），但没有 Agents Adapter JS 条目。启动故障分类只检查 managed-resources 目录和后端二进制（`AionUi/packages/desktop/src/process/startup/backendStartupFailure.ts:120-169`），也不会证明 Adapter 可运行。

Issue 18 需要把 Adapter 加入 AionCore/Ki-Core managed resource export contract 或 Ki-Buddy product resource manifest，并在 unpacked packaged app 测试中用同一 resolver 启动，不能依赖 extension lifecycle、AionHub 下载或用户 Node/Bun。

## 7. 推荐的产品结构

### 7.1 Product manifest

扩展 `ki-buddy-product.json`，集中声明非敏感产品资源：

- brand assets、locale namespace、support/update URL；
- light/dark 默认 token；
- renderer UI capabilities；
- product built-in assistant/skill/agent/MCP 的资源索引；
- Adapter JS version、相对路径、checksum 和支持 runtime。

Renderer 只能读取展示能力，不读取真实 executable、env 或认证信息。构建脚本和后端各自校验自己使用的 subset。

### 7.2 Product catalog 与 extension registry 分离

新增可信来源 `product_builtin`，由打包路径和 product identity 决定，第三方 manifest 不能自报。统一 catalog 负责 stable ID、normalized name 冲突、排序、可编辑性和升级策略。

普通 extension 仍保留可禁用、独立查询的现有语义。不要为 Issue 18 改成“所有 extension 都不可禁用”，也不要依赖 ID 前缀或 renderer 数组顺序判断产品身份。

### 7.3 AionUi 中的薄接缝

AionUi 上游文件只承担：

- `ipcBridge` 的 product summary/detect 安全 contract；
- Tools 页的 product built-in MCP view model、检测按钮和最近结果；
- Settings/Router/Sider 的 capability filter；
- Theme/brand adapter 的选择。

Adapter、Agents Bridge 校验、账号认证、managed paths、进程 owner、product catalog 和敏感字段全部由 AionCore/Ki-Core 的 Ki-Buddy 产品模块承担。

## 8. 实现前仍需明确的产品 contract

源码可以证明当前行为，但 Issue 18 仍需产品 spec 明确：

- product MCP 的 stable ID 与保留 name，以及 name normalization 规则；
- Assistant 与 MCP 是 `fixed` 绑定还是用户可追加；
- product built-in assistant/skill 是否允许用户禁用或覆盖；
- detect 最近结果的持久化范围、有效期和多账号切换行为；
- Bridge 成功 envelope、agent 字段白名单、分页/total 完整性规则；
- network/auth/server/contract 四类错误的 UI 文案和可重试策略；
- Adapter 与 Assistant session 的 owner/scope 命名和退出时限；
- 各平台 Adapter 资源路径、checksum 与 packaged test 矩阵。

## 9. 建议实施顺序

1. 定义 `product_builtin` 来源、稳定 ID/name 及安全 summary/detect DTO；
2. 将 Adapter JS 纳入 managed product resources，并完成 resolver 与 packaged test；
3. 基于 `McpConnectionTestService` 实现 product probe，再增加 Agents Bridge catalog 校验、错误分类和脱敏；
4. 在后端实现 edit/delete/toggle/import/create/extension-disable 的产品保护；
5. Tools 页接入安全 summary、手动检测和最近结果；
6. 复用 builtin assistant/skill/agent catalog 路径注册 Ki-Buddy 资源，并增加 assistant 的 MCP 绑定字段；
7. 接入 brand assets、product locale、默认 token 和 UI capabilities；
8. 分别验证 Ki-Buddy capability 存在与缺失，保证上游 AionUi 默认路径没有行为变化。

这套结构保留 extension 作为通用贡献机制，也使 Ki-Buddy 的产品身份、不可变规则和敏感信息边界不依赖 renderer 或用户可控 manifest。
