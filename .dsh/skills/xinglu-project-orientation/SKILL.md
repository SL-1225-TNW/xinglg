---
name: xinglu-project-orientation
description: 进入苔芽农场开发、接手一个任务、核对"文档说的算不算数"、不知道下一步做什么时先加载。Use when starting any 苔芽农场 session, taking over an in-progress slice, deciding what to do next, resolving conflicts between 规划稿/现状文档/代码, or before choosing which subsystem skill to load.
---

# 苔芽农场 · 项目总入口

这是《苔芽农场》（仓库 `xinglg`，C:\Users\22079\Documents\ChatGPT\星露谷）的开发总控技能。
项目是**里程碑切片 + 证据驱动**的游戏开发：先定验收口径，再落码、写专项验收、重建单文件、跑两层 CI（台账判据）、同步文档、分笔提交。
每次任务先按本页走一遍，再加载具体子系统技能。仓库根的 `AGENTS.md` 是完整项目契约（自动加载），本页是"怎么开始"。

## 零、里程碑词汇

| 词汇 | 含义 |
| --- | --- |
| R0—R5 | 基础版切片（入口/成长/刀剑/职业/季节长计划/制度发布），已收口 |
| M0—M4 | 第九版主线《长风有归处》：M0 序章+第一幕、M1 第二/三幕、M2 第四/五幕、M3 终幕+后日谈、M4 剧情版发布 |
| MS1 | 第九版第一部 17 个新地点（场景 125→142，地图 22 标记/23 传送节点） |
| P0—P4 | `docs/现状与待办.md` 的待办分组：P0 前置、P1 第二/三幕、P2 第四/五幕、P3 终幕/发布、P4 单列人工验收 |

**注册数（地图/场景/任务/传送节点）≠ 完成度。**

## 一、开工 60 秒（不要跳过）

```powershell
git status --short          # 工作区可能已有上一轮/别人未提交的切片
git log --oneline -5        # 现在在哪个切片之后
node tests/env-check.mjs    # 环境预检：chromium/EPERM、是否已有浏览器作业、心跳是否中断、output 可写、PS 编码、git dirty
node tests/run-ci.mjs --status   # 有长跑或中断过：x/105、当前步骤、ETA、失败、未跑
```

然后读四份东西：

| 读什么 | 读哪几行 | 回答什么 |
| --- | --- | --- |
| `docs/现状与待办.md` | 顶部一行式现状 + 第二节勾选状态 | 现在在哪个里程碑、上一步交付到哪、下一步是什么 |
| `docs/feature-status.md` | 开头状态行 + 人工节 | 运行时事实（地图/场景/传送节点/套件数量），数量口径以它为准 |
| `README.md` | 顶部 3 条交付横幅 | 对外宣称的最后交付 |
| 任务对应的 `docs/*-plan.md` / `docs/m1-*.md` / `docs/主线剧情-*-审阅稿.md` | 范围、验收口径、实跑记录 | 这次要证明什么、哪些明确没做 |

按 `P0—P4` 编号定位任务。**不要从旧归档或旧审阅稿推断当前行为。**
若 `--status` 显示有长跑在跑（心跳新鲜），不要并行起浏览器作业；中断了就按台账进度记「分层通过 x/105」，别用无末行的日志当「已通过」。

## 二、权威顺序（冲突时以此为准）

1. **代码、运行时注册表、验收套件断言** —— 事实。
2. **CI 台账（`output/ci-journal.json`，同 treeHash）＋各步日志（`output/*.log`）＋退出码（`output/ci-exit.log`）** —— 证据；同 treeHash 105 条阶段全绿＋末行「两层全部通过。」＋退出码 0 才算通过，中断的日志既不是通过也不是产品红。
3. `docs/现状与待办.md`、各 `docs/*-plan.md` 的交付记录 —— 已核对的摘要。
4. `README.md` 交付横幅 —— 对外摘要。
5. `docs/feature-status.md` —— 生成物（勿手改人工节）。
6. `游戏总体规划.md`、主线剧情审阅稿 —— **提案/设计，不等于已落码或已验收**。
7. `*-归档.md` —— 历史。

