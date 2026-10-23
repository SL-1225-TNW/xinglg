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

## 完整两层 CI

```powershell
cd tests
node run-ci.mjs                        # 全量（约 45–60 分钟）
node run-ci.mjs --quick                # 只跑快速层
node run-ci.mjs --only=run-r5-credit   # 单条
```

- 快速层 5 步：`node --check game.js`、全部 `tests/*.mjs` 语法（含临时探针）、单文件重建、站点产物、单文件冒烟（6 项）。
- 浏览器层 **87 条**（`BROWSER` 字符串数组，逐条 `spawnSync`），**必须串行**；并行起第二个浏览器作业会撞出
  `Page crashed` / `Target crashed` 的假回归（已经踩过）。
- 末尾 **29 条**单文件复跑（`--single-file`）：R3/R4/R5 关键件、M0/M1 剧情、自然入口、触屏、修复回归等。
- 合计 **5 个快速阶段 + 87 + 29 = 121 次脚本阶段**（116 次浏览器作业）。
- 日志写 `output/*.log`（已 gitignore），发布证据只记**摘要 + 日志名**。
- 结束要同时看两件事：末行「两层全部通过。」与退出码 0。**日志中断、还在增长、或只有 PASS 行没有汇总，都不算通过。**

## 文档同步（发布证据的一部分）

| 文件 | 谁维护 | 注意 |
| --- | --- | --- |
| `docs/feature-status.md` | 生成器 `node tests/build-status-doc.mjs`（实际逻辑在 `tests/build-status-runtime.mjs`） | 会启动浏览器读运行时注册表（2026-10-22：地图标记 22 / 已注册场景 142 / 传送节点 23；**注册数≠完成度**）。**必须先确认它保留人工节**：`TAIL_MARK = '## 玩法验收边界（人工审阅）'` 之后的内容与顶部状态行都不能被覆盖 |
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
- [ ] `node --check game.js` 通过
- [ ] 快速层通过；单文件冒烟 6 项通过
- [ ] 浏览器层全量通过，且是在**冻结产物**上跑的（运行期没改源码）
- [ ] 本次新增/修改的套件都挂了 `--single-file` 复跑
- [ ] 状态文档由生成器更新且人工节完好；README/待办/plan 与数字一致
- [ ] 报告能回答：绿了什么（层/条/退出码/日志）、修了什么真缺陷（根因）、哪些失败被证伪、还差什么人工验收
