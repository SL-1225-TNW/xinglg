---
name: xinglu-playtest-suite-authoring
description: 为苔芽农场（单文件浏览器经营游戏，game.js 约 2.6 万行）编写或修改 Playwright 验收套件 tests/run-*.mjs。Use when adding a 专项验收, when a tests/run-*.mjs fails and you must judge whether the spec or the game is wrong, when mounting a suite into tests/run-ci.mjs, or when the suite must also pass on 苔芽农场-单文件版.html.
---

# 苔芽农场 · 验收套件编写

仓库根为 `C:\Users\22079\Documents\ChatGPT\星露谷`。套件在 `tests/`，入口 `tests/run-ci.mjs`。
原则一句话：**用真实输入驱动，用读取式断言判定，夹具边界写在文件头。**

## 动作分工

| 层面 | 允许 | 说明 |
| --- | --- | --- |
| 用真实输入 | 键盘（`interactWith`、`press`）、鼠标（`clickTile`）、触摸（`#touchAct` 等） | 验收的主证据，越接近玩家越好 |
| 读状态 | `snap`、`hud`、`page.evaluate(() => __MOSS__.xxx)` | 只读，不写 |
| 合法夹具 | 种好的田、背包物品、已修的桥、已验收的工程、信任度 | 必须是**更早阶段已验证**的成果 |
| 越界夹具 | 写任期／合同／军籍、`devOpenService`／`devSwitchScene`／直接改日期强推结算 | 只用于回归，不能当"自然入口"证据；用时在文件头注明 |

写新套件时先问：这条断言证明的是**逻辑正确**、**玩家能走到**，还是**手感可接受**？三层不要混写。

## 套件分层（2026-10-25）

| 层 | 典型内容 | 断言口径 | 项数怎么用 |
| --- | --- | --- | --- |
| 夹具套件 | 固定 seed／预置存档／直接给状态，确定性 | 精确项数（如「195 项通过」） | 可写进文档与计划 |
| 自然入口套件 | 真实按键/按钮从头走到尾，含过夜与分支 | 只断言「任务全通／状态推进／无浏览器错误」 | 当元数据，不进正文（会漂移：279/291/289） |

- 时间/体力预算类算术断言下沉快速夹具，不让约 27 分钟的自然路线承担精准算术——自然路线负责「玩家能不能走到」，不负责「数值刚好是 37」。
- 两层都要支持 `--single-file`；挂进 `run-ci` 后由 `output/ci-journal.json` 记录，不再要求整轮一次跑完。

## 骨架

```js
import assert from 'node:assert/strict';
import { launch, boot, snap, hud, walkTo, interactWith, clickWin, winTitle, winText, winOpen } from './harness.mjs';
const single = process.argv.includes('--single-file');
const { browser, page, errors } = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
try {
  await boot(page);                       // 新档
  // …真实操作 + assert…
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS 一句话说明本次验收覆盖了什么' + (single ? '（单文件版）' : ''));
} finally { await browser.close(); }
```

`--single-file` 必须支持：CI 会在打包产物上复跑同一套件（源码通过 ≠ 产物通过）。

## 断言纪律

1. **读运行时真实结构**，不要重算一遍实现逻辑。分页窗口就用标题里的 `n/N` 取真实页数，再逐页读当前页的 `.section-title` / `.panel-box`。
2. **不要读整个容器做"含某文案"判断**。`.win-body` 里包含顶部分页网格（每页标题都印着），`winText()` 一旦读整窗，
   「第 3 页是果酱加工」这种断言停在哪页都能过 —— 这是已发生过的假绿。
3. **计数要有时源**：`Report` 的通过项数就是这个套件的验收条数，写进文档、别手抄。
4. **汇总行约定**（台账与文档机检会解析）：成功末行写 `PASS … N 项通过`（源码轮/单文件轮各一句），失败摘要写 `通过 N 项，失败 M 项`；不要只写「完成」。
5. **幂等与跨日各写一条**：重复点同一按钮、Escape 再进、次日重开面板，都是真实玩家会做的事。
6. 断言信息写清实际值/期望值（`Report.eq` 已带），失败时要能直接看出差在哪。