三句口诀：**文档里写了 ≠ 已实装；CI 绿了 ≠ 玩家能自然走到；夹具过了 ≠ 没假绿。**

判「实现事实」要能指到：运行时注册表（`__MOSS__`/生成器读到的数量）或代码里的注册表项；判「已验收」要能指到：套件项数＋日志＋退出码＋台账里的 treeHash。

**交付状态只用六态**：未开工／在做（未验证）／分层通过 x/105（写原因与下一步）／已验收（同 treeHash 全绿＋末行＋退出码 0）／提案／未测（人工项）。中断不是状态。「已实装」只表示代码里有实现，不是交付状态。

## 三、任务分诊（动手前先答）

1. **里程碑**：属于 P0—P4 哪一项？对应 `docs/现状与待办.md` 的哪个勾选？
2. **验收口径**：哪份文档写了"做完的标准"？没有就先把口径补进 plan 文档。
3. **现场**：工作区是否已有该切片的半成品（`git status` + 相关文档的"本轮新做"）？不要重做或覆盖。
4. **改动面**：数据注册表 / 状态与存档 / 系统逻辑 / UI 面板 / 渲染 / 测试 / 文档，占哪几类？
5. **证据**：要新增/修改哪条 `tests/run-*.mjs`？是否必须 `--single-file`？哪些属于人工验收（单列，不假装）？

## 四、技能路由（按任务加载，别硬猜）

| 任务 | 先加载 |
| --- | --- |
| 找 game.js 里的函数/状态/扩展点 | `xinglu-code-navigation` |
| 窗口、面板、分页、HUD、触屏、响应式、styles.css | `xinglu-ui-window-css` |
| 钱、体力、补助、贷款、扣押、日结算 | `xinglu-economy-invariants` |
| 新增/修改存档字段、旧档迁移 | `xinglu-save-compat` |
| 地图/场景/门洞/交互点/面板接线 | `xinglu-scene-interaction` |
| 主线稿、任务链、NPC 对白 | `xinglu-story-quest-authoring` |
| 主循环/相机/DPR/分块/粒子/卡顿 | `xinglu-render-performance` |
| 写/改/修 Playwright 套件 | `xinglu-playtest-suite-authoring` |
| 打包、完整两层 CI、状态文档、提交 | `xinglu-release-pipeline` |

一个任务常要加载 2—3 个技能（例如"新剧情入口 + 面板"= story + scene + ui）。

## 五、切片闭环（摘要，细节看 release/playtest 技能）

```
读文档与代码（grep 核实） → 定验收口径（套件/项数/单文件/人工）
→ 最小改动（复用 MAPS/INTERACTABLES/QUESTS/state/normalize*/openWindow）
→ 写专项套件（真实输入、支持 --single-file、挂 run-ci）
→ node tests/build-single-file.mjs（冻结产物）→ node tests/env-check.mjs → node tests/run-ci.mjs --quick
→ 全量：powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action start；--status 观察 x/105、--resume 续跑
→ 同步 docs/现状与待办 + plan + feature-status（生成器）+ README 横幅；交付前 node tests/check-docs.mjs --regen
→ 分笔提交（代码/测试/文档/产物分开）；推送/发布仅在用户明确要求时
```

没有证据不报"完成"；报告必须写清：绿了什么（层/条/treeHash 或台账进度/退出码/日志名）、修了什么真缺陷（根因）、哪些失败已证伪、还差什么人工验收。

## 六、证据三层，永不混写

| 层 | 证明什么 | 例子 |
| --- | --- | --- |
| 逻辑与界面正确 | 规则、数值、文案、存档往返 | 夹具专项（源码 + 单文件） |
| 玩家能从入口走到 | 自然入口、不瞬移、门槛可解释 | `run-r5-natural-entry`、`run-r3-natural-entry` |
| 真机手感/陌生玩家理解度 | 实体手机、初见玩家 | **人工，未做就写未做** |

