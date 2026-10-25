# 苔芽农场 · 项目开发契约（AGENTS.md）

> 本文件面向在这个仓库里工作的 AI 代理与工程师，是**项目级契约**，优先于个人习惯；与用户直接指令冲突时以用户指令为准。
> 配套：开发模式 `.dsh/agent-preset/`（DSH Agent preset「苔芽农场开发」）、项目技能 `.dsh/skills/`、说明 `docs/开发模式.md`。
> 版本 **v1.3（2026-10-25）**：阶段口径更新为 103（5 快速＋88 浏览器＋10 单文件）——M1 自然套件退出 CI（是 M2 的真子集），单文件层只复跑产物敏感的套件；完成度判据仍是「同一 treeHash 的可续跑台账」，全量 CI 脱出会话 job 树。v1.2/v1.1 的台账判据不变。

## 0. 一句话、里程碑词汇与交付状态

《苔芽农场》（仓库 `xinglg`）是原生 HTML/CSS/JS 的像素风单文件经营游戏：`game.js`（约 2.6 万行）＋ `styles.css` ＋ `index.html`，可玩产物是**入库的** `苔芽农场-单文件版.html`。开发方式是**里程碑切片 + 证据驱动**：先定验收口径，再落码、写专项验收、重建产物、跑两层 CI（台账判据）、同步文档、分笔提交。

| 词汇 | 含义 |
| --- | --- |
| R0—R5 | 基础版切片（入口/成长/刀剑/职业/季节长计划/制度发布），已收口 |
| M0—M4 | 第九版主线《长风有归处》：M0 序章+第一幕、M1 第二/三幕、M2 第四/五幕、M3 终幕+后日谈、M4 剧情版发布 |
| MS1 | 第九版第一部 17 个新地点（场景 125→142，地图 22 标记/23 传送节点） |
| P0—P4 | `docs/现状与待办.md` 的待办分组：P0 前置、P1 第二/三幕、P2 第四/五幕、P3 终幕/发布、P4 单列人工验收 |

**注册数（地图/场景/任务/传送节点）≠ 完成度**：`docs/feature-status.md` 的数字是运行时注册数，哪些能玩到看套件与交付记录。

**交付状态只准用这六种说法**（报告、提交信息、文档一律如此，不混用旧口径）：

| 状态 | 判据 |
| --- | --- |
| 未开工 | 只有待办条目，没有代码/文档改动 |
| 在做（未验证） | 有改动，但还拿不出证据（日志名、套件项数、台账进度） |
| 分层通过 x/103（原因：…，下一步：…） | `output/ci-journal.json` 里同 treeHash 已完成 x 个阶段且全绿；必须写清为什么没跑完（环境中断/时间不够）和下一步（哪段待 `--resume`） |
| 已验收 | 同 treeHash 103 阶段全绿＋末行「两层全部通过。」＋`output/ci-exit.log` 退出码 0；或切片声明的验收口径逐条有证据（切片级） |
| 提案 | 只活在规划稿/审阅稿，没有落码 |
| 未测 | 人工项（真机手感、陌生玩家理解度）没做；没做就写未做 |

**中断不是状态**：日志停住、心跳停、进程没了，只能写「分层通过 x/103（原因：…）」，既不能写「已通过」，也不能因此从头重跑。
**「已实装」只表示代码里有实现事实**（如注册表里真存在），不是交付状态；交付状态必须落到上面六态之一。

## 1. 开工 60 秒（任何任务都先做）

```powershell
git status --short          # 工作区可能已有上一轮/别人的未提交切片
git log --oneline -5        # 现在在哪个切片之后
node tests/env-check.mjs    # 环境预检：chromium 能否启动/EPERM、是否已有浏览器作业、心跳是否中断、output 可写、PS 编码、git dirty
node tests/run-ci.mjs --status   # 有长跑或中断过：看 x/103、当前步骤、ETA、失败、未跑
# 然后读：
#   docs/现状与待办.md            顶部一行式现状 + 第二节勾选状态（唯一"现在该做什么"）
#   docs/feature-status.md        运行时事实（生成物：地图/场景/传送节点/套件数量）
#   README.md                     顶部交付横幅（最后交付到哪）
#   对应 docs/*-plan.md 或 docs/主线剧情-*-审阅稿.md  该切片的验收口径
```

