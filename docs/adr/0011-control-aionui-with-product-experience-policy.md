---
status: accepted
---

# 通过产品体验策略控制 Ki-Buddy 的 AionUi 能力

Ki-Buddy 长期跟随 AionUi 演进，但首个正式版本只开放经过产品确认的功能和资源。Ki-Buddy 使用随安装包发布、严格版本化的产品体验策略统一决定产品功能状态、产品资源访问和运行默认值；AionUi 保持完整能力，并通过少量稳定 seam 消费策略结果。

产品功能使用稳定的产品能力 ID 标识，不使用路由、组件名或菜单 ID。一个功能状态同时约束入口、直接访问和专属运行行为；Agent、Assistant、Model、Skill 和 MCP 通过 `hidden`、`use`、`manage` 三档产品资源访问控制全部 catalog 消费者。主进程与 renderer 使用同一份不可变策略快照，renderer 在首个业务画面前通过 preload 取得快照。

AionUi 与 Ki-Buddy 分别提供 adapter。产品 capability 完全缺失时使用完整 AionUi 行为；运行环境已经识别为 Ki-Buddy，但策略缺失、字段未知、依赖矛盾或版本不支持时显示安装完整性错误，不能退回 AionUi。AionUi 新增产品能力后，Ki-Buddy 必须明确声明启用或停用，构建校验才能通过。

路由、导航、资源 catalog 和生命周期分别根据同一策略生成投影。导航 registry 保持稳定顺序，产品策略不复制菜单和路由结构。停用功能的代码继续随上游基线打包，使后续 Ki-Buddy 版本可以通过更新策略重新开放能力；产品功能状态只约束客户端产品行为，不替代 Agents 平台或 AionCore 的安全授权。

## 上游接缝与同步维护

现有 AionUi 扩展点只能分别控制页面或运行模块，不能在首个业务画面前向 main、preload 和 renderer 提供同一份产品能力快照，也不能保证导航、直接路由和生命周期同时停用。因此当前版本保留以下显式接缝：

