---
name: xinglu-save-compat
description: 在苔芽农场（game.js 单文件经营游戏）里新增或修改存档字段、子系统状态、旧档迁移时使用。Use when adding state.* to a save, when a 旧档/读档 regression appears (数据丢失、状态归零、面板卡死), when touching normalizeSave / migrateUnifiedSave / newXxx() / normalizeXxx(), or when writing a suite that seeds an old save.
---

# 苔芽农场 · 存档兼容与迁移

> 行号基准：2026-10-22；行号会漂移，先 grep 再用。**`newGameState` / `serialize` / `normalizeSave` 在后段都被重定义**
> （最终层分别是 23524 / 25244 / 23506），只改前面的字面量会被外层覆盖。

存档兼容是这个仓库最容易造成"玩家一读档就丢进度"的地方：`game.js` 有 32 个 `normalizeXxx()`、
4 个 `migrate*()`，而**测试默认都开新档**，所以旧档问题只有专门的 seed 用例才抓得到。

## 铁律

1. **不要升 `SCHEMA_VERSION`**（现为 `var SCHEMA_VERSION = 2;`）。`normalizeSave()` 里
   `if (raw.version !== SCHEMA_VERSION) return null;` —— 版本号一不符，`loadGame` 就判存档损坏。
   源码里两处注释写明这是刻意的：
   `/* 白蔷薇宫城布局版本。刻意不升 SCHEMA_VERSION：版本号一变旧档会被判损坏。 */`
   加字段靠 **默认值 + 归一化**，不靠改版本号。
2. **迁移不得凭空添加玩家没做过的事实**。旧档没有"点名日"就迁移成"未点名"，不能补一个 `musterDay`；
   旧档没有战斗记录，`milLastHurtDay(m)` 返回 −1 而不是 0（否则"最后负伤日 0"会让医帐一直判定休养）。
3. **证据要快照，不要读当前值**。账目、欠款、扣押、评价这类"事后要回看的数字"，写的时候存一份
   （如 `debtAt`），展示与裁定都用快照；只有老数据缺失时才回退到当前值，并只用于展示。
4. **只做加法**：新增字段给默认值；旧字段形状变化要在 `normalizeXxx` 里同时接受新老形状。

## 新增一个子系统状态的标准动作

```js
/* 1. 默认形状（唯一的真相源） */
function newXxxState() { return { active: false, day: 0, entries: [] }; }

/* 2. 归一化：从任意历史形状恢复成默认形状，并裁剪不可信值 */
function normalizeXxx(raw) {
  var d = newXxxState();
  if (!raw || typeof raw !== 'object') return d;
  d.active = raw.active === true;
  d.day = isInt(raw.day) && raw.day >= 0 ? raw.day : 0;
  d.entries = Array.isArray(raw.entries) ? raw.entries.filter(e => e && typeof e === 'object') : [];
  return d;
}

/* 3. 挂进 newGameState()：老档缺这一项时用默认值补齐 */
xxx: state.xxx || newXxxState(),
```

`normalizeSave()` 逐字段用 `num(v, default, min, max)` 夹取值域，位置/时间/金币/体力都要夹；
新增嵌套对象在它里面用 `normalizeXxx(raw.xxx)` 收口，不要在 `normalizeSave` 里手写一堆 `if`。

结构级变化（换层级、换场景命名、换字段语义）才写 `migrate*`：
`migrateV1`（最老格式）、`migrateUnifiedSave`（统一档）、`migrateFishpondForOldSaves`、`migrateTravelForOldSaves`。
迁移函数签名一般是 `(s)` 或 `(raw, s)`，只改内存里的对象，不写盘。

## 兼容历史形状的三种真实写法

```js
/* ① 新字段 + 两种历史形状一起认（合同扣押） */
c.seizedOnce = raw.seizedOnce === true || c.seized.length > 0 || !!c.review;

/* ② 老数据没有快照时按当前值回填，仅用于展示（扣押欠款） */
debtAt: isInt(s.debtAt) ? s.debtAt : creditDebt(c)

/* ③ 旧档缺来源字段时按可见身份回推（委任来源） */
if (!c.source) c.source = c.role === '驻地正式委任' ? 'career' : 'draft';
```

写回填时要问一句：**这条回填会不会被当成事实再写入？** 会，就改成只读派生（函数），不要写进 state。

## 旧档用例怎么写

```js
const old = JSON.stringify({ version: 2, totalDay: 12, coins: 300, /* …缺新字段的旧形状… */ });
const { browser, page, errors } = await launch();
await boot(page, { fresh: false, seed: old });     // 走"继续游戏"
const st = await snap(page);
assert.equal(st.day, 12);
assert.equal(await page.evaluate(() => __MOSS__.state.xxx.active), false);   // 默认值补齐
// 还要走到曾经卡死的那条路，例如点名、开面板、过夜
await interactWith(page, tx, ty);
assert.ok(await winOpen(page));
assert.equal(errors.length, 0);
```

现成参考：`tests/run-r5-military.mjs`（旧档点名死锁、无战斗记录）、`tests/run-r5-review.mjs`（复核后退还再读档）、
`tests/run-r4-legacy-save.mjs`、`tests/run-save-invariants.mjs`。做旧档用例优先用 `isolatedPage`，
避免旧页面卸载时的自动保存覆盖预置存档。

## 自查

- [ ] 没有改 `SCHEMA_VERSION`
- [ ] `newXxxState()` 是唯一默认值来源，`normalizeXxx` 只做裁剪与兼容
- [ ] 老档读进来后不凭空多出事实（点名日、战斗记录、已付账目）
- [ ] 证据字段有快照，回填只读
- [ ] 有一条 seed 旧档的用例走到了曾经出问题的那条路径
- [ ] 新档、旧档各跑一遍，`errors.length === 0`

`references/normalize-catalog.md` 是 `normalize*`/`migrate*` 的锚点清单（行号会漂移，先 grep `^function normalize`）。
2026-10-22 的完整清单（32 个 normalize + 4 个 migrate + sanitize）也维护在 `xinglu-code-navigation/references/anchors.md`。

夹具注意：`harness.boot({seed})` 实际写的是 `moss-farm-v1`；v2 旧档要自己 `localStorage.setItem('moss-farm-v2', …)` 后 reload，
或用 `__MOSS__.normalizeSaveForTest` / `replaceSave`。