预检不合格先按提示修（EPERM 换文件策略、已有浏览器作业就等、日志乱码见 §10），不要带着环境问题开工。
先回答四个问题再动手：**这是哪个里程碑（P0—P4）？验收口径写在哪？工作区是否已做了一半？要加载哪些技能？**
不要顺手提交、回滚或格式化与本任务无关的改动。

## 2. 权威顺序（冲突时以此为准）

| 优先级 | 来源 | 性质 |
| --- | --- | --- |
| 1 | 代码、运行时注册表、验收套件断言 | 事实 |
| 2 | CI 台账（`output/ci-journal.json`，同 treeHash）＋各步日志（`output/*.log`）＋退出码（`output/ci-exit.log`） | 证据；中断的日志既不是通过也不是产品红 |
| 3 | `docs/现状与待办.md`、各 `docs/*-plan.md` 的"交付记录" | 已核对的现状/证据摘要 |
| 4 | `README.md` 顶部交付横幅 | 对外摘要 |
| 5 | `docs/feature-status.md` | 生成物，数量口径以它为准（勿手改人工节） |
| 6 | `游戏总体规划.md`、`docs/主线剧情-*-审阅稿.md` | **提案/设计**，没落码就不算实现 |
| 7 | `*-归档.md`、旧版本审阅稿 | 历史，不据此判断当前行为 |

一句话：**文档里写了 ≠ 已实装；CI 绿了 ≠ 玩家能自然走到；夹具过了 ≠ 不是假绿。**

## 3. 仓库结构

```
game.js                 全部游戏逻辑（原生 JS，无依赖、无模块）
styles.css              全部样式（HUD/窗口/触屏/响应式/沉浸式）
index.html              页面骨架与固定 DOM（canvas、HUD、触控按钮、#windowLayer）
苔芽农场-单文件版.html    入库的可玩产物（由 game.js+styles.css+index.html 内联生成）
tests/                  Playwright 验收台（开发期用，游戏本体不依赖）
  harness.mjs           测试 API：launch/boot/snap/walkTo/interactWith/clickWin/winTitle...
  run-ci.mjs            统一入口：快速层 + 浏览器层 + 单文件复跑；阶段写入 output/ci-journal.json
  env-check.mjs         开工环境预检（chromium/EPERM、串行、心跳、编码、git dirty）
  gate-detached.ps1     全量 CI 交给 Windows 计划任务 MossFarmCI（脱出会话 job 树）
  check-docs.mjs        交付前文档机检（数字/exit 证据/生成区/日期）
  build-single-file.mjs 重建单文件版（4 道硬校验）
  build-status-runtime.mjs 生成 docs/feature-status.md（会启动浏览器读运行时注册表）
output/                 日志、截图与 CI 台账（日志 gitignore，output/playwright/ 截图部分入库）
docs/                   现状、待办、各切片交付记录、计划、剧情稿
.dsh/skills/            项目技能（xinglu-*，随仓库走，改完即生效）
.dsh/agent-preset/      开发模式 bundle（改完需重装 preset 才生效，见 docs/开发模式.md）
AGENTS.md               本文件：项目契约（所有会话自动加载）
assets/ supabase/ site/ 美术、后端资料、构建产物（site/ 不入库）
```

## 4. 标准切片流程（固定动作，别省）

