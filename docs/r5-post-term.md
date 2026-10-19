# R5-A 实施设计：首个岗位任期

2026-10-18。本文是**待实施设计**，代码里一行都还没有。配套总纲见 [R5 实施规划](r5-plan.md)。

对应《游戏总体规划》第八版 §13：「任职有工作范围、预算、考核、期限、交接与辞职；官职、专业职位和荣誉分别记录。」

## 一、现状盘点：R3 已经给了什么

R3-C2 已经把养护做成了真实的岗位责任，账本在 `pj.duty`（`game.js:10649-10769`），
由 `normalizeEngDuty()` 归一化。四处面板同源：水利控制室与风铃磨坊机房挂按钮，河港船务屋与船闸值守室只读
（`engDutyPanel` `game.js:10770`、`engDutyReadout` `game.js:10832`）。

现有字段与常量：

| 名称 | 值／含义 | 位置 |
| --- | --- | --- |
| `ENG_DUTY_CYCLE` | 3 天一个检视周期 | `game.js:10644` |
| `ENG_DUTY_SCOPE` | 工作范围（销钉渗水／闸缝间隙／岸坡淤积） | `game.js:10645` |
| `ENG_DUTY_CONTACT` | 联系人诺娅（水利控制室） | `game.js:10646` |
| `ENG_DUTY_SUCCESSOR` | 继任者玛尔（石灰采场工头） | `game.js:10647` |
| `ENG_DUTY_MAX_DEFER` | 延期封顶 3 次 | `game.js:10648` |
| `duty.status` | `none`／`active`／`handed`／`released` | `game.js:10651` |
| `duty.done` / `sinceEval` / `evalCount` | 检视次数、距上次评价、评价次数 | `game.js:10652` |
| `duty.overdue` / `deferCount` / `defers[]` | 逾期次数、延期次数、延期明细 | `game.js:10652` |

代价与时长（`engDutyPanel`）：检视 45 分钟／3 体力，延期 20 分钟，交接与退出各 30 分钟／1 体力。

### §13 六要素对照

| 要素 | 现状 | 缺口 |
| --- | --- | --- |
| 工作范围 | ✅ `ENG_DUTY_SCOPE` | 无 |
| 预算 | ❌ 完全没有岗位预算 | **缺** |
| 考核 | ⚠️ 有 `evalCount` 单次计数，没有任期汇总 | **缺汇总** |
| 期限 | ❌ 只有 `cycle` 周期，没有任期边界 | **缺** |
| 交接 | ⚠️ 有按钮，但继任者是硬编码常量、对方从不表态 | **缺对方确认** |
| 辞职 | ✅ `engDutyRelease()` | 无 |

R5-A 就是补这三缺一改，不推翻 R3 已验收的任何一条。

## 二、设计原则

1. **不新建第二套岗位账本。** `pj.duty` 继续是「现在是否还要检视」的唯一真相。任期档案另存，但只做**单向派生**：
   `terms[]` 是只追加的历史记录，不存在从 `terms[]` 反写 `duty` 的代码路径。
2. **不动 R3 已验收的状态机。** `duty.status` 保持 `none`／`active`／`handed`／`released` 四个取值不变。
   任期到期**不新增 status**，而是靠 `term.plannedEndDay` 已过 + 面板新增续任分区表达。
   这样 R3 的磨坊养护 58 项与湿地复查 42 项不需要改断言。
3. **不扩图、不加 NPC、不加新面板入口。** 全部复用四处既有面板；新增的继任者交互落在玛尔已有的采场位置。
4. **不虚构未实现的处罚与奖励。** 评级只写进档案，不自动发奖、不扣钱、不停产（沿用 R3 的既有纪律）。

## 三、数据结构

### 3.1 任期档案（只追加）

挂在 `professionalLife` 上：

```js
// newProfessionalLife() 增加
terms: [],     // 任期档案，每段任期一条，只追加
offices: {},   // 官职容器 —— 本轮建空容器，不提供任何入口
honors: [],    // 荣誉容器 —— 同上
```

单条任期：

