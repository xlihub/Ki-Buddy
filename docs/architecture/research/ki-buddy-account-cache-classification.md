# Ki-Buddy 账号切换数据分类与 AionUi v2.1.54 对照

## 结论

Ki-Buddy 的账号切换不能按“浏览器缓存”或“所有客户端缓存”统一处理。当前数据应按下面四类管理：

| 分类            | 定义                                                       | 切换 Agents 账号时的处理                                                   |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Agents 账号相关 | credential、Core session，以及由当前身份授权访问的业务记录 | credential/session 随账号替换；业务数据由 Core `CurrentUser.id` 隔离并恢复 |
| 客户端账号无关  | 属于当前安装、OS 用户或客户端功能，不以 Agents 身份为边界  | 保留，不清理                                                               |
| 客户端工作状态  | renderer Web Storage 中的 route、Preview、草稿和最近资源   | 属于当前安装，不随 Agents 账号切换清理；不能作为业务授权依据               |
| 临时运行状态    | 单次 renderer 生命周期中的请求、订阅和模块级内存           | 停止旧请求；Core user id 变化后 reload，不做跨账号内存恢复                 |

最重要的边界如下：

1. 应用内浏览器是客户端功能。它的 Cookie、站点存储、HTTP cache、HTTP auth cache 使用固定的 Electron 持久化 partition `persist:aionui-browser`，与 Agents 账号无关，账号切换不能调用 `clearBrowserData`。
2. `preview-ui:<scope>` 中的 browser、file、diff 与编辑 tab 都是客户端工作状态。Agents 账号切换不删除或重写这条记录；其中引用的 Core 资源仍须按当前 user 重新鉴权。
3. 用户选择的本地目录、最近目录、workspace 活动、展开状态和文件预览都由当前 OS 用户的客户端持有，不归某个 Agents 账号独占。Core project 记录和业务访问权仍按 `CurrentUser.id` 隔离。
4. conversation、Team、task、mailbox、cron、自动 workspace 等持久业务数据已经由固定 Ki-Core 的 `CurrentUser.id` 隔离；renderer 的 SWR、订阅和模块级内存由账号变化后的 reload 销毁，Web Storage 保持不变。
5. Issue 17 最终复用生产客户端的边界：Core user scope 负责持久业务数据，renderer reload 负责内存隔离，renderer Web Storage 视为当前安装的客户端状态，不建立 Agents 账号 namespace，也不在 logout/switch 时清理。
6. AionUi v2.1.54 生产客户端包含一套不在公开 tag 同名 `AuthContext` 中的 AionUi Cloud OAuth 登录体系。它用云端稳定 user id 投影 Core user，logout 后登录另一个 OAuth 用户时以 Core user id 变化触发 renderer 整页 reload；desktop logout 不扫描或删除 renderer `localStorage`，也不清 `persist:aionui-browser`。公开 tag 中的 desktop auth stub 不能代表生产包行为。

## 核查范围与证据基线

- 研究开始时固定的 AionUi 基线（当前功能分支的 merge-base）：`ab4f57fce`。本文把该基线之后的认证改动单独标为“当前工作树实现”，不把它当作既有发布行为。
- 固定 Ki-Core：`ki-buddy-product.json` 中的 `209e6844d39bac0762c61e198c1ba3a007f9dd2e`；Core 结论引用该固定提交，不使用其他分支的后续行为。
- AionUi v2.1.54 tag：`982a6013c76171afa2865e933334299cf39f11e7`。该 tag 仅用于公开源码基线；生产包额外包含 AionPro/AionUi Cloud OAuth 模块，不能用 tag 中的 desktop auth stub 替代生产包分析。
- 本机生产客户端：`/Applications/AionUi.app`，版本 2.1.54；只读解包目录为 `/private/tmp/aionui-v2.1.54.GdSdoN/app`。`package.json` 声明 `version: 2.1.54` 与 `aioncoreVersion: v0.1.65`，应用内置 manifest 同样声明 Core v0.1.65。证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/package.json:1-4,147`、`/Applications/AionUi.app/Contents/Resources/bundled-aioncore/darwin-arm64/manifest.json:1-12`。
- 生产 OAuth 与账号切换行为直接引用解包后的 `out/main/index.js` 和 renderer chunks；Core 数据归属、首次认领与 session generation 使用与生产包 manifest 对应的 AionCore `v0.1.65` 源码交叉核对。
- 生产 OAuth 部分来自源码、tag 和已解包发布物的静态核查；文末另列当前工作树实现的自动化验证结果。

## 1. Agents 身份、credential 与 Core session

### 1.1 主进程中的账号相关状态

当前 Ki-Buddy 将规范化 Agents `baseUrl` 和稳定 Agents user id 做 SHA-256，形成 `agents-v1-...` external identity；这使不同部署中的相同 user id 不会映射到同一个 Core user。证据：`/Users/xli/AionUi/packages/desktop/src/process/ki-buddy/AgentsAuthService.ts:89-94,109-130`。

| 数据                                                                                         | 物理位置/生命周期                                      | 分类                  | 账号切换行为                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------- | ----------------------------------------------------------- |
| Agents access token                                                                          | OS keychain，service/account 由 `CredentialStore` 管理 | Agents 账号相关、敏感 | 当前只保留一个 active credential；换账号前删除旧 credential |
| session metadata（部署 URL、user、keychain account）                                         | `userData/ki-buddy/agents-session.json`                | Agents 账号相关       | 与 token 同步保存/删除；不能放 renderer storage             |
| active credential、identity、session、validation timer、request abort controller、generation | `AgentsAuthService` 模块实例内存                       | Agents 账号相关/临时  | 切换时停止验证、abort 旧请求、清空 active state             |
| Core session/CSRF Cookie                                                                     | Electron `session.defaultSession`                      | Agents 账号相关       | 换账号时撤销旧 Core projection 并替换 Cookie                |

`CredentialStore` 的 metadata 路径和 tombstone 处理见 `/Users/xli/AionUi/packages/desktop/src/process/ki-buddy/CredentialStore.ts:7-17,70-75,123-128`；保存新账号时会枚举并删除此前的 `agents-session-v2:*` credential，清理时删除全部 Ki-Buddy session credential，见同文件 `:158-207,213-265`。

`AgentsAuthService` 持有 active credential/session、AbortController、generation 和验证循环，见 `/Users/xli/AionUi/packages/desktop/src/process/ki-buddy/AgentsAuthService.ts:169-178`。激活 session 时会替换请求 generation 和 abort controller，见同文件 `:379-389`；deactivate 会 abort 请求、停止验证、清 credential、撤销 Core projection 并清 Cookie，见同文件 `:451-480`。因此这些内存对象属于账号相关的运行中状态，不能在 B 账号下继续使用 A 的对象。

Core auth Cookie 通过 `session.defaultSession` 写入，见 `/Users/xli/AionUi/packages/desktop/src/process/ki-buddy/authBridge.ts:15-17,41-92`。这与应用内浏览器的 named partition 是两个不同 Electron session，不能因为都叫 Cookie 就一起清理。

### 1.2 账号切换不是删除历史

Core external-session revoke 的作用是提升 session generation、断开 WebSocket，并停止该用户的 Team、channel、conversation runtime、file/office watch；它没有删除该用户的持久历史。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/src/router/routes.rs:192-248`。