1. **读**：现状/待办 + 该切片文档 + 相关技能 + 用 grep 核实要动的代码（行号会漂移，先 grep 再改）；开工先跑 `node tests/env-check.mjs` 与 `node tests/run-ci.mjs --status`。
2. **定验收**：写清楚"哪条套件、多少项、源码轮与单文件轮、台账口径（全量 103 阶段还是切片级）、哪些是人工验收"。没有验收口径不开工。
3. **落码**：最小改动，优先复用既有机制（`MAPS`/`INTERACTABLES`/`QUESTS`/`state`/`normalize*`/`openWindow`），不新造框架。
4. **专项套件**：真实键鼠/触摸驱动，读式断言；夹具边界写在文件头；支持 `--single-file`；挂进 `tests/run-ci.mjs`（浏览器层必挂；单文件层只挂**产物敏感**的套件——剧情 UI、门洞与出口、旧档迁移、存档快照、跨境门槛、触屏布局、跨系统修复回归；纯逻辑与长程自然串联不进单文件层，它们在源码轮已覆盖，产物与源码的 JS 逐字相同）。同一段路的两条自然套件只留覆盖更全的那条进 CI。夹具/自然入口分层见 `xinglu-playtest-suite-authoring`。
5. **重建产物**：`node tests/build-single-file.mjs`，之后 `git status` 必须只剩预期改动（产物零漂移）。产物一冻结，运行期就不改源码/测试/产物——改了 treeHash 会变，旧台账作废。
6. **跑 CI（台账判据＋脱会话长跑＋续跑）**：先 `node tests/run-ci.mjs --quick`；再全量 `powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action start`，交给计划任务 `MossFarmCI`，会话只用 `node tests/run-ci.mjs --status` 观察。判据是 `output/ci-journal.json` 里**同一 treeHash** 的 103 条阶段全绿＋末行「两层全部通过。」＋`output/ci-exit.log` 退出码 0。中断时台账只记已完成步骤，用 `--resume` 续跑；**禁止用 `run_in_background` 的 pwsh job 承担全量 CI**（会随 harness 重启被杀）。止损规则见 §4.1。
7. **同步文档（中途可交付）**：任一验证单元（一条套件、双版本专项、文档核对）通过即可同步/提交，不等全量 CI；长跑期间要能说清「现在能交什么」。同步 `docs/现状与待办.md`、对应 `docs/*-plan.md`、`docs/feature-status.md`（用生成器）、`README.md` 顶部横幅；数字与证据一致，交付前 `node tests/check-docs.mjs --regen` 必须绿。
8. **分笔提交**：代码 / 测试 / 文档 / 产物分开；提交信息写根因与范围，不写"修复测试"。

判定"完成"的唯一标准：**验收口径逐条有证据**（命令、日志名、treeHash 或台账进度、套件项数、退出码），且证据边界写清哪层没做、为什么没做完。

### 4.1 长跑所有权与止损

- 全量 CI 必须脱出会话：`gate-detached.ps1 -Action start`（计划任务 `MossFarmCI`，按需任务，跑 `node tests/run-ci.mjs --resume`），`-Action install/status/stop/uninstall` 分别管注册、观察、停止（连心跳里的 pid 子树一起杀）、卸载。
- 进程死活看心跳 `output/ci-heartbeat.json`（pid/step/updatedAt）：`updatedAt` 长时间不动或进程没了就是中断。
- **连续 2 次非产品中断**（无末行、心跳停、进程没了）→ 必须改 OS 级执行方式（`gate-detached.ps1`）再 `--resume`；**连续 3 次** → 必须拆层出证据：写「分层通过 x/103」＋各步日志，不得再从头重跑。
- 产品/断言失败仍按原规则修（修代码或修断言，不靠改断言变绿）；修完 treeHash 变了，用新台账重新跑，不拿旧进度充数。

### 4.2 汇报节奏

长跑期间每 15–20 分钟或每个阶段簇用 `node tests/run-ci.mjs --status` 报一次可见进度：**x/103、ETA、风险、现在能交什么**。禁止连续多轮只回「等 10 分钟」。

## 5. 项目技能（`.dsh/skills/`，任务匹配就先加载）

