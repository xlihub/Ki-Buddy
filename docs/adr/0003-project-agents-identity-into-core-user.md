---
status: accepted
---

# 将 Agents 平台账户投影为 Core 用户

Ki-Buddy 是 Agents 平台的桌面客户端，不建立第二套产品账户。用户使用目标 Agents 部署的 `base_url`、平台账号和密码登录；Agents 继续拥有用户、组织、角色、权限和 token 签发。近期不要求 Agents 改造成 OAuth2/OIDC Provider。

Ki-Buddy 近期只支持一个当前部署和一个 active 账户。密码只用于一次登录请求；token 按规范化 `base_url` 与稳定 Agents 用户标识隔离并保存在操作系统凭据存储中，只由主进程读取。renderer、Assistant 和 Adapter 不直接接触凭据存储。

登录成功后，Ki-Buddy 将 `(规范化 base_url, 稳定 Agents 用户标识)` 映射为无碰撞 external identity，并复用 Ki-Core 现有 `Aionpro` external user/session contract 建立 Core 用户作用域。`Aionpro` 只是近期的内核兼容类型，不能作为产品身份名称；当该类型无法同时表达多个外部身份提供方或 Agents 权限需求时，再把 Ki-Core external identity 通用化。

## 模块边界

Ki-Buddy 的主进程凭据、Agents 登录、Core 用户投影和 IPC 注册集中在 `process/ki-buddy/`，renderer 登录与首次介绍集中在 `renderer/pages/ki-buddy/`。这是为降低上游 AionUi 更新冲突而保留的产品结构例外；通用入口只负责装配产品模块，不承载产品认证流程。renderer 只能通过 preload 暴露的 `kiBuddyAuth` capability 判断并调用该产品能力，不能用通用 Electron 环境作为产品标识。

## 账号切换的数据边界

Ki-Buddy 只把认证会话和 Core user scope 中的持久业务数据归属于 Agents 平台账户。renderer `localStorage`、`sessionStorage`、Preview tab 和应用内浏览器属于当前客户端安装，不建立 Agents 账号 namespace，也不在退出、切换账号或切换部署时枚举、删除、保存或恢复这些数据。

账号 A 退出后登录账号 B 时，Ki-Buddy 撤销旧凭证与 Core session，停止旧账号受管进程和本地等待，并清除 SWR、订阅、模块级 cache 等账号相关内存状态。不同的非空 Core user id 触发 renderer 整页 reload；conversation、Team、task、自动 workspace 和结果引用依靠 Core user scope 隔离。重新登录账号 A 后，由相同 Core 用户恢复 A 的持久业务数据，不通过 renderer Web Storage 快照恢复。

Web Storage 中保留的 route、搜索、Explorer、Team UI、草稿、最近 workspace、file/diff tab 和 Core resource id 只用于恢复客户端工作界面，不能作为业务授权依据。读取或修改 Core 资源时仍使用当前 Core session 重新鉴权，项目 workspace 继续由操作系统文件权限约束。应用内浏览器的 tab 元数据及固定 Electron partition `persist:aionui-browser` 中的 Cookie、站点存储和 cache 也与 Agents 账号无关，只能由用户主动执行浏览器数据清理。

该边界与 AionUi v2.1.54 生产客户端的 OAuth 账号切换一致：Core user scope 隔离并恢复持久业务数据，renderer reload 清除旧账号内存，desktop logout 不扫描 renderer Web Storage，也不清应用内浏览器 partition。详细数据分类与生产包证据见 [Ki-Buddy 账号切换数据分类与 AionUi v2.1.54 对照](../architecture/research/ki-buddy-account-cache-classification.md)。

## Considered Options

- Ki-Buddy 自建账户再映射 Agents 用户：会形成第二个身份源和权限配置入口。
- 近期修改 Ki-Core 建设通用 external identity：领域含义更准确，但会增加上游内核维护成本。
- 每个账户使用独立 data directory：物理隔离明确，但会分离全部本地配置并要求切换时重启 Core。
- 按已知 key 清理 renderer Web Storage：key 清单会随功能变化失真，也会把浏览器、布局、草稿和 workspace 等客户端状态误判为账号数据。
- 按 Agents 账号保存并恢复 Web Storage 快照：重复建立 Core 已有的账号恢复机制，并把客户端工作状态错误改成账号资产。
- 退出时清空全部 Web Storage 或浏览器 partition：可以消除残留引用，但会破坏桌面客户端跨账号保留本地工作界面和浏览器登录态的产品行为。

## Consequences

- 首次使用先显示 Ki-Buddy 产品 onboarding，随后强制 Agents 登录。干净安装在 onboarding 完成前不存在可恢复的账号会话；onboarding 本身不触发登录、Core User 投影或工作历史创建。未登录不能进入业务界面或创建 conversation、Team、task 或 workspace 历史。Ki-Buddy 使用版本固定的专属 Core 数据目录，不认领预发布 `system_default_user` 数据，也不建设公开产品迁移流程。
- conversation、Team、自动 workspace 等持久业务数据必须按 deployment 与 Core 用户隔离。renderer 的账号相关内存状态在账号变化时销毁；renderer Web Storage 属于客户端工作状态，不随 Agents 账号切换清理或建立账号 namespace。
- 修改 `base_url`、退出、认证失效或切换账号时，必须停止旧账户 Adapter 与本地等待，清除 token、catalog cache 和临时敏感状态；这不表示远端执行已取消。
- 首发允许固定有效期 token 到期后重新登录。主动退出清除本地凭证、renderer 的账号相关内存状态和 Core 投影会话，但不删除 renderer Web Storage，也不复制或调用 Agents 私有 logout/OAuth 接口。Bridge 自动续期是高优先级后续需求，完成后不设置绝对会话上限；Agents 服务端 logout/revocation 是更远期需求。
- Agents token 与 Core session 的签发方、受众和用途不同，不能合并成一种凭证。
- A→退出→B→退出→A 的验收必须同时证明：Core 业务数据按稳定用户标识隔离并恢复，renderer 账号相关内存已销毁，Web Storage 与真实 browser tab 保持不变。
- 同一操作系统用户登录 Ki-Buddy 的另一个 Agents 账号后，可能看到上一个账号留下的客户端 route、搜索、草稿或 Preview 外观；这是本机客户端状态共享的既定语义。任何残留 Core 资源引用都必须在当前 Core 用户下重新鉴权，不能据此读取旧账号业务数据。
- AionUi WebUI 的通用 logout 清理行为保持原样；Ki-Buddy 产品认证路径必须显式选择保留 renderer Web Storage，不能把该产品规则写成所有产品的默认行为。
