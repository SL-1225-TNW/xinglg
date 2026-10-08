# 白蔷薇城：15 栋新建筑玩法接入 & 存档白名单

## 背景
白蔷薇城城市玩法扩展到 15 栋（工业 6 / 大学 4 / 金融 5）。`openCityService()` 一个函数
承担全部 15 栋的 UI 与逻辑，靠 `if (s === 'xxx')` 分派。

## 关键架构事实（下次改前必读）

### 1. `normalizeExploration()` 是白名单重建，不是深拷贝
`exploreState()` 上的**任何新字段，若没在 `normalizeExploration()` 的初始对象里声明，
存读档后一律丢失**。这是本项目最容易漏的一类 bug——功能本地测全对，读档后全空。

白名单初始对象里已含（本次补入的加 `★`）：
```
bankDeposit★ bankDay★ grainIndex★ millDay★ millStock★ taxPaid★ pledges★
requestDay cityReputation explorePoints smithCoupon ...
```
数组类字段（`pledges`）白名单里初始化为空数组，还需在下方补一段
`if(Array.isArray(raw.pledges)) e.pledges = raw.pledges.filter(...)` 才会从 raw 还原。

### 2. `cityWork()` 的事务顺序（已修）
**必须先 `bagAccepts(out, qty)` 再 `invRemove(need)`**。否则背包满时先扣光材料、
再发现产物放不下 → 材料凭空消失。顺序：材料够? → 体力够? → **背包放得下?** → 扣料 → 扣体力 → 推进时间 → 入包 → 存档。

### 3. 靠体力/时间限制的产出是合法的
`manuscript` / `field_note` 等知识产出没有 `need`，这是设计而非漏洞——体力+时间是成本。
扫描"无材料成本"时不要一律当 bug，要看是否已有体力/时间闸门。

### 4. 磨坊的小麦不走 `need`
磨坊自产小麦用 `ex.millStock`（门外麦仓，每日懒补 6 斗）扣减，在按钮回调里先扣，
再调 `cityWork()`。因为不受 `need` 保护，必须自己先查 `bagAccepts`。

## 遗留/待定
- 银行日息 1%，结算封顶 100 日（防多年不归一次爆息）。若想更贴近真实可改成按日逐日结。
- 交易所 `grainIndex` 看盘涨跌 ±1~±5，影响粮食售价 ±20%（`1.25 + idx*0.04`）。
- 税务 `taxPaid` 已落库但**没有和任务/剧情挂钩**——目前缴税只是记个 flag，无后续奖励。
- 质押 `pledges` 上限 20 条（防存档膨胀）。

## 验证方式
```
node --check game.js          # 语法
node /tmp/chk.cjs             # 引用完整性（道具 id 是否都存在于 ITEMS）
```
浏览器实机回归未做——城市 UI 需 Playwright 走位点击 15 个地标。