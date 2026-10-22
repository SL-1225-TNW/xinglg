---
name: xinglu-economy-invariants
description: 改苔芽农场的钱、体力、补助、贷款、扣押、日结算时使用（game.js 里有 45 处直接 state.coins +=/++，没有统一发钱函数）。Use when adding or touching 收入/支出/费用/补助/信用合同/扣押/日结算 performSettlement, when a 资金守恒 or 重复发放 regression appears, or when writing an acceptance suite about money and time.
---

# 苔芽农场 · 经济与结算不变量

> 行号基准：2026-10-22；行号会漂移，先 grep 再用。

这个仓库**没有** `addCoins()` 之类的单一入口：`game.js` 里约 45 处直接 `state.coins += …`。所以钱的安全性不靠封装，
靠"每条收入都有对价 + 每条专项断言守恒"。改经济代码时把自己当成在改一个没有事务的钱包。

## 钱的四类来源，必须分得清

| 类型 | 例子 | 守恒要求 |
| --- | --- | --- |
| 卖货 | 出货箱、商店卖物 | 物品必须 −N，收入 = 单价 × N |
| 劳动 | 每日委托、岗位日薪、探索战利品 | 必须有工时/体力/次数消耗，且当日不可重复领 |
| 制度性补助 | `CFG.dailyAllowance = 50`、安置援助 | **不是收入**：不计入经营收入、有天数上限（`SETTLE_ALLOWANCE_DAYS = 7`），外出工作的日子不发 |
| 借款 | 信用合同 `CREDIT_PRINCIPAL = 300` | 到手是负债：`dueTotal ≥ principal`，到期必须扣，违约走扣押；弹窗文案要说明"不算收入" |

改动任何一类，先在弹窗/结算文案里说清它属于哪一类 —— 文案与账目口径不一致，测试就该拦。

## 信用合同（R5-C）关键数与函数

```js
var CREDIT_PRINCIPAL = 300, CREDIT_RATE = 0.15, CREDIT_DAYS = 14;
var CREDIT_LATE_PER_DAY = 2, CREDIT_LATE_CAP = 40, CREDIT_DEFAULT_DAYS = 7;
var CREDIT_RENEGOTIATE_RATE = 0.21, CREDIT_RENEGOTIATE_DAYS = 7;
var CREDIT_SEIZABLE = ['gem','stone_block','iron_ingot','copper_ingot','limestone','hardwood','plank','timber'];
```

| 行 | 函数 | 不变量 |
| --- | --- | --- |
| 180 | `normalizeCreditReview(raw)` | 复核窗口、时限、结果三态可恢复 |
| 206 | `creditFileReview()` | 证据行用**申请时**快照 `debtAt`，不用当前欠款重算 |
| 335 | `creditDebt(c)` | 欠款 = 本金 + 利息 + 罚息 − 已减免，非负 |
| 340 | `creditTick()` | 每日推进罚息与扣押；`lateFee = max(0, min(CAP, lateDays × PER_DAY) − relief)`；扣押门禁 `!c.seizedOnce && !c.seized.length` |
| 355 | `creditSeizeOnce()` | 合同级只扣押一次；写 `debtAt` 快照、置 `seizedOnce` |
| 373 | `creditTake()` | 还清后重置 `seizedOnce/seized/review` |

罚息减免是**跨日的**：裁定的 `relief` 在之后每一天都要从原始罚息里扣，而不是只生效当天；
同时封顶必须仍然生效（先夹到 CAP 再减免，最后 `max(0)`）。

## 日结算顺序（performSettlement）

`requestSleep()`（10062）→ `performSettlement()`（10097）把所有账算完 →
`settlementPages()`（10348）按 出货 → 田里变化 → 肥力 → 果酱 → 委托 → 草甸 → 边境 → 牲畜 → 鱼塘 → 天气
**条件性**追加页面 → `showSettlement()`（10495）逐页渲染，最后一页点「开始新的一天」才 `closeWindow()`。

因此：真实页数是**变量**（某次实测是 7 页），任何"第 N 页是 X"的断言都要先读 `winTitle` 的 `n/N`。
`settleHistory` 记录当日 `{ day, income }`；`normalizeSettleHistory`（4371）负责旧档。
加新页只往 `settlementPages()` 的条件序列里插，不碰翻页逻辑（`settleNext` 10486 / `settleSkip` 10490）。

## 新收入上线前的六问

1. 谁付这笔钱？有没有物品/工时/次数被扣？
2. 能不能同一天重复领（连点、重开面板、跨存档重载）？
3. 跨日会不会二次发放（`tick` 与结算各算一次）？
4. 有没有上限/期限/递减？玩家把它当"收入"还是"补助"？
5. 读旧档时这笔记录从哪来（快照字段有没有）？
6. 哪条专项断言会拦住它？没有就写一条。

## 断言写法

```js
const before = await snap(page);
// …真实操作（点按钮，不是改 state）…
const after = await snap(page);
assert.equal(after.coins - before.coins, 24, '卖 2 个萝卜应得 24 金');
assert.deepEqual(after.inv.radish, (before.inv.radish || 0) - 2);
assert.equal(after.energy, before.energy - energyCost);
// 幂等：再点一次不应再发钱
const again = await snap(page); assert.equal(again.coins, after.coins);
```

- 差值断言优于绝对值断言（绝对值会随平衡调整全红）。
- 补助与借款要单独断言：`income` 里不含补助、借款不进 `income`。
- 扣押：断言物品真的离开背包、第二次不再扣押、`debtAt` 不随之后的天数变化。
- 现成参考：`tests/run-r5-finance-safety.mjs`（86 项，资金守恒/零对价/幂等/跨日）、
  `tests/run-r5-credit.mjs`（78 项）、`tests/run-r5-review.mjs`（57 项）。

## 反模式

- 直接加钱却没有扣减，或"先给钱再补扣"（中途有存档点就能复制）。
- 用当前欠款/当前价格当历史证据（要快照）。
- 把补助算进经营收入，或把借款算成利润。
- 只在结算里加逻辑而忘了 `tick`（或反之），造成一天两次。
- 改了数值常量却没跑 `run-r5-finance-safety` 与 `run-r5-credit`。