Issue 17 选择把账号恢复边界放在 Core：对话历史、Team、项目等持久业务数据由相同 Core user id 恢复；renderer 的 route、搜索、队列、展开状态、file/diff tab 等属于客户端状态，保持原值但不得绕过 Core 当前用户鉴权。退出不能删除 Core 中的账号历史，也不能删除用户显式选择的本地目录。

### 1.3 磁盘与 Chromium profile 数据

除 renderer Web Storage 外，客户端还在 `userData`、Core data dir、OS keychain 和 Chromium partition 中持久化数据。账号切换不能只检查 `localStorage`。

| 位置/容器                                                                        | 主要内容                                                                   | 分类与处理                                                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| OS keychain + `userData/ki-buddy/agents-session.json`                            | 当前 Agents token 与非敏感 identity metadata                               | 当前账号 credential；切换时替换，不能保存多个 active token                                     |
| `userData/aionui/ki-buddy-core-v1`                                               | Ki-Buddy 专属 Core DB、自动 workspace 与 Core 管理文件                     | 混合的多用户容器；业务行和自动 workspace 由 `CurrentUser.id`/user dir 隔离，切换时保留整个目录 |
| Electron `defaultSession`                                                        | renderer origin 的 Web Storage、Core auth/CSRF Cookie、普通 Electron cache | 混合容器；只替换 Core auth Cookie，renderer Web Storage 作为客户端状态保留                     |
| `persist:aionui-browser`                                                         | 应用内浏览器的第三方站点 Cookie、storage、cache、HTTP auth cache           | 客户端账号无关；只由用户主动“清除浏览数据”处理                                                 |
| `persist:ext-settings-<tabId>`                                                   | extension settings webview 的站点 session                                  | 客户端/extension 状态；没有证据表明它属于 Agents 账号，普通换号不清                            |
| `userData/config/aionui-config.txt`、`.aionui-env`                               | window bounds、目录配置及 legacy config                                    | 混合/兼容容器；window/目录配置是客户端级，legacy 业务字段不能自动认领给新 Agents 用户          |
| legacy `aionui-chat*.txt`、`aionui-chat-history/`、`assistants/`、`skills/`      | 旧 Electron-managed 历史与迁移源                                           | legacy/quarantine；当前账号切换不读取、不删除，迁移需单独定义 owner                            |
| `analytics.json`、`gpu.config.json`、`cdp.config.json`、update diagnostics、logs | 安装标识、硬件恢复、调试/更新状态、日志                                    | 客户端级或运维数据；不随 Agents 账号切换                                                       |
| 用户显式选择的 workspace 路径                                                    | userData 之外的真实 OS 文件/目录                                           | OS 用户资源；不删除、不移动、不因换号撤销权限                                                  |

Ki-Buddy Core data namespace 见 `/Users/xli/AionUi/packages/desktop/src/process/ki-buddy/coreDataPath.ts:3-12` 及 `/Users/xli/AionUi/packages/desktop/src/index.ts:188-192,259-265`。legacy 文件布局见 `/Users/xli/AionUi/packages/desktop/src/process/utils/initStorage.ts:38-46,237-306,427-454`；window bounds 写入 `ProcessConfig` 见 `/Users/xli/AionUi/packages/desktop/src/index.ts:547,871`。安装级 JSON/config 文件见 `/Users/xli/AionUi/packages/desktop/src/process/utils/analyticsId.ts:11-32`、`/Users/xli/AionUi/packages/desktop/src/process/utils/gpuRecovery.ts:9-40`、`/Users/xli/AionUi/packages/desktop/src/process/utils/configureChromium.ts:93-186`。

## 2. renderer 持久化数据清单

### 2.1 `localStorage`

#### 客户端持有的工作状态

