---
status: accepted
---

# 以 Agents 执行助手协调 standalone 与 Team 执行

Agents 执行助手在 standalone conversation 中直接服务用户，在 Team 中作为普通 member 由用户预选或由 Lead 通过现有 list、describe 和 spawn 能力按需创建。每个远端执行请求最多选择、描述并 direct invoke 一个已发布 agent 一次，不在助手内部创建不可见的远端 Planner。

standalone 缺参时由助手直接询问用户；Team 缺参时把同一个 execution task 设为 `pending` 并交还 Lead，由 Lead 补齐后重新分配。首次使用、catalog 过期或明确刷新时，Team 使用单独的 inventory task 建立真实能力视图；仍有效时可由同一 Assistant session 的后续 execution task 复用。

## Considered Options

- 把每个远端 agent 建模为 Team member：当前 direct invoke 不具备 member 的 mailbox、heartbeat、resume 和 cancel 生命周期。
- 只允许用户预先添加执行助手：忘记添加后，Lead 无法在当前 Team 使用远端能力。
- Team member 直接向用户补参：会建立第二条用户协调路径并绕过 Lead。

## Consequences

- 同一 Team 沿用普通 Assistant 多实例语义；实例身份使用 `slot_id`，不按显示名称或 Assistant 定义去重。
- 每个实例拥有独立 session、Adapter 进程、catalog cache 和 active invocation；不同实例可以用不同 taskId 并行工作。
- 同一 session 的后续请求沿用 Ki-Core/AionUi 现有队列，不在 Adapter 中再建队列，也不自动创建新实例绕过 busy 状态。
- inventory、候选比较和 `describe` 不构成执行请求。用户明确要求远端执行，或 Lead 分配 execution task 后，参数完整且候选明确时不增加重复确认；Agents 后续发布 `requiresApproval` 等正式 contract 时再调整。
- 补参、排队和上传准备都不能消耗 invoke 次数；用户改变意图或拒绝提供必填参数时保持零 invoke。