```js
function newPostTerm(seq) {
  return {
    id: 'term:gatekeeper:' + seq,   // 稳定 ID，进事务名与存档
    post: 'gatekeeper',             // 岗位 ID；本轮只有河湾闸门养护岗
    scope: ENG_DUTY_SCOPE,          // 开岗时快照一次，之后改文案不动历史
    startDay: 0,
    plannedEndDay: 0,               // startDay + DAYS_PER_YEAR（112）
    closed: false,                  // 封存后只读
    endDay: 0,
    endReason: '',                  // renewed | handed | resigned | expired_closed
    successor: '', successorConfirmed: false,
    stats: { done: 0, evalCount: 0, deferCount: 0, overdue: 0 },
    fund: { paid: 0, institutionSpent: 0, tx: {} },
    review: { expectedCycles: 0, rating: '' }
  };
}
```

`pj.duty` 只加两个字段：`termId`（当前任期 ID，空串＝无任期）与 `handoverAskDay`（交接申请日，0＝未申请）。

### 3.2 为什么任期要独立成档

| 问题 | `pj.duty` 回答 | `terms[]` 回答 |
| --- | --- | --- |
| 我今天还要不要去检视？ | ✅ 唯一真相 | 不回答 |
| 我任过几段、每段什么下场？ | ❌ 答不了（交接后就没了） | ✅ 唯一真相 |
| 续任后上一段还查得到吗？ | ❌ | ✅ |

两者是「实时状态」与「历史档案」的关系，不是同一事实的两份拷贝。

### 3.3 单向派生规则

- `duty.status` 变为 `handed`／`released` 时，向 `terms[]` 追加终局快照（`closed: true`），此后该条不可改写。
- 续任时**追加新条目**，旧条目保持封存状态不变。
- `duty` 不从 `terms[]` 读取任何字段；`terms[]` 不反向驱动 `duty`。
- 面板同时读两处时，`duty` 决定按钮可用性，`terms[]` 决定期限与累计数字。两者在设计上不可能互相矛盾。

## 四、津贴账本与数值推导

§14.2 要求「个人钱包、农场经营、项目预算、机构军费和银行负债分别记账」。岗位津贴**不从工程拨付出**：
`pj.funds` 是 150 金的一次性工程专款（24 金闸件套装 ＋ 40 金／工日），已经花完，津贴混进去会让津贴替玩家垫工程款。

**按次结算，不预拨。** 每次**按期**完成一个 3 天周期，机构支付 12 金：

| 情形 | 津贴 | 说明 |
| --- | --- | --- |
| 按期检视并走完周期 | +12 金 | 唯一发放条件，与 `evalCount++` 同一处结算 |
| 逾期后补做 | 0 | 只留记录，不计评价（沿用 `engDutyInspect` 现有分支） |
| 申请延期 | 0 | 延期是有理由的中断，不是失职，但也不领津贴 |

**12 金是怎么算出来的**：一次检视 45 分钟／3 体力，约等于半天农活。R4 外出帮工日薪 22 金
（`OUTWORK_ASSIGNMENTS.harvest_help.wage`，`game.js:17446`），半天折 11 金；岗位津贴取 12 金，
略高于半天帮工，因为含专业判断与安全责任，又不至于高到可以替代外出工作。
单任期上限 37 次周期 × 12 金 = 444 金 —— 占同期全程外出帮工收入（112 × 22 = 2464 金）的约 18%，
是个稳定职业收入，不是暴利。

**机构侧与玩家侧分记**：机构支出记 `term.fund.institutionSpent`，玩家钱包 `state.coins += 12`，
两者各自留痕。发放走现有幂等路径，事务 ID 形如 `post:gatekeeper:<seq>:<cycle>` 存进 `term.fund.tx`，
重复结算、连点、读档都靠这个 ID 挡。

## 五、任期状态机

**关键决定：到期不新增 `duty.status` 取值。** 状态流转如下：

```
none ──开岗(验收当天 / 玩家登记)──> active ──交接确认完毕──> handed
                                        │
                                        ├──辞职────────> released
                                        │
                                        └──plannedEndDay 已过──> (仍是 active，多一个续任分区)
```

到期后 `duty.status` 仍是 `active`，玩家**仍要按周期检视**。这是有意的：
如果到期就免检，玩家会故意熬到期甩手。失去的只是「任期身份」，不是「岗位责任」。