| key / prefix                                                                                                                                   | 内容                                                      | 依据                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `aionui:recent-workspaces`                                                                                                                     | 最近打开的 workspace 路径与活动信息                       | `/Users/xli/AionUi/packages/desktop/src/renderer/components/workspace/recentWorkspaces.ts:7-23`                                         |
| `aionui_workspace_expansion`                                                                                                                   | workspace 路径展开状态                                    | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState.ts:3-26`            |
| `aionui_workspace_update_time`                                                                                                                 | workspace 路径到最近活动时间的映射                        | `/Users/xli/AionUi/packages/desktop/src/renderer/utils/workspace/workspaceHistory.ts:7-37`                                              |
| `conversation.historySearch.recentKeywords`                                                                                                    | 对话搜索关键词历史                                        | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover.tsx:27,154,232`            |
| `aionui_cron_unread`                                                                                                                           | 未读 cron conversation ids                                | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/cron/useCronJobs.ts:275-302`                                                     |
| `team-pinned-ids`                                                                                                                              | 固定的 Team ids                                           | `/Users/xli/AionUi/packages/desktop/src/renderer/components/layout/Sider/TeamSiderSection.tsx:25,55-68`                                 |
| `team-view-mode-`、`team-member-colors-`、`team-active-slot-`、`team-assistant-order-`、`team-pending-permissions-`、`team-activity-controls-` | 按 Team id 保存的视图、成员、权限与活动控制               | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/team/utils/teamStorage.ts:7-15,25-36`                                            |
| `project-panel-collapse:`                                                                                                                      | 按 project id 保存的面板折叠状态                          | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/ui/useProjectPanelCollapse.ts:32,40,91`                                          |
| `workspace-preference-`                                                                                                                        | workspace 折叠偏好                                        | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/hooks/useWorkspaceCollapse.ts:46,90,124`                            |
| `explorer-ui:<projectId>`                                                                                                                      | Explorer expanded/selected/current path                   | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/explorer/explorerStore.ts:55-75,85-105`                             |
| `preview-ui:<scope>` 中非 browser tabs                                                                                                         | 文件路径、文件/office 预览、text edit、diff 及 active tab | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx:188-217,222-286,408-417,477-495` |

这些 key 可能包含之前使用 Agents 账号时产生的资源 id、路径、搜索内容或工作上下文，但产品 owner 是当前客户端安装。切换账号时保留；读取其中的 conversation、Team、project 或 file ref 时，仍必须经过当前 Core user scope 鉴权，不能把本地 key 当作访问许可。

#### 客户端账号无关

| key                                                                                                         | 内容                                               | 依据                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18nextLng`                                                                                                | UI 语言提示                                        | `/Users/xli/AionUi/packages/desktop/src/renderer/services/i18n/languageHint.ts:1-16`                                                                                                                                                                                                                                                                                                                                                               |
| `__aionui_theme`                                                                                            | 启动阶段快速应用主题                               | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/system/useTheme.ts:18-33,69-79`                                                                                                                                                                                                                                                                                                                                                             |
| `ki-buddy.login.successfulDeployments_v1`                                                                   | 曾成功连接的部署 URL；不含 token、用户名或 user id | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/ki-buddy/Login/deploymentHistory.ts:1-65`                                                                                                                                                                                                                                                                                                                                                   |
| `ki-buddy.onboarding.openingGuideSeen_v1`                                                                   | 本机产品引导已读                                   | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/ki-buddy/Onboarding/storage.ts:1-17`                                                                                                                                                                                                                                                                                                                                                        |
| `aionui_agent_browser_first_use_notified`                                                                   | 本机浏览器控制首次提示已读                         | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/browser/firstUseNotice.ts:24-60`                                                                                                                                                                                                                                                                                                                                       |
| `workspace-open-preference`                                                                                 | 使用哪种本机工具打开目录                           | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton.tsx:61-101`                                                                                                                                                                                                                                                                                                                          |
| `chat-preview-width-px`、`chat-workspace-width-px`、`preview-panel-split-ratio`、`chat-preview-split-ratio` | 客户端布局尺寸                                     | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/ui/useProjectPreviewRegionWidth.tsx:36-47`、`/Users/xli/AionUi/packages/desktop/src/renderer/hooks/ui/useProjectExplorerColumnWidth.tsx:32-43`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel.tsx:298-305`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/components/ChatLayout/index.tsx:106-139` |
| `grouped-history-collapsed-sections`、`team-section-expanded`                                               | 通用区域折叠偏好，不包含资源 id                    | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversations.ts:18-29,153-160`、`/Users/xli/AionUi/packages/desktop/src/renderer/components/layout/Sider/TeamSiderSection.tsx:49-53`                                                                                                                                                                                                                  |
| `aionui.emoji.recent`                                                                                       | 本机最近 emoji                                     | `/Users/xli/AionUi/packages/desktop/src/renderer/components/chat/EmojiPicker.tsx:462-481`                                                                                                                                                                                                                                                                                                                                                          |
| `update.includePrerelease`、`aionui.migration-invite-shown`、`aionui.gpuAutoDisableNoticeAckAt`             | 更新、迁移提示、GPU 能力提示                       | key 的读写点位于 renderer update/migration/GPU notice 组件，含义均为当前安装级偏好                                                                                                                                                                                                                                                                                                                                                                 |

这些 key 不应因 Agents logout 或切换而清理。`aionui.sttStreamUnsupported` 保存按 provider/base URL/model 组合得到的客户端能力判断，原则上也属于本机能力缓存；如果未来 provider 配置本身按账号隔离，则该 key 需改为账号维度或去除可识别 endpoint，而不是在每次账号切换时全删。证据：`/Users/xli/AionUi/packages/desktop/src/renderer/services/speech/speechStreamPolicy.ts:12,84-127`。

#### 需要明确授权边界的客户端状态

| key                             | 客户端含义                                         | 授权边界                                             |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `preview-ui:<scope>`            | browser tab 与 file/diff/tab 内容保存在同一个 JSON | 整体保留；资源内容重新访问时由当前 Core session 鉴权 |
| `aionui:web-fs-picker:last-dir` | 当前 OS 用户最近使用的本地目录                     | 保留；不能据此获得超出 OS/Core 授权的访问权          |

`aionui:web-fs-picker:last-dir` 的定义与更新见 `/Users/xli/AionUi/packages/desktop/src/renderer/components/workspace/webFsPicker.tsx:26,75,96`。

#### WebUI/旧路径，不属于 Ki-Buddy 客户端偏好

