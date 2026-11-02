# UI/UX Polish 1.0 工程规划

日期：2026-11-02。归属：P3／M4 后续体验专项；实体手机与初见玩家归 P4。总体状态：分层通过 16/126（原因：本轮按公共窗口基础切片范围运行相关专项；下一步：继续阶段 1 逐窗审计，阶段收口冻结产物后同树 --resume 其余阶段）。本轮先交阶段 0 规划与阶段 1 公共窗口基础切片，阶段 2—4 为提案。

## 目标与冻结范围

温暖乡野奇幻、复古像素 RPG、旅行手账。以现有世界为主，建立共同组件规范，然后减少 HUD 信息竞争，改善导航与叙事阅读。

保留世界观、美术资产、玩法、剧情正文、任务条件、奖励与存档体系；SCHEMA_VERSION 保持 2。不新增大型玩法，不引入云存档，不为视觉修改交易或迁移逻辑。快捷栏实际为十格，保留十格及其快捷键，不照示意图删成九格。

## 阶段与任务

| 阶段 | 任务与实施顺序 | 验收与交付 |
| --- | --- | --- |
| 0 设计基线 | 审计公共窗口、专用控件及设备布局；保存五种视口基线；建立 Token 与改造清单 | 设计规范 v1.0、代码锚点、基线截图；逐窗视觉巡检另行记录，不以静态检索代替 |
| 1 公共组件 | 先 Token，再窗口标题/正文/关闭入口，再按钮语义与状态，再逐窗消除例外 | 真实输入打开背包、任务与菜单；五视口检查边界、滚动、焦点、关闭；源码/单文件专项；相关既有 UI 回归 |
| 2 主界面与地图 | 合并日期时间天气；状态简化；单条当前目标、按需教程；十格快捷栏；地图/任务/人物三层筛选 | 不丢入口；当前地点、已探索/可前往/未探索可区分；地区与最近访问；主线/支线/日常/完成筛选；人物仅展示已知信息，日程与服务来源可核对 |
| 3 剧情与移动端 | 姓名、对白、旁白、选择卡与回看共用规范；统一完成与关系反馈；触屏布局与安全区 | 正文不低于 15px；说明已知选择影响而不新增剧情；重要触控目标至少 44×44 CSS px；长文字换行；滚动、旋转、长按与连续移动 |
| 4 整体验收 | 冻结产物、完整 CI、实体手机与至少五位初见玩家反馈、修复高频问题 | 同 treeHash 全量台账、末行与退出证据；真人报告；更新规范与交付文档。自动化不能代替人工 |

实施依赖：0 → 1 → 2 → 3 → 4。不并行改造四个模块。原人物生活、果园与成长提案保留，执行优先级让位于本专项。

## 本轮切片验收口径

阶段 1 首批只覆盖公共窗口外壳与 `.btn`：语义色、字号、间距、焦点、长文字、关闭目标及正文滚动。专用地图标记、人物对白排版、HUD 和触屏方向键留到对应阶段。禁用原因依赖具体业务：先审计，不能用统一的“不可用”冒充原因。

新增 `run-ui-polish.mjs`，支持 `--single-file` 并进入两层 CI。五种视口：1280×860、1512×982、2560×1600、390×844、844×390；由真实键鼠/触摸打开窗口，只读检查布局与状态；截图使用独立目录。精确项数以运行汇总为准。回归至少覆盖 guide、v3、edge、ui、responsive-layout、r5-mobile-touch、palace-mobile、exploration-mobile。先按切片证据交付；完整发布须另取全量及人工证据。

三层边界：公共 UI 专项证明窗口可用；新档菜单入口不代表全部地图/主线自然可达；实体手机与五位初见玩家均未测。

## 提交顺序

1. 工程规划与设计规范。
2. 公共样式与窗口可访问性实现。
3. 专项测试与 CI 接线。
4. 重建的单文件产物。
5. 实跑记录与状态文档。

只提交本轮文件或本轮文档片段，保留开工已有改动；不推送。

## 开工证据与风险

开工环境预检通过；无在跑浏览器。原树 `e166ff0625f3` 台账 123/124 绿，`browser/run-v3` 失败。日志 `output/ci-step-logs/0047-browser-run-v3.log` 是写入 `v3-a6-rain.png` 时的文件系统 UNKNOWN 错误，未见产品断言失败；先针对该阶段复核。该旧树证据不能充当新 UI 树的验收。

工作区已有 README、现状、总规、单文件、截图与三份未跟踪文档，均须保留。当前 main 与本地 origin/main 同步（开工 0/0，未联网刷新）。

## 阶段 0／1 本轮记录

