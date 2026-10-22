---
name: xinglu-ui-window-css
description: 改苔芽农场的窗口/面板/分页/HUD/触屏/响应式布局与 styles.css 时使用。Use when building an openWindow panel, changing .win-body/win-title/按钮文案, adding HUD or overlay elements, fixing mobile/landscape/compact layout or text overflow, or taking UI screenshots for evidence.
---

# 苔芽农场 · 窗口、面板与样式

游戏画面是 canvas，但**所有可读 UI 都是 canvas 之外的 DOM 覆盖层**：`index.html` 提供固定骨架，`game.js` 用 `el()/$()` 生成内容，`styles.css` 负责布局与主题。
改 UI 前先记住：**状态放 `state`/`UI`，不放 DOM**；面板文案是测试接口。

## 一、DOM 骨架（index.html）

| 区域 | 元素 | 说明 |
| --- | --- | --- |
| 顶栏 | `#topbar` → `.brand` + `#hud`（`#hudDate/#hudTime/#hudWeather/#hudCoins/#hudEnergy`）+ `.topbar-actions`（`#btnCharacter/#btnRecords/#btnMenu`） | `refreshHud()`（game.js:11674）由事件触发，不在主循环里刷 |
| 农场助手 | `#farmAssist` → `#dailyTasks` / `#todayPlan` / `#tutorialCard` | 今日安排最多 3 行 |
| 舞台 | `#stage` → `#viewport` → `canvas#world` + `#questStrip/#tileTip/#sceneTag/#floorTag/#fade` | 画布尺寸由 `resizeCanvas()`（20124）算，别用 CSS 定 |
| 底部 | `#dock` → `#hotbar` + `#toast` | `#toast` 由 `toast(msg)`（11068）驱动 |
| 触屏 | `#touch` → `.dpad` + `.tact`（`#touchUse/#touchAct/#touchBag/#touchCraft/#touchQuest/#touchMap/#touchChar`） | 手机/平板专用，`pointer:coarse` 也参与样式 |
| 窗口层 | `#windowLayer`（`hidden`） | 所有 `openWindow` 面板的唯一容器 |
| 开始层 | `#boot` → `#bootActions` + `#devicePicker` + `#bootNote` | 设备选择与读档入口 |
| 装饰层 | `#frame` | 纯装饰，`aria-hidden` |

## 二、窗口系统（game.js 当前锚点，先 grep 再用）

```js
openWindow({ id, kind, title, build(bodyEl){…}, actions:[…], narrow, wide })
```

| 函数 | 行（2026-10-22 快照） | 行为 |
| --- | --- | --- |
| `$` / `el` | 3579 / 3580 | `document.querySelector`；`el(tag, cls, text)` 建元素 |
| `openWindow` | 11773 | 清空并重建 `#windowLayer`，生成 `.win > .win-head(.win-title+.win-close) + .win-body + .win-foot` |
| `renderWindow` | 11795 | 清空 body/foot 后调 `build`；`title`/`actions` 可以是函数；`actions[].close !== false` 时点击后自动关窗 |
| `refreshWindow` | 11811 | 有窗口时整窗重渲染（用于按钮操作后刷新） |
| `closeWindow` | 11812 | 清空层、`hidden=true`、恢复焦点、`refreshHud()` |
| `mkBtn` | 11823 | `mkBtn(label, kind, fn)`，`kind` 用 `sm/primary/ghost` |
| `itemTile` | 11829 | 物品格（图标+名称+数量+描述），按钮或静态 |

纪律：

- **不要缓存 DOM 节点当状态**：`renderWindow` 每次清空重建，状态一律放 `state` 或 `UI`，重建时从状态渲染。
- 面板 `title` 支持函数，分页标题约定 `第 3 / 7 页 · 土壤肥力`；测试从 `n/N` 读真实页数，别写死页数。
- `actions` 里加 `{ spacer: true }` 可撑开间距；需要"点完不关窗"就 `close: false` 并在 `onClick` 里 `refreshWindow()`。
- 动作按钮文字**就是测试选择器**（测试按 `.win button` 的 `hasText` 点）；改文案必须同步 `tests/` 所有引用。
- 长内容用既有类：`.section-title`、`.panel-box`、`.grid.two`、`.muted`、`.empty-note`；别新造一套视觉语言。

## 三、样式结构（styles.css，1138 行）