## 七、常见误判（都真实发生过）

- 把 `docs/*-plan.md` 的"计划"当成"已实装"，没看代码和运行时；按总规任务数铺量。
- 把"上一轮 CI 绿"或**中断/仍在增长的日志**当成"这次改动也绿"——必须在冻结产物上重跑，认同 treeHash 的台账＋末行＋退出码。
- 把**中断日志当通过、也当产品红**：无末行/心跳停/进程没了只是中断，记「分层通过 x/105（原因：…）」并 `--resume`。
- 中断后**从头重跑**：源码/测试/产物没变就 `--resume`；先换执行方式（`gate-detached.ps1`），再续跑。
- 用会话 `run_in_background` 的 pwsh job 跑全量 CI：会随 harness 重启整树被杀（真实踩过 3 次）；全量交计划任务 `MossFarmCI`。
- PowerShell 5.1 直接读 UTF-8 日志：乱码、项数读错（曾把 96 项读成 36 项）；必须 `-Encoding utf8` 或 `read` 工具。
- 分页断言写死"第 N 页"，而真实页数是变量（某次实测 7 页），造成假绿。
- `winText()` 读整窗做包含判断，把顶部分页网格里的标题也读进来，停在哪页都能过。
- 用夹具/`devOpen*`/直接改日期证明"自然入口"，越界取证还当主证据。
- 旧档测试默认开新档，没写 seed 用例就宣称"存档兼容"。
- 改了 `game.js` 忘了重建单文件，或忘了把新套件挂进 `run-ci.mjs`。
- 不读 `游戏总体规划.md` §27 另写一份剧情；同一事实用了两个奖励键导致重复发经验。
- 行号引用过期（M1 新增几千行后旧锚点全变），不 grep 直接按旧行号改。

## 八、工作区纪律

- `git status` 里可能有**上一轮未提交的切片**（例如 M1 第二/三幕）；不要顺手提交、回滚、格式化无关文件。
- CI 会改写 `output/playwright/` 已跟踪截图：提交前 `git checkout -- output/playwright/` 只保留新增证据图。
- 不推送，除非用户明确要求；`main` 领先 origin 时在报告里说明差几笔。
- 同一时间只允许一个写者改 `game.js`；浏览器验收一律串行；全量 CI 脱会话（计划任务 `MossFarmCI`）。

## 九、当前状态速判（不背数字，去读）

- 现在做什么：`docs/现状与待办.md` 的 `## 二、待办清单` 中第一个未勾选项。
- 做到哪：同文件顶部"一句话"与 §2 各表。
- 数量口径：`docs/feature-status.md`（生成器 `node tests/build-status-doc.mjs` 更新）。
- 最后交付：`README.md` 顶部横幅。
- 未做的：`docs/现状与待办.md` §5「明确没有的（不假装有）」+ P4 人工验收。
- 2026-10-22 快照（会过期，以文档为准）：序章至第三幕 19 任务/43 场；P0-3 王都/回声谷 11 处操作台未做；第四、五幕与终幕未实装；65/40 分钟与实体手机、5 位初见玩家未验收。

## 十、开工自检

- [ ] 我看过 `git status`/`git log`，知道工作区有谁的半成品
- [ ] `node tests/env-check.mjs` 通过：没有并行浏览器作业、心跳不是中断状态
- [ ] 需要跑 CI 时，我先看 `node tests/run-ci.mjs --status` 的 x/105 台账进度
- [ ] 我能说出这是哪个 P 项、验收口径在哪份文档
- [ ] 我没有在另一个完整 CI 正在跑时并行起浏览器作业
- [ ] 我加载了对应子系统技能，并用 grep 核实了代码位置
- [ ] 我写下了本次要新增/修改的套件与证据边界
- [ ] 我知道哪些改动不会碰（无关未提交文件、别人的切片）