- [x] 工程规划、设计 Token 规范与按阶段改造清单。
- [x] 改动前五视口三入口基线：`output/playwright/ui-polish/before/`（15 张）；新 UI 对照：`after/` 与 `single/`（各 15 张）。已看图核对 1280 背包、1512 委托日志、2560 暂停菜单、390 旋转委托日志和 844 背包；其余图仅自动取证，不等于逐窗视觉审阅。
- [x] 公共窗口语义色、正文基础字号、标题关联、44px 关闭入口、手机窗口按钮最小触控尺寸、可见焦点与长文字折行。
- [x] 公共 UI 专项源码与单文件各 140 项通过，树 `c11afa2b0f22`；日志 `output/ci-run-c11afa2b-20261102-211438.log`，台账 `browser/run-ui-polish` 与 `single/run-ui-polish` 各 exit=0。过滤运行整体不构成全量收口。
- [x] 快速层五步通过：`output/ci-run-c11afa2b-20261102-211406.log`。
- [x] 既有 UI 与移动端专项回归全部通过，明细见下表。
- [ ] 阶段 1 其余主要窗口逐窗巡检、专用组件迁移、禁用原因逐项检查。
- [ ] 阶段 2—4；实体手机、五位初见玩家：未测。

新增专项后 CI 为 126 阶段（5 快速＋100 浏览器＋21 单文件），与当前 `--dump-steps` 一致。`run-v3` 在本轮第一次复跑又于不同旧截图写盘 UNKNOWN 中断；测试改为每轮独立 `output/playwright/v3-<时间戳>/`，断言与游戏规则未修改。

## 冻结树验证记录

树 `c11afa2b0f226c29006dbe02a407eaef9764f6e2082c286cbb2ead5acc6440e2`，16 个已跑阶段全部 pass，0 失败；其余 110 个阶段未跑。公共窗口基础切片已验收（仅本节与本轮口径）；阶段 1 整体及 UI/UX Polish 1.0 整体尚未收口。

| 阶段 | 项数 | 阶段 exit | 独立归档日志 |
| --- | ---: | ---: | --- |
| `fast/syntax-game` | 见日志（未统一计数） | 0 | `output/ui-polish-c11afa2b/0001-fast-syntax-game.log` |
| `fast/syntax-tests` | 192 | 0 | `output/ui-polish-c11afa2b/0002-fast-syntax-tests.log` |
| `fast/build-single-file` | 见日志（未统一计数） | 0 | `output/ui-polish-c11afa2b/0003-fast-build-single-file.log` |
| `fast/build-site` | 见日志（未统一计数） | 0 | `output/ui-polish-c11afa2b/0004-fast-build-site.log` |
| `fast/smoke-single-file` | 6 | 0 | `output/ui-polish-c11afa2b/0005-fast-smoke-single-file.log` |
| `browser/run-ui-polish` | 140 | 0 | `output/ui-polish-c11afa2b/0002-browser-run-ui-polish.log` |
| `single/run-ui-polish` | 140 | 0 | `output/ui-polish-c11afa2b/0002-single-run-ui-polish.log` |
| `browser/run-v3` | 112 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-v3.log` |
| `browser/run-guide` | 69 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-guide.log` |
| `browser/run-edge` | 138 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-edge.log` |
| `browser/run-ui` | 96 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-ui.log` |
| `browser/run-responsive-layout` | 见日志（未统一计数） | 0 | `output/ui-polish-c11afa2b/0001-browser-run-responsive-layout.log` |
| `browser/run-r5-mobile-touch` | 60 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-r5-mobile-touch.log` |
| `single/run-r5-mobile-touch` | 60 | 0 | `output/ui-polish-c11afa2b/0002-single-run-r5-mobile-touch.log` |
| `browser/run-palace-mobile` | 见日志（未统一计数） | 0 | `output/ui-polish-c11afa2b/0001-browser-run-palace-mobile.log` |
| `browser/run-exploration-mobile` | 1 | 0 | `output/ui-polish-c11afa2b/0001-browser-run-exploration-mobile.log` |

台账副本 `output/ui-polish-c11afa2b/journal.json`；最后过滤运行退出记录 `output/ui-polish-c11afa2b/last-filtered-exit.log`（complete=false，不能作为全量发布证据）。响应式覆盖源码/单文件各九种尺寸、教程显示与隐藏、旋转；宫城移动端日志汇总 32 项。

逻辑与界面：上述专项；自然入口：本轮新档真实打开三种公共窗口，既有触屏路线保留其原夹具边界，不冒充全主线自然串联；实体手机与五位初见玩家：未测。