- `:root`（第 6 行）是色板/尺寸/圆角/动效的变量源；新样式优先用变量，别散落硬编码颜色。
- 文件按区块用 `/* ---- 名称 ---- */` 注释组织：顶部栏 69 / 舞台 139 / 快捷栏与提示 283 / 触屏 346 / 窗口 407 / 通用 UI 元件 513 / 角色窗口 536 / 对话 678 / 任务 693 / 商店制作 706 / 结算 714 / 帮助设置 727 / 钓鱼 746 / 引导遮罩 765 / 响应式 788 / 沉浸式 850 / 自适应舞台 880 / 设备选择 963 / 主线场次演出 1132。新样式放进对应区块，别堆文件末尾。
- 断点与状态：`@media(max-width:520px|600px)`、`@media(max-height:560px) and (orientation:landscape)`、`@media(min-width:1700px)`、`@media(pointer:coarse)`；另有 `html.immersive` / `html.compact-play` / `html.rotated-play` / `html[data-device]` 状态类与 `prefers-reduced-motion`。
- JS 写入的 CSS 变量：`--play-w`/`--play-h`（`updatePlayLayout` 20047）、`--assist-top`/`--dock-h`（`resizeCanvas` 20136-20137）、`--zoom`（20176）。改布局前先确认这些变量由谁维护。

## 四、逻辑布局与设备（game.js:20040 起）

- `deviceMode`（`computer/phone/tablet`）+ `rotatedPlay()`：触屏设备竖持时页面自己转成横向布局（`rotated-play`），**不依赖系统旋转**。
- `resizeCanvas()`：`immersive = 横屏 && (触屏 || 超宽大屏)`；`dpr = clamp(devicePixelRatio,1,3)`；只有物理尺寸变化才重设 `canvas.width/height`（会重置 context），并重设 `imageSmoothingEnabled=false`。
- `--zoom` 给绘制倍率，DOM 侧不要拿它当字号/间距依据。
- 窗体内滚动：横屏矮屏时 `.win` 有 `max-height: calc(var(--play-h) - 16px)`，`.win-body` 负责滚动；新增面板要验证 844×390 下按钮仍可点。

## 五、加/改一个面板的配方

1. 数据与状态：新字段进 `state`（见 `xinglu-save-compat`），不要只存在闭包里。
2. 入口：`activateInteractable` 里加 `kind` 分支，或 HUD/按钮 `onclick`（见 `xinglu-scene-interaction`）。
3. `openWindow`：`build` 里只用 `el`/`mkBtn`/`itemTile` 与既有类；分页用标题 `n/N`。
4. 动作：按钮文案、`close` 语义、点击后 `refreshWindow()` 还是关窗。
5. 样式：只补必要规则，复用变量与现有类；手机端验证 390×844 与 844×390。
6. 验收：写/改一条真实点击套件（见 `xinglu-playtest-suite-authoring`），加 `--single-file`，挂 `run-ci.mjs`。
7. 截图：`output/playwright/` 留证据图（按 `fileURLToPath(import.meta.url)` 定位，别用相对路径）。

## 六、常见坑

- 把状态存在 DOM（`dataset`/闭包变量）→ `renderWindow` 重建后丢失；表现为"点一下按钮后我刚才的选择没了"。
- 改按钮/标题文案没改测试 → 套件红，且容易被误判为产品缺陷。
- 分页断言写死页数 → 条件页多少决定真实页数，必须读 `n/N`。
- `winText()`/`innerText` 读整窗做包含判断 → 顶部分页网格也命中，恒真假绿。
- 每帧刷 HUD、在 `frame()` 里写 DOM/`localStorage` → 卡顿与抖动；HUD 走 `refreshHud()`，存档走 `markDirty()`。
- 只测桌面 1280×860，漏 `compact-play`（矮横屏）与 `rotated-play`（竖持触屏）。
- 窗口没设 `max-height`/溢出滚动，手机上按钮被挤出屏幕。
- 长英文/数字不换行把中文名挤成竖排（历史 bug：作物名+应季标签同行）。

## 七、验证矩阵

| 改了什么 | 至少跑 |
| --- | --- |
| 任意窗口/面板 | `run-guide`、`run-v3`、`run-edge`（含窗口交互） |
| 布局/响应式/触屏 | `run-ui`、`run-responsive-layout`、`run-r5-mobile-touch`、`run-palace-mobile`、`run-exploration-mobile` |
| 宫城/室内界面 | `run-palace-floors`、`run-palace-wayfinding`、`run-indoor-doors` |
| 结算/任务面板 | `run-phase-cde`、`run-m1-*`、`run-fixes` |

- 改 CSS/HTML 后必须重建单文件版并跑 `--single-file` 轮（内联后选择器/优先级可能变化）。
- 视觉取证：`output/playwright/` 截图；失败才写 `guide-failed.png`。
- 完整回归仍以 `node tests/run-ci.mjs` 末行「两层全部通过。」+ 退出码 0 为准。

## 八、自查

- [ ] 面板状态放 `state`/`UI`，关闭再开、读档后一致
- [ ] 标题分页从 `n/N` 读取，无写死页数
- [ ] 按钮文案改动已同步测试；无 `winText()` 整窗断言
- [ ] 390×844、844×390、桌面三种视口都看过，按钮可点、可滚动
- [ ] 只用既有类与 CSS 变量，样式放对区块
- [ ] 套件支持 `--single-file` 并挂进 `run-ci.mjs`
