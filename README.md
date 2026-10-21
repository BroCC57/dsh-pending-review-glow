# dsh-pending-review-glow

Highlight every row of the DSH sidebar session list by state — pending approval, running, just finished — with one visual language (an inset border plus a subtle background tint), where colour and animation are the only differences. Zero dependencies, no build step.

给左侧会话列表的每一行加状态高亮，三种状态共用同一套「内描边 + 淡底」视觉语言，只用颜色和动效区分：

| 状态 | 颜色 | 动效 | 含义 |
| --- | --- | --- | --- |
| `pending` | 红 `rgba(244,63,94,…)` | 呼吸 1.5s | 有审批在等你 |
| `running` | 黄 `rgba(245,158,11,…)` | **常亮，不呼吸** | 推理/运行中 |
| `finished` | 绿 `rgba(34,197,94,…)` | 呼吸 1.5s | 刚跑完、不需要审核、且自那以后没点开过 |

优先级：红 > 黄 > 绿。行尾同时有一个同色小圆点（黄点常亮，红/绿点呼吸），作为槽位可见时更明确的提示。

- 包名 / 插件行 id：`dsh-pending-review-glow` / `pending-review-glow`
- 零依赖、零构建；浏览器半是 `window.__ModuleLoader__.load({ id, factory(require) })` 的 classic script
- 安装：插件页「添加插件」填本目录绝对路径（链接安装，改文件后重启即生效）

## 数据来源（全部是 emit 广播，无调用顺序问题）

| 状态 | 来源 |
| --- | --- |
| 待审核 | 会话审计事件 `approval/asked` / `approval/decided`（另用 `approval/request` + `prepend` 交叉校验） |
| 运行中 | `api-session/status(sessionId, running)` |
| 刚完成 | 同上，`running: true → false` 时记录时间戳 |

`approval/request` 监听器始终 `next()` 透传，不认领、不改写、不改超时任何审批。

## 路由

```
GET /pending-review-glow/state
{"revision":7,"seen":1,"asks":2,"count":1,
 "pending":[{"sessionId":"…","count":1,"tool":"…","since":…}],
 "running":["…"],
 "finished":[{"sessionId":"…","at":1760000000000}]}
```

- `asks`：累计 `approval/asked` 次数；`decided`：累计 `approval/decided` 次数；`seen`：`approval/request` 监听器执行次数；`count`：当前待审核会话数
- `recent`：最近 10 条与审批相关的事件类型（`approval/asked`、`approval/decided`、`turn/end`），排查"红色不灭"时看它
- 兜底：收到 `turn/end` 时强制清空该会话的 `asks` / `live` —— 审批是回合内封闭的，回合结束不可能还有未结审批
- 浏览器半按 `revision` 判重，`revision` 不变就不重渲染

## 绿色怎么消失

`finished` 只代表「跑完过」。浏览器半在两种情况下把 `sessionId → Date.now()` 写进 `localStorage`（键 `dsh-pending-review-glow:ack`），只要 `ack ≥ finished.at` 就不再绿，直到它下一次跑完刷新时间戳：

1. **该行被点击（pointerdown）** —— 你主动切过去看结果；
2. **跑完的那一刻该行正被选中** —— 你本来就开着它在看它跑完，算已看过。这条修复了"一直选中 → 跑完 → 切走 → 原行又变绿"的 bug。

另外为了让"你正打开的那个会话"不显示绿色，还会检查行元素上的高置信选中标记（`aria-selected="true"`、`aria-current="true|page"`、class 里的 `active|selected`）。**若这些标记都没命中**，当前会话跑完时也会短暂显示绿色，点它一次即可清除——这是已知的、可接受的近似。

## 渲染方式

浏览器半轮询路由（页面可见 400ms、切后台 3s，切回前台立刻补一次；请求不重叠），通过槽位 `sidebar.workspaces.session.row.action`（每个会话行都会挂载）放探针组件：

- 探针沿 DOM 向上定位所在行（高 20–72px、宽 ≥100px），给行加 `data-dsh-session-state="pending|running|finished"`
- 样式由组件内联的 `<style>` 提供（卸载即失效），每 2s 重申一次属性防 React 冲掉
- `prefers-reduced-motion` 下红/绿呼吸自动降级为常亮描边

## 实测记录（2026-10-17）

| 检查 | 结果 |
| --- | --- |
| 安装（插件页填本地目录） | 成功（链接到 `plugins/dsh-pending-review-glow`） |
| 无审批时 `/state` | `{revision:0,seen:0,asks:0,count:0,pending:[]}` |
| 审批悬置时 `/state` | `{revision:2,seen:1,asks:1,count:1,pending:[1]}` |
| 红色呼吸 + 行尾红点 | 用户确认生效 |
| 绿色呼吸 + 点击清除 | 用户确认生效 |

**踩过的坑（已修）**：三态改造时把 `running` 的会话 id 混进了 `pending` 列表，导致**运行中的行一律显示红色**。证据是那一刻的路由快照：`asks:0, decided:0, seen:0` 却 `count:1`，且 `pending` 那条记录的 `count` 是 0。现已把 `running` 从 `pending` 的 id 集合中移除，`running` 只出现在自己的字段里。


**已实测**：两条审批数据源、红色状态。
**待实测**（本轮新增）：黄色常亮（运行中）、绿色呼吸（跑完未点开）、点击后绿色消失、审批结算后红色熄灭。
**数据源风险**：`api-session/status` 若在某些装配下不广播，黄/绿不会出现——用下面的自检命令能立刻看出。

## 自检

```js
await (await fetch('/pending-review-glow/state')).json()
```

```js
document.querySelectorAll('[data-dsh-session-state]').length
```

## 卸载

插件页找到 `dsh-pending-review-glow` → 卸载 → 重启 DSH。清掉绿色记忆：Console 执行 `localStorage.removeItem('dsh-pending-review-glow:ack')`。
