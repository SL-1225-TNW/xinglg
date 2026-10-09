# B 阶段（总规 §32）剩余项清单

定性方法：运行时实证（浏览器实跑触发后的副作用），不用符号计数。
基线脚本：`tests/probe-phase-b-runtime.mjs`（22 项断言）
盘点日期：**基线 22/22 通过，空白 0。B 阶段已全部落地。**

判定铁律：先回答「正确行为是什么」再写断言；符号存在 ≠ 功能可用。

## 已实现（22 项，全覆盖）

| 节 | 项 | 实证证据 |
|---|---|---|
| 32.2 | 土壤肥力 0-100 + 三类轮作组 | audit-fertility 通过 |
| 32.2 | 堆肥闭环（设备+配方+施肥） | audit-compost 28 项通过 |
| 32.2 | 果树/水果物品 | jam / dev_jam |
| 32.2 | 鸡舍与羊圈畜养闭环 | audit-livestock 41 项通过；ITEMS 含 egg/wool |
| 32.2 | 居家厨房可用 | probe-kitchen 19 项通过（真实键鼠全链路）|
| 32.3 | 三层矿山场景 | mine1/2/3 均存在 |
| 32.3 | 勘探节点数据面 + 恢复周期 | EXPLORE_NODES 有 hp/regen |
| 32.3 | 升降轨道 | mine_lift 委托 |
| 32.4 | 森林可探索并进入真实场景 | devSwitchScene → scene='forest' |
| 32.4 | 勘探节点按类型分布 | 实扫得 `tree,forage` |
| 32.4 | 多次采伐渐进降到 0 并记账 day | wood hp 3→0，stampedDay 记录 |
| 32.4 | 采空后拒绝再采（冷却期内） | rejectedAfterEmpty=true |
| 32.4 | 采空才结算产出物 | gained=5 = qty |
| 32.5 | 鱼种分层记录 | 7 种，T1/T2/T3 |
| 32.5 | 养鱼账本 投放/容量/收获 | audit-fishpond 51 项；装饰鱼不入账已验证 |
| 32.6 | 种子铺全量常售 | 3 种作物 |
| 32.6 | 集市每周轮换且可预览 | audit-market 29 项；预览与实际同源 |
| 32.6 | 任务板按地点/到期筛选 | questProgress |
| 32.7 | 城市建筑清单 | 56 座 |

## 本轮修掉的旧探针缺陷（非功能缺失）

这三条曾让基线误报「空白」，实际代码一直是对的：

1. **`doSwitchScene` 是异步的**（内部 200ms setTimeout 淡入）。
   探针在 `page.evaluate` 里同步读 `sceneId`，永远读到切换前的 `'farm'`，
   导致 32.4 五项断言全灭。改用同步的 `M.devSwitchScene`。
2. **`gatherExplore` 未导出到 `__MOSS__`**。
   符号存在但探针看不见 → 探针以为没实现。已补导出（纯观测面，不改行为）。
3. **「采空后拒绝再采」硬编码了 `stone`**。
   总规 §32.4 的森林资源是「普通木、硬木、蘑菇、浆果」，矿石属 §32.3 矿山。
   森林不存在 stone 节点，正确 oracle 是「对扫到的硬资源类型逐个断言」，
   而不是要求必须同时出现 tree 和 stone。

另修正一处反模式断言：「居家厨房 UI 可达」原口径是
`/kind:\s*'kitchen'/.test(document.documentElement.innerHTML)`——
在 farm 场景下用字符串正则找符号，属典型「符号存在 ≠ 功能可达」。
已改为验证家具/碰撞/交互表/派发/配方五段真实契约；
完整玩家路径由 `tests/probe-kitchen.mjs` 用真实键鼠驱动覆盖。

## 明确不做（超出 B 阶段边界）

- 渡口客运/巡河、湿地水质任务（§32.5 提到但 §32.1 分期未列入 B 首批）
- 高级课程、邻里事件、邮务（§32.6 提到，规模大，留待后续）
- 城市内部房间细节（§32.7 说「优先填充用途与内部」，56 座已有，需单独盘点）

## 已知既有失败（与 B 阶段无关）

`lint-self.mjs` 报 fertility/gatherExplore 等孤儿引用；`run-ui/run-edge/run-guide/run-main`
等脚本在 HEAD 上即 exit≠0。已用 `git show HEAD:game.js` 对照确认为既有状态，非本次引入。