## 运行时环境

- 串行跑：`cd tests; node run-xxx.mjs`（`run-ci.mjs` 也是逐条 `spawnSync`）。**不要并行起两个浏览器作业** ——
  会撞出 `Page crashed` / `Target crashed` 的假回归。开工先 `node tests/env-check.mjs`，它会报是否已有浏览器作业。
- 全量/分批用 `node tests/run-ci.mjs --status` 看台账（x/109）、`--resume` 续跑；长跑期间别再手动起浏览器套件。
- Windows 沙箱里 Playwright 可能直接 `browserType.launch: spawn EPERM`（chrome-headless-shell 用 `--remote-debugging-pipe`，
  沙箱禁命名管道）。这是环境拒绝，不是代码回归；换到不受限的文件策略再跑。
- 截图写到 `output/playwright/`（按 `fileURLToPath(import.meta.url)` 定位，别用相对路径——`run-ci` 的 cwd 是 `tests/`）。
- 失败才需要看：`WALK_DEBUG=1` 会打印 `walkTo` 卡在哪一格。
- 夹具注意：`boot(page, { seed })` 实际写的是 **`moss-farm-v1`**；v2 旧档要么自己 `localStorage.setItem('moss-farm-v2', …)` 后 reload，要么用 `__MOSS__.normalizeSaveForTest` / `replaceSave`。旧档套件优先 `isolatedPage`，避免旧页面卸载时自动保存覆盖预置存档。

## 挂进 CI（以 `tests/run-ci.mjs` 当前代码为准）

- **浏览器层**是 `BROWSER_FILES` 字符串数组，直接加一项 `'run-xxx.mjs'`；**单文件复跑**是 `SINGLE_FILES` 数组，只挂**产物敏感**的套件（剧情 UI、门洞与出口、旧档迁移、存档快照、跨境门槛、触屏布局、跨系统修复回归）——纯逻辑与长程自然串联不进单文件层：产物与源码的 JS 逐字相同，复跑一遍不增加产物风险，却要把全量拖长。
- 同一段路的两条自然套件只留覆盖更全的那条进 CI（`run-m1-natural-story` 是 `run-m2-natural-story` 的真子集，已退出 CI，文件保留可手动跑）。
- 快速层的语法检查会自动 `node --check` 全部 `tests/*.mjs`，**临时探针文件也会被检查**，交付前清掉 `tmp-*.mjs`。
- 层数/条数以 `node tests/run-ci.mjs --dump-steps` 为准（当前 5 快速＋95 浏览器＋17 单文件＝117）；历史轮次的旧口径不是现状（各轮数字见 `tests/check-docs-allowlist.json`）。
- 挂完先 `node tests/run-ci.mjs --only=run-xxx` 单条验证；**日常迭代只跑受影响的套件，全量留给切片收口**；全量交给台账跑（`--status` 看 x/117），中断就 `--resume`，不必为一条套件从头重跑。
- 通过判据：同 treeHash 台账 117 阶段全绿＋末行「两层全部通过。」＋`output/ci-exit.log` 退出码 0；单条套件看自己的末行 `PASS … N 项通过`。

## 完工检查

- [ ] `node --check tests/run-xxx.mjs` 通过
- [ ] 源码轮、`--single-file` 轮都通过，`errors.length === 0`
- [ ] 文件头注释写清夹具给了什么、什么由按钮产生
- [ ] 已挂进 `run-ci.mjs`（BROWSER 字符串数组 + 单文件复跑列表），`node tests/run-ci.mjs --dump-steps` 能列出它
- [ ] 夹具套件写精确项数；自然入口套件写「任务全通/状态推进/无浏览器错误」，项数当元数据
- [ ] 验收项数写进 `docs/feature-status.md` 与对应 `docs/*-plan.md`；CI 数字以 `run-ci.mjs` 当前内容为准
- [ ] 交付前 `node tests/check-docs.mjs --regen` 绿（数字与台账/退出码一致）

`references/harness-api.md` 是 `tests/harness.mjs` 的接口清单与坑位。