`rememberMe`、`rememberedUsername`、`rememberedPassword` 由 WebUI 登录页读写，其中 username/password 虽经前端变换仍是账号 credential 数据，见 `/Users/xli/AionUi/packages/desktop/src/renderer/pages/login/index.tsx:15-17,68-75,154-160`。Ki-Buddy 桌面登录不使用这组 key；它们不能因此被分类成客户端账号无关，也不应交给 Ki-Buddy 清理。若同一 renderer 形态需要支持 WebUI logout，应继续由 WebUI 认证 contract 显式处理。

`/Users/xli/AionUi/packages/desktop/src/common/config/storageKeys.ts:16-28` 还声明了一组旧 storage 常量；当前 renderer 没有找到业务读写点，本文不把“只有常量、无读写”的名称计为实际缓存。

### 2.2 `sessionStorage`

| key / prefix                                                                           | 内容                                                             | 分类           | 依据                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp_initial_message_<conversationId>`                                                 | 初始消息和文件引用                                               | 客户端工作状态 | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/chat/useInitialMessage.ts:12-31,48-69`                                                                                                                  |
| `aionrs_initial_message_<conversationId>`、`aionrs_initial_processed_<conversationId>` | 初始消息及是否已处理                                             | 客户端工作状态 | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx:350-372`                                                                                                |
| `conversation-command-queue/<conversationId>`                                          | 待发送命令、文本与文件引用                                       | 客户端工作状态 | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/platforms/useConversationCommandQueue.ts:82-100,236-291`                                                                                   |
| `guid.openAssistantEditorIntent`                                                       | 待打开的 assistant id                                            | 客户端工作状态 | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/settings/AgentSettings/AgentRepairPage.tsx:68-81`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/settings/AssistantSettings/index.tsx:185-216` |
| `aion:last-non-settings-path`                                                          | 最近非 Settings route，可能是 `/conversation/:id` 或 `/team/:id` | 客户端工作状态 | `/Users/xli/AionUi/packages/desktop/src/renderer/components/layout/Titlebar/index.tsx:187-206`、`/Users/xli/AionUi/packages/desktop/src/renderer/components/layout/Layout.tsx:153-165`                         |
| `AcpE2EStreamInjector` 使用的注入 key                                                  | E2E 流式事件注入                                                 | 临时/测试      | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpE2EStreamInjector.tsx:98`                                                                                                 |

`sessionStorage` 与 `localStorage` 一样由当前客户端页面持有，不作为 Agents 账号边界。A→B 时可以保留上述状态，但所有资源 id 和文件引用必须在当前 Core user 下重新校验。

### 2.3 当前工作树的处理

当前工作树不再包含 `accountStorage.ts`、`ki-buddy:active-account:*` 或 `ki-buddy:account-storage:*`。Ki-Buddy 的认证 adapter 只清 SWR、注册的 runtime state 和账号相关 config cache，并通过策略参数跳过通用 WebUI 的 renderer storage 清理。

因此 `preview-ui:*`、recent workspace、Explorer、Team UI、route、草稿和客户端偏好在 logout、A→B、B→A 时都保持原值。Core user id 变化仍触发整页 reload，以销毁旧账号的 renderer 内存和订阅。

## 3. renderer 内存、SWR 与运行中状态

### 3.1 SWR 是混合的全局 cache

renderer 根部只有一个没有账号 namespace 的 `SWRConfig`，所有业务 hook 共用同一默认 cache。账号清理通过 `useSWRConfig().cache` 遍历当前 cache 的全部 key，证据：`/Users/xli/AionUi/packages/desktop/src/renderer/main.tsx:265-290`、`/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:108-112,307-319`。

这个 Map 同时保存：

- Agents 账号相关资源：conversation、Team、assistant、project/explorer、draft、provider/config 等；
- 客户端账号无关状态：例如 `system.dir.info`、`cdp.status`、agent logo 等。

因此 SWR 属于“混合需拆分”。当前 `clearAccountState` 遍历并删除整个 SWR cache，见 `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/context/AuthContext.tsx:108-112,307-319`。这种方式能避免账号数据瞬时残留，但也会让客户端级查询重新请求。近期可以保留全清作为安全屏障；长期应给账号资源 key 加 account namespace，或把客户端 query 放到独立 cache。

### 3.2 模块级 Map/Set/store

下表只列与账号切换直接相关的代表项；这些对象没有持久化不代表可以跨账号复用。

| 状态                             | 内容                                                                                  | 分类                                   | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conversation sidebar singleton   | conversations、generating/unread/completed sets、active conversation、初始化/刷新状态 | Agents 账号相关                        | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts:123-143,163-213`                                                                                                                                                                                                                                                                                                                                                                                    |
| send box drafts/prefill          | conversation id、文本、文件引用                                                       | Agents 账号相关                        | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/chat/useSendBoxDraft.ts:6-38,47-54,69-86,118-166`                                                                                                                                                                                                                                                                                                                                                                                                                |
| upload store/aborters            | upload path、conversation id、进度、AbortController                                   | Agents 账号相关/临时                   | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/file/useUploadState.ts:31-69,71-125,129-145`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| command queue/background runners | conversation queue、运行中的后台发送                                                  | Agents 账号相关/临时                   | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/platforms/useConversationCommandQueue.ts:82-100,401,517-575`                                                                                                                                                                                                                                                                                                                                                                                        |
| ACP/Aion runtime caches          | slash command、config status/inflight、ensure runtime、turn clocks、runtime view maps | Agents 账号相关/临时                   | `/Users/xli/AionUi/packages/desktop/src/renderer/hooks/chat/useSlashCommands.ts:8-37`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/platforms/acp/useAcpMessage.ts:82-101`、`/Users/xli/AionUi/packages/desktop/src/renderer/hooks/agent/useAcpConfigOptions.ts:102-159`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/utils/ensureConversationRuntime.ts:1-20`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/utils/conversationTurnClock.ts:7-36` |
| Explorer store cache             | project id、expanded/selected/current path、loaded state                              | Agents 账号相关                        | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/explorer/explorerStore.ts:55-105`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| preview watch/reloader registry  | 当前 preview 的 watcher/reloader                                                      | Agents 账号相关或混合，取决于 tab 类型 | `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/previewWatchStore.ts:35,64,105`、`/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/tabReloaderRegistry.ts:23`                                                                                                                                                                                                                                                                                     |
| i18n translation cache           | 已加载语言资源                                                                        | 客户端账号无关                         | `/Users/xli/AionUi/packages/desktop/src/renderer/services/i18n/index.ts:60`                                                                                                                                                                                                                                                                                                                                                                                                                                             |

当前只有 conversation list singleton 注册了账号 resetter：注册中心见 `/Users/xli/AionUi/packages/desktop/src/renderer/services/runtime/accountStateLifecycle.ts:1-20`，conversation reset 会清 conversations、生成中/未读/已完成集合、turn ids 与 active id，见 `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync.ts:199-213`。没有找到其他 `registerAccountStateResetter` 调用。

Ki-Buddy provider 维护前一个已经提交的非空 Core user id；当账号从 A 变为 B 时执行整页 reload，见 `/Users/xli/AionUi/packages/desktop/src/renderer/pages/ki-buddy/Auth/KiBuddyAuthProvider.tsx:11-37,46-73`。这会销毁未注册的模块级状态，是当前实现的重要安全屏障。退出为 `null` 本身不会触发 reload，但之后 B 登录仍会与记住的 A 比较并 reload。

provider 在 render 中只比较当前 user id 与上一次已提交的 user id；发现 B 后立即返回 `null`，不挂载 B 的业务 children，再由 `useLayoutEffect` 请求 reload。该门禁阻止新账号业务树在旧 renderer 中提交，同时登录事务仍先执行 abort/reset，不能用 reload 代替旧账号受管进程和运行状态清理。若未来移除 reload，必须先给上表各账号 store 增加显式 abort/reset/unsubscribe，并证明旧事件不会写入新账号页面。

## 4. 应用内浏览器与 `preview-ui`

### 4.1 浏览器站点数据属于客户端

所有 webview 明确使用一个固定且持久的 named partition：`persist:aionui-browser`。代码注释说明它跨 tab、跨 project 共享并在重启后保留，见 `/Users/xli/AionUi/packages/desktop/src/common/config/constants.ts:13-31`；`BrowserViewer` 把该值传给 webview 的 `partition` 属性，见 `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/browser/BrowserViewer.tsx:29-40,68-79`。

因此它不是 Electron `defaultSession`。边界如下：

| Electron session                                  | 数据                                                                           | 分类            |
| ------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- |
| `session.defaultSession`                          | Ki-Buddy/Core auth Cookie 与 CSRF Cookie                                       | Agents 账号相关 |
| `session.fromPartition('persist:aionui-browser')` | 第三方网站 Cookie、站点 localStorage/IndexedDB 等、HTTP cache、HTTP auth cache | 客户端账号无关  |

唯一的显式浏览数据清理入口从该 named partition 调用 `clearStorageData()`、`clearCache()`、`clearAuthCache()`，见 `/Users/xli/AionUi/packages/desktop/src/process/bridge/applicationBridge.ts:196-223`。这是 Settings 中用户主动执行的“退出全部网站”，不属于 Agents logout/switch。

产品 PRD 也明确：站点登录态全局共享、不随 project 切换、重启后保留、只由“清除浏览数据”入口删除，见 `/Users/xli/AionUi/docs/prds/agent-browser/prd.md:57-78,94-104`。账号切换时清除该 partition 会破坏客户端功能 contract。

### 4.2 browser tab 与站点 session 是两层数据

browser tab 的 URL、title、favicon 与前进/后退状态属于客户端浏览器 UI；站点 Cookie 等属于 Electron partition。两者都与 Agents identity 无关，但物理位置不同：

- 站点数据在 `persist:aionui-browser`；
- browser tab metadata 与 file/diff tabs 一起在 project-scoped `preview-ui:<scope>` JSON。

`PreviewContext` 会持久化 tabs、active tab 与 preview 内容，见 `/Users/xli/AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx:188-217,222-286,408-417,477-495`。PRD 同时要求 browser tab 和文件 tab 并列共存、browser tab 跟随 project，见 `/Users/xli/AionUi/docs/prds/agent-browser/prd.md:57-70`。这里的“跟随 project”是 UI 展示作用域，不等于 Agents 账号所有权。

`preview-ui:*` 整体属于客户端工作状态。browser 与 file/office/diff/text edit tab 都不随 Agents 账号切换清理或改写。tab 中的 project、conversation、file ref 只负责恢复 UI 上下文；真正读取或写入资源时，Core 仍按当前 `CurrentUser.id` 鉴权。

## 5. Core 持久数据、workspace 与文件边界

### 5.1 已按 Core user 隔离的数据

固定 Ki-Core 对 external user 的唯一约束是 `(user_type, external_user_id)`，见 `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/migrations/030_user_scope.sql:165-173`。当前 Ki-Buddy external identity 已把规范化 deployment URL 与 Agents user id 组合后哈希，避免不同 Agents 部署的相同 id 合并。

| Core 数据                               | 分类            | 源码证据                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conversation、message、artifact         | Agents 账号相关 | routes 全部传入 `CurrentUser.id`：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-conversation/src/routes.rs:137-295`；跨用户 message 测试：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/tests/message_e2e.rs:290-318` |
| Team、task、mailbox、session            | Agents 账号相关 | `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-team/src/routes.rs:127-220`                                                                                                                                                           |
| cron、provider、remote agent、MCP/OAuth | Agents 账号相关 | user-scope migration：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/migrations/030_user_scope.sql:209-277`                                                                                                                       |
| project、project explorer metadata      | Agents 账号相关 | migration 与 routes：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/migrations/030_user_scope.sql:881-948`、`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-project/src/routes.rs:52-107`                                 |
| 自动 conversation workspace             | Agents 账号相关 | 两个用户获得不同的 `conversations/users/{userDir}`：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-app/tests/conversation_e2e.rs:1225-1284`                                                                                          |

