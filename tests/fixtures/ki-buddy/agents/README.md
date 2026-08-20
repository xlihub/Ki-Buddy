# Agents Bridge contract fixtures

`catalog.json`、`invoke.json` 和 `invoke-failed.json` 依据 Agents 仓库 commit
`acab8f46f03ac30ace3f1e93a9a469de5e49d707` 的 `GET /bridge/agents/catalog` 与
`POST /bridge/agents/invoke` contract 创建，基线日期为 2026-08-19。

fixture 只保留 Adapter contract 所需的结构和虚构内容，不包含 token、组织信息、完整
`base_url`、真实 agent 身份、业务输入或本地路径。更新 fixture 时必须同时记录新的 Agents
commit，并继续使用虚构内容。

该基线中 catalog 安全投影排除的接口字段为 `apiKey`、`userId`、`flowId`、`oauthToken`；
invoke 调用方不可提交的接口控制字段为 `apiKey`、`userId`、`flowId`、`oauthToken`、
`baseUrlOverride`。Adapter 按这些原始字段名精确匹配，不从相似名称推断敏感字段。