| 技能 | 什么时候加载 |
| --- | --- |
| `xinglu-project-orientation` | 任何任务开始、接手、核对现状、不知道下一步 |
| `xinglu-code-navigation` | 找 game.js 里的代码/状态/扩展点，加系统前的导航 |
| `xinglu-ui-window-css` | 窗口/面板/分页/HUD/触屏/响应式/styles.css |
| `xinglu-economy-invariants` | 钱、体力、补助、贷款、扣押、日结算、资金守恒 |
| `xinglu-save-compat` | 新增/修改存档字段、旧档迁移、读档回归 |
| `xinglu-scene-interaction` | 地图/场景/门洞/交互点/面板窗口接线 |
| `xinglu-story-quest-authoring` | 主线稿、任务链、NPC 对白、人物表 |
| `xinglu-render-performance` | 主循环/相机/DPR/分块烘焙/粒子/卡顿抖动 |
| `xinglu-playtest-suite-authoring` | 写/改/修 `tests/run-*.mjs`，判断套件红是产品还是取证问题 |
| `xinglu-release-pipeline` | 打包、完整两层 CI、状态文档同步、提交收口 |

技能正文里给了各子系统的函数锚点与断言写法；**行号是快照，一律先 grep 再改**。

## 6. 硬约束（违反即返工）

1. **不升 `SCHEMA_VERSION`**（当前 2）。加字段靠"默认值 + `normalizeXxx` + `migrate*`"，不靠版本号；旧档只补默认值，不补玩家没做过的事实。
2. **资金守恒与幂等**：每条收入有对价、扣减；同日不重复领；跨日不二次发放；历史证据用快照（如 `debtAt`），当前值只用于展示。
3. **单文件产物入库且零漂移**：重建后 `git status` 干净；CI 复跑在冻结产物上进行；产物不能依赖外链（除 `www.w3.org`）。
4. **Playwright 串行**：不能并行起两个浏览器作业（会撞 `Page crashed` 假回归）。`--single-file` 必须支持并挂 CI。
5. **真实输入驱动**：验收主证据是键盘/鼠标/触摸，不是直接改 `state`；越界夹具（`devOpen*`、写任期/合同直接改日期）只能用于回归且文件头注明。
6. **入口不占工具目标格**：新交互点/门洞的 `stand` 必须真可通行，落脚点不压下一张图出口格、不压可耕作区/矿点/树石/既有交互点。
7. **面板文案是接口**：测试按按钮文案查找；改文案必须同步测试与所有引用。
8. **文档不撒谎**：没落码标「提案」，做到哪一步按 §0 六态写，人工没做标「未测」；`feature-status.md` 的人工节（`## 玩法验收边界（人工审阅）` 之后）与顶部状态行不得被生成器覆盖。
9. **不推送**，除非用户明确要求；`main` 领先 origin 时在报告里说明差几笔。

## 7. 证据边界（报告必须分三层写）

| 层 | 证明什么 | 典型证据 |
| --- | --- | --- |
| 逻辑与界面正确 | 规则、数值、面板文案、存档往返 | 专项夹具套件（源码 + 单文件） |
| 玩家能从入口走到 | 自然入口、无瞬移、门槛可解释 | 自然入口套件（如 `run-r5-natural-entry`、`run-r3-natural-entry`） |
| 真机手感与陌生玩家理解度 | 实体手机、初见玩家 | **人工验收，未经自动化替代**；未做就写未做 |

三层不能合并成一句"CI 全绿"。每条证据要能落到：**treeHash（或台账里 x/103 的进度）、日志名、退出码、套件项数**；只贴一串 PASS 行或「跑过了」的口头结论不算证据。

## 8. 测试与构建速查

```powershell
node --check game.js
node tests/build-single-file.mjs           # 重建入库产物
node tests/prepare-site.mjs                # 生成 site/（CI 用，不入库）
node tests/env-check.mjs                   # 开工/长跑前环境预检
node tests/check-docs.mjs --regen          # 交付前文档机检

node tests/run-ci.mjs --quick              # 快速层：5 步（语法/重建/站点/单文件冒烟）
node tests/run-ci.mjs --status             # 台账进度：x/103、当前步骤、ETA、失败、未跑
node tests/run-ci.mjs --resume             # 中断后续跑（同 treeHash；计划任务里跑的就是它）
node tests/run-ci.mjs --from=<step-id>     # 从某步重跑（step-id 用 --dump-steps 查）
node tests/run-ci.mjs --stop-after=10      # 只跑 10 个阶段就停（验证分批/续跑）
node tests/run-ci.mjs --dump-steps         # 打印全部 103 个阶段 id
node tests/run-ci.mjs --only=run-m1-tide-story   # 单条

powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action start    # 全量：计划任务 MossFarmCI，脱出会话 job 树
powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action status   # 台账＋心跳＋退出码汇总
powershell -NoProfile -ExecutionPolicy Bypass -File tests\gate-detached.ps1 -Action stop     # 停任务并杀心跳里的 pid 子树

cd tests
node run-m1-tide-story.mjs --single-file             # 单文件轮（cwd 在 tests）
```

