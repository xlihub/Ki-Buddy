# Agents Bridge catalog fixture

`catalog.json` 依据 Agents 仓库 commit `acab8f46f03ac30ace3f1e93a9a469de5e49d707` 的
`GET /bridge/agents/catalog` contract 创建，基线日期为 2026-08-19。

fixture 只保留 Adapter contract 所需的结构和虚构内容，不包含 token、组织信息、完整
`base_url`、真实 agent 身份、业务输入或本地路径。更新 fixture 时必须同时记录新的 Agents
commit，并继续使用虚构内容。
