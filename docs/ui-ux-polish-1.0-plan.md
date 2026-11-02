# UI/UX Polish 1.0 工程规划

日期：2026-11-02。归属：P3／M4 后续体验专项；实体手机与初见玩家归 P4。总体状态：在做（未验证）——阶段 1 第二批（逐窗巡检、专用组件迁移、禁用原因审计）已落码并取得双版本专项证据；完整两层 CI（126 阶段）待阶段 1 收口时冻结产物后同树跑完。上一树 c11afa2b0f22 的「分层通过 16/126」属于首批切片证据，本批改动后 treeHash 已变，不再充当本批证据。阶段 2—4 为提案。

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
- [x] 阶段 1 公共窗口外壳与 `.btn`（首批）。
- [x] 阶段 1 其余主要窗口逐窗巡检、专用组件迁移、禁用原因逐项检查（第二批，见下）。
- [ ] 阶段 2—4；实体手机、五位初见玩家：未测。

新增专项后 CI 为 126 阶段（5 快速＋100 浏览器＋21 单文件），与当前 `--dump-steps` 一致。`run-v3` 在本轮第一次复跑又于不同旧截图写盘 UNKNOWN 中断；测试改为每轮独立 `output/playwright/v3-<时间戳>/`，断言与游戏规则未修改。

## 阶段 1 第二批：逐窗巡检、专用组件迁移、禁用原因审计

范围：把「公共组件」从三个入口窗口扩到八个真实可达的主要窗口，并把专用控件与禁用状态收敛到统一口径。阶段 2 的 HUD 重排、地图浅色主题、剧情排版与触屏方向键不在本批。

### 逐窗巡检

八个主要窗口都能用真实键鼠/触摸直接打开：背包（B／`#touchBag`）、委托日志（J／`#touchQuest`）、暂停（Esc／`#btnMenu`）、角色（P／`#touchChar`）、农务与矿山记录（N／`#btnRecords`）、制作（C／`#touchCraft`）、全境地图（M／`#touchMap`）、森林书（F／暂停菜单内的「森林书（F）」）。五种视口：1280×860、1512×982、2560×1600、390×844、844×390；手机视口用实际触屏按钮进入，不靠缩浏览器宽度。

`tests/run-ui-polish.mjs` 由「三入口巡检」扩成「八窗口逐窗巡检」，每窗口每视口断言十二项：真实入口、窗口在屏内、正文无横向溢出、关闭目标 ≥44px、可访问标题、正文 ≥15px、设备模式、窗口挂点、无空按钮、按钮文字不竖排、禁用原因可见、关闭生效；另加地图深一层检查（点「旧矿山」后矿层传送按钮禁用时必须有可见原因）。源码与单文件两轮各 535 项通过。

### 专用组件迁移

`.item` 系列（背包、商店、制作、出货箱、储物箱等）改用公共 Token：底色 `--ui-raised`／悬停 `--ui-hover`，名称 14px、描述与数量 13px（辅助文字落在规范的 12—13px 区间）。`.typepick` 系列改用同一套 Token，选中态用旧金 `--ui-accent` 配深字，命中高度 30→34px。森林书导航保留「手账浅底深字」，但命中高度 31→36px 与公共按钮一致。

同时修掉一处既有缺陷：`.item` 是横向 flex，操作区与长描述抢同一行，窄格（制作、厨房等 210px 格）里按钮被压到最小内容宽度，中文按字竖排成「未 / 解 / 锁」。这是 HEAD 就存在的排版问题，不是本批改动引入的（把 `.item-desc` 退回 11px 仍复现）。修法是让操作区独占一行（`.item` 换行 + `.item-actions` 占满一行），按钮回到自然宽度，长文案仍在格内折行。专项新增「按钮文字不竖排」断言：窗口宽度够放下整句时按钮必须一行，修复前能抓到 8 个竖排按钮、修复后归零。

### 禁用原因审计

全库共 24 处窗口内 `disabled` 按钮，逐条判定：17 处已有可见原因（按钮文案自述，或旁边有 `.item-desc`／`.quest-next`／`.req-chip` 说明），7 处不合格——其中 5 处把原因只写在 `title` 里（手机上没有 hover），另 2 处完全没有说明。

修法与约定：新增公共组件 `.ui-reason`（虚线暖色块）与 `.ui-reason-item`（按钮与原因成组，原因排在下方），`disabledReason(text)` 统一生成。落地八处：全境地图的矿层按钮、城区街区、白蔷薇宫苑入口，矿山记录的「前往第 N 层」，鱼塘投放（池满），角色洗点（金币不足）。地图里另有一处重复入口「白蔷薇宫城 · 宫苑公共入口」同批收敛。既有 `.travel-blocked`、`.req-chip.no` 保持原样，不另造第二套视觉语言。

约定写进专项断言：禁用按钮必须在同一容器或上一层容器内找到可见原因节点（`.ui-reason`／`.travel-blocked`／`.req-chip`／`.quest-next`／`.item-desc`／`.char-talent-why`），或按钮文案本身自述原因；只有 `title` 不算。新档实测：委托日志 1 个、制作窗 8 个禁用按钮都有可见原因，地图矿层按钮经真实点击后拿到可见原因块。

### 窗口挂点

`openWindow` 给 `.win` 写 `data-window-id` 与 `data-kind`，专项按窗口 id 断言，样式也可以按 kind 收敛，不再靠一个个窗口名做例外。

### 本批未做

- 阶段 2 的 HUD 信息重排、地图/手账浅色主题统一、任务人物三层筛选：未开工。
- 阶段 3 的剧情排版、姓名对白规范、触屏安全区与方向键：未开工。
- 完整两层 CI（126 阶段）：待阶段 1 收口冻结产物后同树跑完；本批只有切片级证据，不宣称全量通过。
- 实体手机手感与五位初见玩家理解度：未测。


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
