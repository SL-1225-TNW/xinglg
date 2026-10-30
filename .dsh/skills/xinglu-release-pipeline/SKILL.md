---
name: xinglu-release-pipeline
description: 苔芽农场的打包与发布收口——重建单文件版、跑完整两层 CI、同步状态文档、分笔提交。Use when shipping a slice (R0–R5 之类), when 苔芽农场-单文件版.html must match game.js, when tests/run-ci.mjs must be run for delivery evidence, or when README / docs/feature-status.md / docs/*-plan.md need to reflect reality.
---

# 苔芽农场 · 打包与发布收口

仓库根 `C:\Users\22079\Documents\ChatGPT\星露谷`。可玩产物是**入库的** `苔芽农场-单文件版.html`（2026-10-22 约 1.65 MB / 2.75 万行），
它由 `game.js + styles.css + index.html` 内联生成；`site/` 是临时站点产物（`.gitignore` 忽略）。

## 构建

```powershell
node tests\build-single-file.mjs      # 生成 苔芽农场-单文件版.html
node tests\prepare-site.mjs           # 生成 site/（CI 用，不入库）
```

`build-single-file.mjs` 有四道硬校验，改 `index.html` 结构前先读它：

- JS 里出现 `</script`、CSS 里出现 `</style` → 直接失败（内联会提前结束标签）。
- 必须能匹配到 `<link rel="stylesheet" href="styles.css">` 与 `<script src="game.js"></script>` 两行原文。
- 生成后仍含 `styles.css` / `src="game.js"` → 失败。
- 打印外链检查（除 `www.w3.org` 外不允许 http(s)）——单文件版必须能断网双击打开。

**零漂移规则**：产物入库，所以重建后 `git status` 必须干净。不干净就说明产物与源码不同步，先解决再谈验收。
产物一冻结，运行期就不改源码/测试/产物——改了 treeHash 就变，旧台账作废。

## 完整两层 CI：判据是台账，不是一次进程

2026-10-25 起完成度记在 `output/ci-journal.json`：**同一 treeHash** 的 121 条阶段（5 快速＋97 浏览器＋19 单文件）全绿，
再叠加末行「两层全部通过。」与 `output/ci-exit.log` 的退出码 0。允许跨多次进程；中断时台账只记已完成步骤。

### 0. 预检（开工第一条）

```powershell
node tests/env-check.mjs
```

chromium 能否启动（`spawn EPERM` 是沙箱拒绝，不是回归）、是否已有浏览器作业（串行）、心跳是否中断、output 可写、
PowerShell 编码、git dirty。不合格先按提示修。

### 1. 快速层

```powershell
node tests/run-ci.mjs --quick
```

快速层 5 步：`node --check game.js`、全部 `tests/*.mjs` 语法（含临时探针，交付前清掉 `tmp-*.mjs`）、单文件重建、站点产物、
单文件冒烟（6 项）。合计 5 个快速阶段＋97 条浏览器层＋19 条单文件复跑＝121 个阶段（116 次浏览器作业）。
单文件层只留产物敏感的十一类（剧情 UI、门洞与出口、旧档迁移、存档快照、跨境门槛、触屏布局、跨系统修复回归）；
长程自然串联只在浏览器层跑一条（`run-m2-natural-story`），`run-m1-natural-story` 是它的真子集、已退出 CI。
2026-10-25 实测：125 阶段那轮跑到 2 小时 18 分时单文件层连续 4 步被系统杀掉（资源耗尽，非断言失败），
此前收至 105 阶段的一轮约 100 分钟；再压只能靠浏览器层分片并行。

### 2. 全量：交给计划任务，会话只观察

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action start     # 触发计划任务 MossFarmCI（跑 node tests\run-ci.mjs --resume）
node tests/run-ci.mjs --status                            # x/117、当前步骤、ETA、失败、未跑
powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action status   # 台账＋心跳＋退出码汇总
```

- **禁止用会话 `run_in_background` 的 pwsh job 承担全量 CI**：会随 harness 重启整树被杀（真实踩过 3 次）。
- 浏览器层**必须串行**；并行起第二个浏览器作业会撞出 `Page crashed` / `Target crashed` 的假回归（已经踩过）。
- 进程死活看 `output/ci-heartbeat.json`（pid/step/updatedAt）；心跳停=中断。
- `-Action install` 首次注册计划任务（`-DryRun` 可只预览），`-Action uninstall` 卸载，`-Action stop` 停任务并杀心跳里的 pid 子树。
- 脚本是 `.ps1`，命令必须带 `-NoProfile -ExecutionPolicy Bypass -File`（裸 `powershell -File` 会被执行策略拒绝）。
- 日志写 `output/*.log`（已 gitignore），发布证据记台账进度、treeHash、日志名与退出码。

### 3. 中断、续跑与止损

- 中断（无末行、心跳停、进程没了）既不是通过也不是产品红：台账只记已完成步骤，写「分层通过 x/117（原因：…，下一步：…）」。
- 源码/测试/产物没变就直接 `--resume`（再 `-Action start` 或手动跑）；变了 treeHash 就变，旧台账作废、重新记账。
- `--from=<step-id>` 从某步重跑、`--stop-after=N` 只跑 N 个阶段（验证续跑/分批）、`--dump-steps` 查 step-id。
- **连续 2 次非产品中断** → 必须改 OS 级执行方式（`gate-detached.ps1`）再 `--resume`；**连续 3 次** → 拆层出证据（写「分层通过 x/117」＋各步日志），不得再从头重跑。
- 产品/断言失败仍按原规则修，不靠改断言变绿。

### 4. 长跑期间

每 15–20 分钟或每个阶段簇报一次 x/117、ETA、风险、现在能交什么；任一验证单元通过就先同步/提交，不等全量。

## 文档同步（发布证据的一部分）

| 文件 | 谁维护 | 注意 |
| --- | --- | --- |
| `docs/feature-status.md` | 生成器 `node tests/build-status-doc.mjs`（实际逻辑在 `tests/build-status-runtime.mjs`） | 会启动浏览器读运行时注册表（2026-10-22：地图标记 22 / 已注册场景 142 / 传送节点 23；**注册数≠完成度**）。**必须先确认它保留人工节**：`TAIL_MARK = '## 玩法验收边界（人工审阅）'` 之后的内容与顶部状态行都不能被覆盖 |
| 文档机检 | `node tests/check-docs.mjs --regen` | 数字对台账/`--dump-steps` 计算值、「退出码 0」「两层全部通过」必须有 exit 证据、生成区手改、日期-提交一致；`--regen` 会启 Chromium，别和全量 CI 并行；红了不许宣称已验收 |
| `README.md` | 人工 | 顶部按日期倒序的交付横幅、测试清单里的条数 |
| `docs/下一步待办清单.md` | 人工 | 已完成项打勾、写明证据与下一项 |
| `docs/*-plan.md` | 人工 | 切片表状态、完成门槛、实跑记录 |
| 发布总结 | 人工 | 切片状态、缺陷根因表、CI 数字、证据边界三层、下一项 |

证据边界写成三层，别合并：**逻辑与界面正确**（夹具专项）／**玩家能从入口走到**（自然入口套件）／
**真机手感与陌生玩家理解度**（人工验收，单列，不因 CI 绿而宣称通过）。

## 提交

1. 分笔：别人的规划/剧情文档、纯文档生成、代码切片分开提交。
2. 提交信息写根因（「分页断言写死四页，实为 7 页」），不写「修复测试」。
3. 多行中文用文件传：`[IO.File]::WriteAllText($path,$text,(New-Object System.Text.UTF8Encoding($false)))` + `git commit -F`；
   `Out-File -Encoding utf8` 会带 BOM，标题会变成 `﻿docs:`。
4. CI 重跑会改动已跟踪截图：提交前 `git checkout -- output/playwright/` 还原，只收录新增证据图。
5. 不推送，除非用户明确要求；`main` 领先 origin 时在报告里说明差几个提交。

## 发布前的自检清单

- [ ] `git status` 干净（含产物零漂移）
- [ ] `node tests/env-check.mjs` 通过：无 EPERM、无并行浏览器作业、心跳不是中断状态
- [ ] `node --check game.js` 通过
- [ ] 快速层通过；单文件冒烟 6 项通过
- [ ] `node tests/run-ci.mjs --status` 显示同 treeHash 117/117 全绿，末行「两层全部通过。」，`output/ci-exit.log` 退出码 0
- [ ] 全量是在**冻结产物**上跑的（运行期没改源码/测试/产物，treeHash 未变）
- [ ] 本次新增/修改的套件都挂了 `--single-file` 复跑
- [ ] `node tests/check-docs.mjs --regen` 绿；状态文档由生成器更新且人工节完好；README/待办/plan 与数字一致
- [ ] 报告能回答：绿了什么（treeHash/台账进度/日志/退出码）、修了什么真缺陷（根因）、哪些失败被证伪、还差什么人工验收