这些数据在账号切换时不需要搬迁或删除，访问隔离由新的 Core session/`CurrentUser.id` 完成。renderer 只需丢弃旧账号的响应与 cache。

### 5.2 显式 project workspace：权限与活动历史必须分开

用户通过本机文件选择器显式选择的目录，是当前 OS 用户已经能够访问的真实路径。固定 Ki-Core 的 `Local` file ref 允许访问主机选择器提供的 canonical path；项目 metadata 和 ref resolve 仍按调用者 user id 检查。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-project/src/chat_files.rs:62-128`。

应按下表描述，而不是笼统称为“workspace 按账号隔离”：

| 对象                                                | 分类                                   | 切换行为                                                         |
| --------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| 本地目录及 OS 文件权限                              | 客户端/OS 用户资源，与 Agents 账号无关 | 不删除目录，不撤销权限，不阻止另一个 Agents 账号再次选择同一路径 |
| Core project 记录、project explorer metadata        | Agents 账号相关                        | 由 `CurrentUser.id` 隔离                                         |
| recent workspace、last-dir、活动时间、展开/选中状态 | 客户端工作状态                         | 保留，不随 Agents 账号切换清理                                   |
| 对话中的本地文件引用、file/diff preview             | 客户端工作状态                         | 保留；实际读写时按当前 Core user 与 OS 权限重新鉴权              |

### 5.3 managed upload 仍有物理目录缺口

固定 Ki-Core 的 upload handler 没有提取 `CurrentUser`，服务把文件写到系统临时目录 `aionui/{conversationId|general}`，目录结构不含 user id。证据：`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/routes.rs:523-537`、`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-file/src/service.rs:719-783`。

对话记录按用户隐藏 upload 引用，不等于上传物理文件已经按用户隔离。这个缺口不应通过 renderer 账号切换时删除整个 temp root 解决；应由 Core 的 upload path、metadata 和读取 endpoint 补充 user scope，并单独测试已知路径/ID 的跨用户访问。

## 6. Core client preferences 是混合容器

renderer `configService` 从 `/api/settings/client` 读取统一设置对象，内存中只把 `language` 明确放入 client-scoped cache；账号 reset 会清空其余 cache 后保留 language。证据：`/Users/xli/AionUi/packages/desktop/src/common/config/configKeys.ts:4-47`、`/Users/xli/AionUi/packages/desktop/src/common/config/configService.ts:6-14,16-58,68-118`。

固定 Ki-Core 的 client preference repository 以 `CurrentUser.id` 读写，见 `209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-system/src/routes.rs:155-184`、`209e6844d39bac0762c61e198c1ba3a007f9dd2e:crates/aionui-db/src/repository/sqlite_client_preference.rs:20-90`。

这里存在产品语义与物理存储不一致：

- `guid.lastAssistantId`、`assistants.enabledOrder`、provider/skill/agent 相关选择属于 Agents 账号相关；
- language、theme/color scheme、zoom/font size、window bounds、system tray、notifications、keep-awake、custom CSS/theme、pet 等更接近客户端账号无关偏好；
- 当前它们在 Core 中都按 user 保存，renderer cache 又只对 language 做特殊处理。

因此 `/api/settings/client` 整体应标为“混合需拆分”。Issue 17 不应通过切换时清掉全部偏好来掩盖这个差异；需要按 config key 确定最终 owner，再选择 client store 或 Core user store。

## 7. Team、task、conversation 与 idempotency

### 7.1 已存在的业务数据

conversation、Team、task、mailbox 已由 Core user scope 隔离，但 renderer 仍会保存相关 id、列表和运行中状态。账号切换顺序应保持：

1. 主进程停止/abort 旧 Agents 请求并 revoke 旧 Core session；
2. renderer 清空 A 的 SWR、运行中 store 与订阅；Web Storage 保持不变；
3. 建立 B 的 Core session；
4. 重新请求 B 的 Core 数据；
5. 整页 reload 或等价的完整 reset 屏障保证旧订阅不能继续写入。

当前 `kiBuddyAuthAdapter` 在 refresh/login/logout 需要清理时调用 `clearAccountState({ preserveRendererStorage: true })`，只重置 SWR、运行时 store 与 config cache，保留全部 renderer Web Storage。WebUI 默认路径仍执行原有 auth/preview storage 清理。

### 7.2 Agents execution lifecycle 不属于客户端 cache

ADR 0006 的产品 SQLite ledger 方案已被 ADR 0012 取代。Ki-Buddy 不生成远端 taskId，不维护 invocation ledger 或 active invocation lifecycle，也不在 logout、账号切换、App 重启或异常恢复时推断 Agents 执行状态。status、cancel、resume、retry 与服务端幂等必须由 Agents 通过正式 MCP contract 提供。证据：`/Users/xli/AionUi/docs/adr/agents-execution/0006-guard-remote-invocations-with-local-ledger.md`、`/Users/xli/AionUi/docs/adr/agents-execution/0012-integrate-agents-execution-lifecycle-through-mcp.md`。

ADR 0007 的 `uploadRef` 与 ADR 0008 的 `deliveryRef` 仍属于计划中的客户端临时引用。它们只承担本地文件授权或交付职责，不表示远端 task identity、执行状态、恢复或取消。证据：`/Users/xli/AionUi/docs/adr/agents-execution/0007-upload-authorized-local-files-inside-adapter.md`、`/Users/xli/AionUi/docs/adr/agents-execution/0008-deliver-remote-result-files-inside-adapter.md`、ADR 0012。

当前 `packages/desktop/src/process/ki-buddy/` 中没有 `uploadRef` 或 `deliveryRef` 的业务实现。因此它们应标为“计划中”：

- `uploadRef` 和 `deliveryRef` 属于账号绑定的临时客户端状态，切换时必须失效；
- 这些引用不能被用于恢复、重试或取消远端执行，相关能力只能来自 MCP contract；
- 现有 Core `ChatFileRef::Upload` 与计划中的 Agents Adapter `uploadRef` 不是同一个对象，不能混为一类。

## 8. AionUi v2.1.54 生产 OAuth 账号切换对照

### 8.1 生产包与公开 tag 不是同一套 desktop auth

公开 tag `982a6013c...` 的 renderer `AuthContext` 在 Electron 下跳过真实 login/logout，但本机 2.1.54 生产包包含额外的 AionPro 模块：desktop SSO login page、Account settings page、主进程 `AuthManager`、Core user bridge 与 `aionpro` identity mode。生产 renderer 可见 `/settings/account`、`desktop-sso-login-page`、`auth.get-session/login/logout` 等路径；主进程可见 `/account/login_by_token`、`/account/account/refresh_access_token`、`/account/account/user_info` 与 `/account/account/logout`。

因此本节只把公开 tag 用作 UI/storage 基线，OAuth 账号行为以解包发布物为准。证据：

- `/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:7459-7597,8318-8916`
- `/private/tmp/aionui-v2.1.54.GdSdoN/app/out/renderer/assets/index-C3aSQzPy.js:5`
- `/private/tmp/aionui-v2.1.54.GdSdoN/app/out/renderer/assets/index-DqCShKb_.js:13`

### 8.2 OAuth credential 只保存当前活动账号

生产客户端通过系统浏览器打开 AionUi Cloud authorize URL，使用 loopback callback、PKCE `code_verifier`/`code_challenge` 和随机 `state`，再调用 `/account/login_by_token` 换取 access/refresh token。它没有使用应用内浏览器 partition 完成登录。

credential 的持久化结构如下：

| 数据             | 位置                                                                                | 账号语义                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| access token     | 主进程 `AuthManager` 内存                                                           | 当前活动 OAuth session；过期前刷新，不持久化                                                         |
| refresh token    | OS keychain，service `AionUi Desktop`，account `refresh_token:<env>:aionui_desktop` | 当前环境只有一个活动 credential slot；新登录覆盖，logout 删除                                        |
| session metadata | `userData/auth.enc`                                                                 | 实际是明文 JSON metadata，包含 schema/env/clientId/expiry/user，不含 refresh token；当前活动账号单槽 |
| device identity  | `userData/device-id.json`                                                           | 安装级 `deviceId`/`fpDid`，OAuth 换号保留                                                            |

`auth.enc` 这个文件名不能被理解为整个文件已加密；生产实现只把 refresh token 放入 keychain。证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:7476-7597,7990-8035,8400-8458,8646-8916`。