续任不是自动的。`plannedEndDay` 过后面板出现「申请续任 · 60 分钟」，前置是 `engSafetyClear(pj)` 通过，
点击后向 `terms[]` 追加新条目、`duty.termId` 指向新条目、当天不追溯补发津贴。
旧条目保持 `closed: true` 与原有统计，两段任期在档案里并排可见。

## 六、交接与辞职的真实差异

现在两者共用 `engDutyClose()`（`game.js:10751`），继任者 `ENG_DUTY_SUCCESSOR` 是硬编码字符串，
玛尔从头到尾没有表态过 —— 所谓「交接」其实是玩家单方面宣布。R5-A 补上对方这一侧：

**交接（三步，必须到场）**

1. 在控制室或磨坊点「申请交接 · 20 分钟」→ 写 `duty.handoverAskDay`，安全事件未清则直接拒绝并说明原因。
2. 面板提示「去石灰采场向玛尔当面交代」。**在这之前没有完成按钮。**
3. 石灰采场玛尔处出现「接收河湾闸门养护责任」→ 确认后 `successorConfirmed = true` →
   回到任一处点「完成交接 · 30 分钟」，`duty.status = 'handed'`。

**辞职（一步，不需对方同意）** —— 沿用现有 `engDutyRelease()`，无新增交互。

离岗时若仍有逾期检视，照实计入档案并在交接说明里写明（现有 `engDutyClose` 已有此文案，沿用）。
交接不清账：未处理的安全事件仍留在 `pj.safety`。

## 七、任期考核评级

只用已有事实派生，**不发奖、不扣款、不停产**：

```js
function termRating(term) {
  var s = term.stats;
  if (s.deferCount === 0 && s.overdue === 0 &&
      s.evalCount >= term.review.expectedCycles - 1) return 'established';   // 稳任
  if (s.deferCount <= 2 && s.overdue <= 1) return 'conditional';              // 有条件续任
  return 'ended';                                                            // 任期未续
}
```

`expectedCycles = Math.floor((min(关闭日, 今天) - startDay) / ENG_DUTY_CYCLE)`，
封存时算一次写入 `term.review`，之后不再变化。

评级只出现在任期档案与续任提示里。§17.2 明确「爵位封授」属于保留项，
所以这里**不挂钩任何称号或奖励** —— 写进档案就是全部后果。

## 八、玩家入口

不新增交互点，全部落在既有四处：

| 地点 | 现状 | R5-A 新增 |
| --- | --- | --- |
| 水利站 · 闸门控制室 | 养护面板（可操作） | 「任期」分区：期限、已领津贴、本期评级、续任／交接 |
| 风铃磨坊机房 (15,11) | 养护复核（同源） | 同上，口吻改为马丁 |
| 下游河港 · 船务屋 | 只读 | 只读显示任期起止与已领津贴 |
| 河港船闸 · 值守室 | 只读 | 同上 |
| 石灰采场 · 玛尔 | 无 | 新增「接收养护责任」确认 |

「下一件事」文案沿用 `engNextStepText()`（`game.js:11257`）统一生成，
今日安排、J 委托日志、角色经历三处共用同一句，不另写副本。

## 九、旧档兼容

照抄 R3「旧档不追溯生成」的纪律（见 `restoreEngDuty()` `game.js:10683`）：

- `terms` 缺失或非数组 → 归一化为 `[]`。
- 旧档 `pj.duty.status === 'active'` 但无 `terms` → `duty.termId` 保持空串，
  面板显式显示「R3 时期的养护责任，未登记任期」，**不给倒计时、不假装正在任期内**。
  旧档的检视、延期、逾期照旧按 3 天周期跑，不受影响。
- 玩家可主动「登记为正式任期」→ 从**今天**起算 112 天，不追溯补发津贴、不补记考核。
- `normalizePostTerm()` 对负数天数、越界状态、非对象输入全部归一化，不静默造数据。

## 十、验收标准

新脚本 `tests/run-r5-post-term.mjs`，源码与单文件版**各跑一轮**，共 44 项断言：

