---
status: accepted
---

# 将 Agents 平台账户投影为 Core 用户

Ki-Buddy 是 Agents 平台的桌面客户端，不建立第二套产品账户。用户使用目标 Agents 部署的 `base_url`、平台账号和密码登录；Agents 继续拥有用户、组织、角色、权限和 token 签发。近期不要求 Agents 改造成 OAuth2/OIDC Provider。

Ki-Buddy 近期只支持一个当前部署和一个 active 账户。密码只用于一次登录请求；token 按规范化 `base_url` 与稳定 Agents 用户标识隔离并保存在操作系统凭据存储中，只由主进程读取。renderer、Assistant 和 Adapter 不直接接触凭据存储。

登录成功后，Ki-Buddy 将 `(规范化 base_url, 稳定 Agents 用户标识)` 映射为无碰撞 external identity，并复用 Ki-Core 现有 `Aionpro` external user/session contract 建立 Core 用户作用域。`Aionpro` 只是近期的内核兼容类型，不能作为产品身份名称；当该类型无法同时表达多个外部身份提供方或 Agents 权限需求时，再把 Ki-Core external identity 通用化。

## 模块边界

Ki-Buddy 的主进程凭据、Agents 登录、Core 用户投影和 IPC 注册集中在 `process/ki-buddy/`，renderer 登录与首次介绍集中在 `renderer/pages/ki-buddy/`。这是为降低上游 AionUi 更新冲突而保留的产品结构例外；通用入口只负责装配产品模块，不承载产品认证流程。renderer 只能通过 preload 暴露的 `kiBuddyAuth` capability 判断并调用该产品能力，不能用通用 Electron 环境作为产品标识。

## Considered Options

- Ki-Buddy 自建账户再映射 Agents 用户：会形成第二个身份源和权限配置入口。
- 近期修改 Ki-Core 建设通用 external identity：领域含义更准确，但会增加上游内核维护成本。
- 每个账户使用独立 data directory：物理隔离明确，但会分离全部本地配置并要求切换时重启 Core。

## Consequences

- 首个公开版本从首次启动开始强制 Agents 登录；未登录不能进入业务界面或创建工作历史。Ki-Buddy 使用版本固定的专属 Core 数据目录，不认领预发布 `system_default_user` 数据，也不建设公开产品迁移流程。
- conversation、Team、自动 workspace、renderer cache 和运行时状态必须按 deployment 与用户隔离。退出或切换账号只隐藏并停止旧账户状态，不删除其工作历史。
- 修改 `base_url`、退出、认证失效或切换账号时，必须停止旧账户 Adapter 与本地等待，清除 token、catalog cache 和临时敏感状态；这不表示远端执行已取消。
- 首发允许固定有效期 token 到期后重新登录。主动退出清除本地凭证、renderer 业务缓存和 Core 投影会话，但不复制或调用 Agents 私有 logout/OAuth 接口。Bridge 自动续期是高优先级后续需求，完成后不设置绝对会话上限；Agents 服务端 logout/revocation 是更远期需求。
- Agents token 与 Core session 的签发方、受众和用途不同，不能合并成一种凭证。