### 8.3 云端账号如何映射到本地 Core user

生产客户端固定以 `--identity-mode aionpro` 启动 Core。OAuth 返回的稳定 `user.id` 直接作为 `external_user_id`：

1. `PUT /api/auth/internal/external-users/{external_user_id}` 幂等创建/读取 Core user；
2. `POST /api/auth/internal/external-sessions` 获取 Core session；
3. Core JWT 只留在主进程内存，renderer 只得到写入 Electron `defaultSession` 的 HttpOnly `aionui-session` Cookie；
4. Core 返回的内部 `core_user_id` 用作 renderer 判断是否发生了账号变化。

Core 的 conversation、Team、task、project、provider、preference 等记录继续按内部 `CurrentUser.id` 读取。A→B 不删除 A 的本地业务数据；再次登录 A 时会重新映射到同一个 Core user。证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:39655-39676,45046-45363`，以及 AionCore `v0.1.65:crates/aionui-auth/src/service.rs:54-153`。

首次从旧 AionUi 升级时存在一次性认领：数据库只有一个 external user 时，首个 AionUi Cloud 用户接管 `system_default_user` 的既有 user-scoped rows，并迁移对应 per-user 文件；第二个 external user 出现后认领窗口永久关闭。换号本身不会再次迁移或复制这些数据。证据：AionCore `v0.1.65:crates/aionui-auth/src/service.rs:54-104`、`v0.1.65:crates/aionui-db/src/repository/user.rs:53-74`。

### 8.4 A→logout→B 的实际顺序

生产客户端没有“直接替换账号”按钮，切换是 logout 后重新 OAuth 登录：

1. Account settings 调用 renderer `logout()`；desktop 分支只调用主进程 `auth.logout`，不会执行 renderer 的 `clearAuthCache()`。
2. 主进程最多等待 5 秒调用云端 `/account/account/logout`；无论成功、失败或超时，都取消登录流程、清内存 token、删除 `auth.enc` 与 keychain refresh token，并发布 unauthenticated 事件。
3. Core user bridge 收到退出事件后，提升 A 的 Core session generation、清主进程 Core token、删除 `defaultSession` 中的 Core auth/CSRF Cookie，并清 paired WebUI sessions。A 的持久业务数据不删除。
4. renderer 路由进入 `/login`。SWR、React store 等旧账号内存此时没有逐项 reset，但业务页面被 auth gate 隐藏。
5. B 登录后被投影为另一个 Core user。常驻的 account-switch hook 比较上一次非空 `coreUserId` 与 B 的 id；不同则执行 `window.location.reload()`，销毁 renderer 内存、SWR cache、订阅和模块级 store。

证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:8709-8916,45046-45363`、`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/renderer/assets/index-CbVqlqKU.js:67,8598`、`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/renderer/assets/index-DqCShKb_.js:13`。