- 通过判据 = **同 treeHash 的台账 103 阶段全绿**＋末行「两层全部通过。」＋`output/ci-exit.log` 退出码 0，三样必须同属一个 treeHash。PASS 行很多但没有汇总、日志被中断/还在增长、只跑了源码轮，都**不算通过**；中断的日志既不是通过也不是产品红。
- 口径：5 快速＋88 浏览器＋10 单文件＝103 个阶段（98 次浏览器作业）。套件数与分层以 `tests/run-ci.mjs` 当前内容为准，`--dump-steps` 是唯一权威；历史轮的「121 组」「125 阶段」是旧口径，不是现状。
- **日常迭代不等全量**：改一行代码先跑受影响的那几条（`--only=run-xxx`／`--from=`／`--stop-after=N`），几分钟出结论；全量只在切片收口跑一次，冻结产物后不再改源码/测试/产物。
- **长跑会耗尽机器资源**：2026-10-25 一轮 125 阶段跑到 2 小时 18 分时，单文件层连续 4 步被系统杀掉（无末行、日志空、退出码非 0），不是断言失败。判据仍是「分层通过 x/103」＋`--resume` 续跑，不要从头重跑；也因此把阶段口径收到 103。下一轮考虑浏览器层分片并行（独立 browser 实例＋独立日志目录）。
- 失败先判断：产品缺陷 / 断言写错 / 环境拒绝（Windows 沙箱下 Playwright 可能 `spawn EPERM`，不是回归）/ 被信号打断（无输出、无末行、心跳停）。
- 截图在 `output/playwright/`；CI 会改写已跟踪截图，提交前 `git checkout -- output/playwright/` 还原噪声。
- **PowerShell 5.1 读日志必须 `-Encoding utf8` 或用 `read` 工具**：默认编码会把 UTF-8 中文读成乱码（曾把 96 项误读成 36 项）。

## 9. 文档同步矩阵

**交付门槛**：`node tests/check-docs.mjs --regen` 必须绿（数字对台账/`--dump-steps` 计算值、「退出码 0」「两层全部通过」必须有 exit 证据、生成区手改、日期-提交一致）。它会启动 Chromium 读生成器，**必须串行、别和全量 CI 并行**。红了不许宣称已验收，也不能靠改文档描述绕过。

| 文件 | 何时更新 | 注意 |
| --- | --- | --- |
| `docs/feature-status.md` | 每次切片 | 由 `node tests/build-status-doc.mjs` 生成，别手改；人工节必须保留 |
| `docs/现状与待办.md` | 每次切片 | 顶部一行式现状、勾选状态、证据与剩余门槛 |
| `docs/<切片>-plan.md` / `docs/m1-*.md` / `docs/ms1-*.md` | 每次切片 | 范围、验收、实跑记录、明确未做的 |
| `README.md` | 对外可见的交付 | 顶部按日期倒序横幅；数字与 CI 日志一致 |
| `docs/下一步待办清单.md` | 阶段切换 | 打勾、证据、下一项 |
| `游戏总体规划.md` | 设计变更 | 唯一设计入口；实施状态按 §0 六态写并指到交付记录（规划稿里不写验收结论） |

## 10. 常见坑（已踩过）