| 组 | 项数 | 覆盖 |
| --- | --- | --- |
| A 入口与前置 | 6 | 未验收工程无任期分区；验收当天不自动生成任期；四处面板同源；河港／船闸只读显示期限；旧档 `terms` 归一化为 `[]`；390／844 触屏可点 |
| B 任期生命周期 | 8 | `startDay` ＝登记当天；`plannedEndDay` ＝ +112；到期前无续任按钮；到期后 `status` 仍是 `active`；**到期不免检视**；续任需安全事件清账；续任追加新条目且旧条目不变；续任当天不追溯津贴 |
| C 津贴账本 | 8 | 按期检视 +12；事务 ID 唯一；逾期补做不发；延期不发；重载不重复发；连点不重复发；**与 `pj.funds` 串账检测**；单任期 ≤ 444 |
| D 交接 | 8 | 安全事件未清拒绝申请；申请后给出去向；未确认前无完成按钮；采场可确认；确认后可完成；交接不需要机构复核；`status` 转 `handed`；归档保留四项统计 |
| E 辞职与归档 | 6 | 辞职单步完成；离岗逾期计入；`terms[]` 只追加不可改写；新任期不影响旧条目；档案含继任者；官职／荣誉容器为空且无入口 |
| F 评级 | 4 | 零延期零逾期 → `established`；延期 ≤2 逾期 ≤1 → `conditional`；其余 → `ended`；评级不发奖不改数值 |
| G 旧档与幂等 | 4 | 旧档 active 无任期 → 不显示倒计时；登记从今天起算；存档往返幂等；坏值归一化 |

同时回归：R3 磨坊养护 58 项、湿地复查 42 项、R4 外出工作 61 项必须全绿（不新增 status 取值即为此）。

## 十一、实施清单

按顺序改，**每步单独提交**：

1. `game.js:17816` `newProfessionalLife()` 增加 `terms` / `offices` / `honors`；
   `game.js:17826` `normalizeProfessionalLife()` 加 `normalizePostTerm()` 归一化。
2. 新增 `newPostTerm()`、`normalizePostTerm()`、`currentTerm()`、`termRating()`（放在 duty 区块 `game.js:10644` 附近）。
3. `engDutyInspect()`（`game.js:10711`）在按期分支里追加津贴发放与 `stats` 累计，事务 ID 入 `term.fund.tx`。
4. 交接三步：`engDutyHandover()` 拆成申请／确认／完成三段；玛尔处新增确认交互。
5. `engDutyPanel()`（`game.js:10770`）增「任期」分区；`engDutyReadout()`（`game.js:10832`）增只读期限行。
6. 续任：`engNextStepText()`（`game.js:11257`）在 `plannedEndDay` 已过时输出续任下一步。
7. 新增 `tests/run-r5-post-term.mjs`，挂进 `tests/run-ci.mjs` 第二层。
8. `node tests/build-single-file.mjs` 重建 `苔芽农场-单文件版.html`，跑单文件同步断言。
9. 同步 `README.md`、`docs/feature-status.md`、`docs/下一步待办清单.md`（**这三份本轮没动，属于 R4 agent 活动范围**）。

## 十二、风险

| 风险 | 处置 |
| --- | --- |
| 津贴变成新的印钱按钮 | 按次结算、有条件（必须按期完成一次周期）、单任期有 444 金自然上限、机构侧与玩家侧分记；夹具断言上限与串账 |
| 任期到期变成甩锅出口 | 到期不免检视，`status` 保持 `active`，甩不掉周期责任 |
| 续任/交接面板堆成一堵墙 | 复用既有四处面板，不新增入口；续任只在到期后出现 |
| 旧档玩家被假倒计时骗到 | 无 `terms` 显式说明「未登记任期」，登记从今天起算 |
| 与 R4 agent 冲突 | 本轮零代码。实施必须在 R4 提交之后，且按上面 9 步分次提交，不一次性大改 `game.js` |

## 十三、明确不做

不引入市长任期、市议会席位、官职内容、荣誉勋章、爵位封授（§17.2 保留项）。
不做七职业全部任期 —— 本轮只有河湾闸门养护岗一个岗位，其余岗位的任期结构在 A 验收后再逐个接。
不做 25 级与完整 25 天赋，不碰银行家与军事流程（分别属于 R5-C、R5-D）。