这个设计依靠两层隔离：Core user scope 负责持久业务数据，renderer reload 负责内存。它没有给 renderer Web Storage 建立 OAuth user namespace。

### 8.5 renderer 持久缓存属于客户端安装

desktop logout 不调用 `clearAuthCache()`，所以它不删除 `preview-ui:*`，也不扫描 auth/csrf/token 名称。生产包中的 `aionui:recent-workspaces`、workspace expansion/activity、search keywords、Team pin、Explorer state、`preview-ui:*` 等使用固定 key；这些 key 的 owner 是当前客户端安装，而不是 OAuth 用户。

实际效果是：

- Core conversation/Team/project 列表由 B 的 Core session 重新请求，服务端不会返回 A 的记录；
- A 的模块级内存由 reload 清掉；
- renderer 持久 UI 记录继续由同一客户端使用；其中的资源引用不会替代 B 的 Core 鉴权；
- A→退出→关闭应用→B 时，首次非空 `coreUserId` 不触发 reload，但进程重启本身已清内存；Web Storage 仍然是共享的；
- 换回 A 不会恢复“A 专属 renderer 快照”，因为生产包没有这类快照，只会继续使用同一组设备级 key。

因此生产 2.1.54 的边界可以用于 Issue 17：Core user scope 隔离并恢复持久业务数据，reload 隔离 renderer 内存，Web Storage 作为客户端状态持续存在。