- 分页结算真实页数是变量（条件页几十种组合），断言别写死"第 N 页"；从 `winTitle` 的 `n/N` 读。
- `winText()` 别读整窗：`.win-body` 含顶部分页网格，会假绿。
- 剧情正文只从 `游戏总体规划.md` §27 的分场稿取，**不另写一份剧情**；同一剧情事实共用完成键/奖励键，重复进出不能重复发经验。
- 跨场景下一场不替玩家瞬移；面板写清地点/入口，让玩家自己走。
- 注册数（地图/场景/任务）涨了不等于玩法完成；不要把"已注册"写成"已验收"。
- 旧档测试默认开新档，**旧档回归只有专门 seed 用例能抓**；用 `isolatedPage` 避免自动保存覆盖预置存档。
- 改 `game.js` 后忘了重建单文件 / 忘了挂 CI = 交付证据不成立。
- 改 `index.html` 结构前先读 `build-single-file.mjs` 的匹配规则（必须能匹配原 `<link>`/`<script>` 两行）。
- **中断的日志不是通过、也不是产品红**：无末行/心跳停/进程没了只能记「分层通过 x/103（原因：…）」并 `--resume`；真实踩过 120/123（旧口径）、0 失败却被写成「未通过」。
- **用会话 `run_in_background` 的 pwsh job 承担全量 CI**：会随 harness 重启整树被杀（真实踩过 3 次）；全量必须 `gate-detached.ps1`，死活看 `output/ci-heartbeat.json`。
- **PowerShell 5.1 直接读 UTF-8 日志**：会乱码、项数读错（96 读成 36）；必须 `-Encoding utf8` 或 `read` 工具。
- **「退出码 0」必须有 exit 证据**（`output/ci-exit.log` 里的 `exit=0`，旧证据是同名 `*-exit.log` 的 `CI_EXIT=0`）：日志里没有退出码行就不能写「退出码 0」，真实发生过把无退出码日志写成 0。
- PowerShell 写中文提交信息用 UTF-8 无 BOM 文件 + `git commit -F`；`Out-File -Encoding utf8` 会带 BOM。
- 行号引用会漂移（M1 新增几千行后旧锚点全变），一律 grep 当前符号。

## 11. 并行与代理协作

- **可以并行**：只读分析、文档核对、grep 检索、互不重叠文件的代码编写。
- **必须串行**：任何浏览器验收/CI/单文件重建（共享 `output/` 与浏览器资源）。
- 多人/多代理写同一仓库时按文件切分写作用域；`game.js` 是单文件热点，同一时间只允许一个写者。
- 长任务用后台 job，结束收 `job_output`，别忙等——**但全量 CI 例外，必须脱会话**（§4.1）；完成后统一跑一次完整 CI 作为交付证据。
- **只读审计员**：交付前可派 fresh context 的只读子代理审证据链（日志时间窗、treeHash/台账进度、退出码、几组文档是否互相矛盾），只读、不改文件、不跑浏览器，报告带 file:line；写者不兼任自己的审计员。2026-10-25 这次两个审计员抓出了「日志时间窗不符」与「三组文档矛盾」。

## 12. 维护本契约

- 技能在 `.dsh/skills/`，按 `skill` 工具加载；新增技能要有 kebab-case 名、`description` 含触发条件、正文 < 8KB（详情放 `references/`）。
- 开发模式在 `.dsh/agent-preset/`，安装/更新方法见 `docs/开发模式.md`；改完要重装 bundle，并对新会话验证。
- 本文件与技能里的数字/行号是快照，改动后用 grep 复核；状态数字以 `docs/现状与待办.md` 与 `docs/feature-status.md` 为准。
- **版本**：v1.3（2026-10-25）——阶段口径 103（5 快速＋88 浏览器＋10 单文件）：M1 自然套件退出 CI（它是 M2 自然套件的真子集，两条都挂等于同一段新档路线跑两遍）、单文件层只复跑产物敏感的十类套件；全量由约 138 分降到约 100 分。v1.2（2026-10-25）阶段口径随第四幕自然串联套件入列；v1.1（2026-10-25）判据改为同 treeHash 可续跑台账、全量 CI 脱会话（计划任务 `MossFarmCI`）、止损与汇报节奏、env-check 开工预检、check-docs 交付机检、套件分层、六态词；旧「只有末行+退出码两件」判据作废。v1.0（2026-10-22）为初版。