| 上游文件                                                                                                                                                                                                                                  | 产品职责                                                                                                       | AionUi 原行为保护                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/desktop/src/index.ts`                                                                                                                                                                                                           | 选择产品启动状态；配置损坏时只转发到 Ki-Buddy 完整性窗口，不进入业务生命周期                                   | capability 缺失时继续执行完整 AionUi 启动、更新、Tray 和 backend 流程                            |
| `packages/desktop/src/preload/main.ts`、`packages/desktop/src/common/types/platform/electron.ts`                                                                                                                                          | 通过单一 getter 转发不可变 bootstrap snapshot；完整性启动不读取业务 IPC                                        | AionUi preload 继续暴露原有 backend 与 renderer bridge                                           |
| `packages/desktop/src/renderer/index.html`、`packages/desktop/src/renderer/main.tsx`、`packages/desktop/src/renderer/services/i18n/index.ts`                                                                                              | 在首个业务画面前应用产品 capability；配置损坏时停止业务初始化；登录后目录缺少已注册产品资源时显示完整性错误    | capability 缺失时继续使用 AionUi 标题、主题、i18n 与应用 host                                    |
| `packages/desktop/src/renderer/components/layout/Layout.tsx`、`Router.tsx`、`Sider/index.tsx`、`Titlebar/index.tsx`                                                                                                                       | 从同一 feature ID 投影 Team 入口、直接路由、订阅和 workspace 控件                                              | `ProductExperience` 的 AionUi adapter 保持 Team 入口、路由与生命周期可用                         |
| `packages/desktop/src/renderer/components/layout/Router.tsx`、`Sider/index.tsx`、`packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx`、`SettingsPageWrapper.tsx`                                                   | 从统一设置 registry 生成菜单、默认页、直接路由和 Extension settings 挂载条件；停用页面不执行 hooks 或请求      | AionUi adapter 注册原有设置页和 Extension settings，旧设置地址继续按原有重定向规则工作           |
| `packages/desktop/src/renderer/components/settings/SettingsModal/contents/AppearanceModalContent.tsx`、`packages/desktop/src/renderer/pages/settings/AppearanceSettings/CssThemeSettings.tsx`                                             | 分别控制主题预设、主题市场和自定义主题的挂载与数据读取；字体和 UI scale 不受主题能力影响                       | AionUi adapter 保持内置主题、Extension 主题、自定义主题、字体与 UI scale 全部可用                |
| `packages/desktop/src/renderer/pages/guid/components/QuickActionButtons.tsx`                                                                                                                                                              | 只在 Guid WebUI 与 WebUI 页面同时启用时挂载状态请求、事件订阅和快捷入口                                        | AionUi adapter 保持 WebUI 快捷入口、状态显示和跳转                                               |
| `packages/desktop/src/renderer/hooks/mcp/catalog.ts`、`useMcpServers.ts`、`packages/desktop/src/renderer/pages/settings/ToolsSettings/`、`packages/desktop/src/renderer/components/settings/SettingsModal/contents/ToolsModalContent.tsx` | 按可信 catalog 通道和后端 `product_origin` 投影 MCP 的 `hidden`、`use`、`manage`；隐藏记录只保留非敏感诊断字段 | AionUi adapter 保持全部 MCP 来源可见；extension 原有只读交互和上游 image-generation 配置保持不变 |
| `packages/desktop/src/renderer/pages/cron/ScheduledTasksPage/CreateTaskDialog.tsx`                                                                                                                                                        | 从 behavior defaults 决定 Scheduled Tasks 是否允许 Team 执行者                                                 | AionUi adapter 继续使用 `assistant-or-team`                                                      |
| `packages/desktop/src/process/bridge/updateBridge.ts`、`notificationBridge.ts`                                                                                                                                                            | 注入产品更新源和通知资源；完整性失败时禁用对应业务服务                                                         | capability 缺失时继续使用 AionUi 更新源、User-Agent 和通知图标                                   |

AionUi 原行为由以下测试保护：

- `tests/unit/process/ki-buddy/runtimeFacade.test.ts`：capability 缺失时保留 AionUi lifecycle，并验证有效、无效 Ki-Buddy 分支。
- `tests/integration/ProductExperienceSiderHost.dom.test.tsx`：AionUi adapter 保留 Team 导航，Ki-Buddy adapter 隐藏入口。
- `tests/unit/renderer/layout/TitlebarWorkspaceToggle.dom.test.tsx`：AionUi 保留 workspace 切换能力。
- `tests/unit/renderer/cron/CreateTaskDialog.dom.test.tsx`：AionUi 保留 Assistant/Team 执行者，Ki-Buddy 只允许 Assistant。
- `tests/unit/renderer/hooks/mcpCatalog.dom.test.ts`、`useMcpServers.dom.test.ts`：Ki-Buddy 只保留 Custom 与 product built-in MCP，并为上游、extension 和未知来源生成结构化隐藏记录；未注册产品 requirement 时不读取目录，已注册 requirement 使用稳定后端 ID 验证；AionUi 保持原 catalog。
- `tests/unit/renderer/ki-buddy/KiBuddyProductIntegrityGate.dom.test.tsx`：只在登录后的 Ki-Buddy 产品路径验证 MCP requirement；目录已就绪但缺少已注册资源时显示结构化安装完整性错误。
- `tests/unit/feedback/McpServerHeaderFeedback.dom.test.tsx`、`tests/unit/settings/ToolsModalContentImageGuide.dom.test.tsx`：`use` 允许连接检测但不提供管理操作；AionUi 的 `manage` 操作和 image-generation 配置保持可用。
- `tests/unit/renderer/services/runtime/productBootstrap.dom.test.ts` 与 `kiBuddyRuntime.dom.test.ts`：capability 存在、缺失和损坏时使用对应启动路径。
- `tests/integration/ProductExperienceSettingsHost.dom.test.tsx`：Ki-Buddy 设置 registry、默认页、停用路由、移动端 Extension hooks、Appearance 数据读取和 Guid WebUI 订阅均受策略约束；AionUi 原设置、主题和 WebUI 快捷行为保持可用。

每次同步 AionUi 基线时必须复查：

1. main、preload、renderer 启动顺序是否改变，bootstrap 是否仍在首个业务画面前只读取一次。
2. Router、Sider、Settings registry、Appearance、Guid quick actions、Layout、Titlebar 或 Scheduled Tasks 是否新增了绕过 `ProductExperience` 的入口、直接访问、数据读取或生命周期。
3. AionUi 新增的完整产品能力是否已经加入稳定 feature ID，并在 Ki-Buddy 策略中明确声明启用或停用。
4. 更新、通知、Tray、菜单、backend 和后台订阅是否仍在 invalid 路径之外启动。
5. capability 存在与缺失两组回归、AionUi 原行为保护测试以及完整测试是否通过。

MCP 来源由 catalog 边界决定：extension bridge 固定产生 `extension`，本地 AionUi built-in 固定产生 `upstreamBuiltin`，后端普通 MCP 缺少来源字段时按现有 canonical `builtin` 字段区分 `upstreamBuiltin` 与 `custom`。后端可以通过只读响应字段 `product_origin: productBuiltin` 接入未来受信任产品资源；MCP create、import 和 update payload 不发送该字段。未知字段值归为 `unclassified`，不能按名称、ID 前缀或 renderer 输入提升为 product built-in。

MCP requirement 使用独立注册表和稳定后端资源 ID。#41 接入前注册表为空，不读取目录也不要求 Agents Adapter MCP 存在；#41 启用对应能力时登记真实资源 ID。登录后的 Ki-Buddy 在后端目录可用后执行验证：读取失败保持 `pending`，明确缺失才进入安装完整性错误。`manage` 只保留上游 AionUi 当前已经提供的管理操作，不据此增加上游尚未具备的启停入口。

当 AionUi 提供正式的产品策略注册、单一 preload bootstrap、首帧 capability 注入、统一设置 registry、主题子能力控制和按 capability 管理页面生命周期的公开扩展点后，应将对应职责迁移到上游接口，并删除本 ADR 列出的本地上游接缝。迁移只有在 Ki-Buddy invalid/ready 与 AionUi absent 三种状态的等价测试全部通过后才能完成。

## Considered Options

- 分别配置可见路由、导航和设置项：同一能力可能出现入口隐藏、路由可达或副作用仍启动的不一致状态。
- 在各个 AionUi 页面直接判断 Ki-Buddy：产品规则会分散到上游文件，增加每次基线同步的冲突和遗漏风险。
- 由服务端或用户设置动态覆盖策略：会增加远程状态、缓存和启动时序问题，首个正式版本没有该需求。

## Consequences

- `ki-buddy-product.json` 升级为 schema v3，并完整声明当前产品能力；schema v2 不进行运行时迁移。
- 产品内置资源缺失时，受影响能力显示安装完整性错误，不按名称选择相似上游资源替代；账户和诊断功能仍然可用。
- Ki-Buddy 首个正式版本使用独立且没有历史产品数据的运行空间；#40 不处理 AionUi、开发版或预发布 Ki-Buddy 数据兼容。
- Scheduled Tasks 只选择 Assistant，并使用产品策略投影后的 Assistant catalog；Team 不是定时任务执行者。
- #41 第一阶段只验收 standalone Agents 执行。ADR 0005 继续描述未来开放 Team 后的目标设计，当前不建设不可见的 Team 集成链路。