### 8.6 browser 在生产 OAuth 切换中保持不变

OAuth 登录使用 `shell.openExternal()` 打开系统浏览器；应用内 browser 使用独立固定 partition `persist:aionui-browser`。OAuth logout、Core session revoke、renderer reload 都不会调用 `clearBrowserData`。只有用户在 Settings 主动执行“清除浏览数据”时才会清该 partition 的 Cookie、storage、HTTP cache 与 HTTP auth cache。

desktop logout 也不删除 `preview-ui:*`，因此生产包中的 browser tab metadata 与 browser partition 都会跨 OAuth 账号保留。该行为支持本次产品判定：Ki-Buddy 切换 Agents 账号也必须保留 browser。

证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:8400-8440`、生产 renderer auth desktop logout 分支 `/private/tmp/aionui-v2.1.54.GdSdoN/app/out/renderer/assets/index-CbVqlqKU.js:67`，以及公开基线 `982a6013c...:packages/desktop/src/common/config/constants.ts:13-31`、`packages/desktop/src/process/bridge/applicationBridge.ts:196-223`。

### 8.7 生产实现中仍值得注意的时序问题

Core user bridge 的 auth listener 在退出时以 `void handleSignedOut(...)` 启动异步撤销，renderer 的 `auth.logout` IPC 不等待这项 Core 清理完成。若用户非常快地完成下一账号登录，旧账号 revoke/clear-cookie 与新账号 provision/install-cookie 存在并发窗口。Issue 17 不应复制这种时序；Ki-Buddy 需要让旧账号 runtime 停止、旧 Core session 撤销完成后，才允许新账号业务视图读取数据。

证据：`/private/tmp/aionui-v2.1.54.GdSdoN/app/out/main/index.js:45320-45363`。

## 9. Issue 17 的实现判定

最终选择：只由 Core user scope 持久化和恢复账号业务数据。renderer Web Storage 属于客户端安装，不建立账号快照，也不在 logout/switch 时清理；因此 conversation、Team、project 等业务授权随 Core user 变化，route、搜索记录、展开状态、待发送队列和 Preview 则保持客户端原值。

### 必须属于账号切换事务

- Agents credential、Core session/defaultSession auth Cookie、旧请求 AbortController 与验证循环；
- conversation/Team/task/cron/assistant/project 的运行中请求、响应和订阅；
- SWR 账号数据及所有模块级账号内存 store；
- 旧 Agents 请求的 abort，以及未来 `uploadRef`、`deliveryRef` 等客户端临时引用失效；Ki-Buddy 不维护 idempotency ledger 或 active invocation lifecycle。

### 必须保持不变

- `persist:aionui-browser` 中的 Cookie、站点 storage、cache 与 HTTP auth cache；
- browser tabs、URL/title/favicon 等浏览器 UI 状态；
- renderer `localStorage` 与 `sessionStorage` 中的 route、搜索、Explorer、Team UI、草稿和 Preview；
- 语言、主题、布局、窗口、更新、onboarding、浏览器首次提示等客户端偏好；
- 用户显式选择的本地目录及 OS 权限。

### 必须保持授权边界

- 全局 SWR Map：账号资源与客户端 query；
- `/api/settings/client`：assistant/provider 等账号设置与 language/theme/window 等客户端设置；
- Web Storage 中保存的 Core resource id/file ref：保留 UI 状态，但访问时重新按当前 Core user 鉴权。

### 当前工作树状态

1. Ki-Buddy 不再维护 renderer storage key 清单、active-account marker 或账号快照。
2. packaged Electron E2E 已使用真实 browser tab 验证 A→B→A 后原 tab 可通过客户端 UI 恢复；切换前写入 `persist:aionui-browser` 的 Cookie 与 site localStorage 仍可读取，recent workspace、搜索、Explorer 和布局 key 同样保持。
3. `clearAuthCache` 的 broad name scan 保持旧 WebUI 默认 contract；Ki-Buddy 通过 `preserveRendererStorage` 跳过 renderer storage 清理。
4. 保留 A→B 整页 reload，直到所有模块级账号状态都有 abort/reset/unsubscribe 证明。
5. 两账号 packaged Electron E2E 只在最终验证时重新生成一次 unpacked app；测试确认客户端 storage 保留、Core conversation 隔离且 A→B→A 可恢复，并确认 named partition 的 `clearStorageData`、`clearCache`、`clearAuthCache` 均未被调用。
6. Core managed upload 的 user scope 是独立后端缺口，不能用 renderer 清 cache 代替。

## 验证说明

本次使用当前工作树、固定 Ki-Core commit、AionUi v2.1.54 tag 和本机已解包 v2.1.54 生产发布物交叉核查。当前实现已通过 TypeScript、lint、i18n、Ki-Buddy 聚焦单元测试和 packaged Electron 账号切换 E2E。全量 Vitest 中 452 个文件直接通过；唯一需要监听本地端口的 `static-server.unit.test.ts` 因沙箱 `listen EPERM` 单独失败，移到允许监听的环境后 12 项全部通过。packaged E2E 使用最终源码重新生成了一次 macOS arm64 unpacked app。
