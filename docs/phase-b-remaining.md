# B 阶段（总规 §32）剩余项清单

定性方法：运行时实证（浏览器实跑触发后的副作用），不用符号计数。
基线脚本：`tests/probe-phase-b-runtime.mjs`（22 项断言）
盘点日期：**基线 22/22 通过，空白 0。B 首批基线已验收，不能据此认定 §32 全部扩展完成。**

本轮额外修复（不属于 §32 功能缺口，是实测暴露的真实缺陷）：

| 项 | 现象 | 根因 | 修法 |
|---|---|---|---|
| 居民日程落点 | 10 个 NPC 站在家具/建筑里 | `addResident` 默认日程盲加 `x+2`/`y+2`，而锅炉、货箱、柜台都占格 | 新增 `nearestWalkable` 螺旋吸附，三段日程全部校验 |
| 锅炉工 | 站在 `city_boiler` 的货箱上（4,12,6×3） | 岗位点 + 偏移落在 crates 上 | 同上 |
| 学院教师 | 初始点 (520,96) 在 `uni_wing` 教学楼内（496,94,26×9） | 基线坐标直接指向楼体 | 同上；城市场景搜索半径给到 30 |

判定铁律：先回答「正确行为是什么」再写断言；符号存在 ≠ 功能可用。

## 基线检查与已有实现（22 项探针）

| 节 | 项 | 实证证据 |
|---|---|---|
| 32.2 | 土壤肥力 0-100 + 三类轮作组 | audit-fertility 通过 |
| 32.2 | 堆肥闭环（设备+配方+施肥） | audit-compost 28 项通过 |
| 32.2 | 果酱加工设备 | jam / dev_jam 只能证明加工；独立果树种植尚未实现 |
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

## 本轮新增的探针修正（探针错，代码对）

4. **「每个片区都有多种建筑家族且不跨区借用」**
   把 theme 精确映射和轮换游标混为一谈。`game.js:2346` 注释约束的是**游标不跨借**；
   `pickArchetype` 明确允许目标原型不在本片区家族时跨家族兜底，「绝不静默退化成住宅模板」。
   `civic_hall` 落在 `garden` 片区即此例，总规 §32.7 也要求「公共大厅无需爵位」。
   已拆成两条断言：游标轮换不跨借 + theme 映射优先于片区家族。

5. **`openQuestLog()` 缺参数**
   函数签名是 `openQuestLog(site)`，`site` 决定交付按钮文案。0 参不崩但语义不清，
   已显式传 `undefined`。

## 验收状态（合并 origin/main 后重跑）

| 脚本 | 结果 |
|---|---|
| `probe-phase-b-runtime.mjs` | 22/22，空白 0 |
| `run-living-world.mjs` | 52 PASS / 0 FAIL，exit=0 |
| `probe-kitchen.mjs` | 19/0 |
| `audit-compost-e2e.mjs` | 28 |
| `audit-livestock-e2e.mjs` | 41 |
| `audit-fishpond-e2e.mjs` | 51 |
| `audit-market-e2e.mjs` | 29 |
| `audit-fertility-e2e.mjs` | 全通过 |
| `audit-town-square.mjs` | 全通过 |
| `苔芽农场-单文件版.html` | 独立加载 boot ok，零 pageerror |

`lint-self.mjs` 孤儿引用已清零（补导出 nearestWalkable / houseFurniture /
plotFertility / rotationHint / fertilityTier / fertilityYieldFactor）。

### 剩余非阻塞项

`run-ui.mjs` 已按现有 10 槽规格修正，并核验设备、小铲、施肥的名称，当前 96/96 通过。

2026-10-09 重跑 B 基线 22/22；历史专项测试结果不代表本轮全部重跑。探针中的入口、数据存在检查不能替代完整玩家链路。阶段 C 首个新区域见 [磨坊验收](phase-c-mill.md)。
