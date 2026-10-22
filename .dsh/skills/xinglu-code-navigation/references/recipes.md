# 扩展配方（改 game.js 前先读）

> 行号只作索引；先 grep 当前符号。所有配方最后都要：`node --check game.js` → 重建单文件 → 对应套件源码轮 + `--single-file` 轮 → 挂 `tests/run-ci.mjs`（见对应技能）。

## 1. 加物品 / 作物 / 配方

1. `ITEMS`（100）加一项：`{ id, name, kind, sell/food/device, desc }`；`id` 用英文小写，`kind` 要与既有分类一致（工具/种子/食材/材料/设备）。
2. 作物用 `CROPS`（487）：`growDays/regrow/yield/price`；种子物品的 `kind` 与 `CROPS` 对应。
3. 配方/加工用 `RECIPES`（642）或对应设备逻辑（磨坊/果酱/厨房），不要另写一套产出循环。
4. 给来源：种子铺/出货箱/任务奖励/探索节点，各走既有入口；价格写进 `ITEMS.sell`。
5. 验收：`run-guide`/`run-industry` 或新增一条"种下→浇水→收获→卖"真实输入套件；金额用差值断言。

## 2. 加主线任务与场次（M0/M1 模型）

1. **正文只从 `游戏总体规划.md` §27 的分场稿取，不另写一份剧情。**
2. `STORY_TASKS`（686）加任务：`{ id:'MQ1-X01', act, actName, title, goal, scenes:['S0xx','S0xx'], altScenes?, next, exp }`；`next` 形成链、无环。
3. `STORY_EVIDENCE`（717）加证据：`{ key: { title, source } }`；来源写场次与地点。
4. `STORY_SCENES`（738）加场次：`{ task, place, time, where, lines:[…], memory?, evidence? }`；
   - 台词行：`{ who, text }`、旁白 `{ text }`；
   - 条件行：`{ …, when: function(c){…} }`；
   - 选择：`{ choice:'key', prompt, options:[{id:'A',text},{id:'B',text}] }`，选择状态在 `storyState().choices`；
   - 互动步骤：`{ step, text, mode:'items'|'overlay'|'reception', … }`（参考 S000A 的 `picks/order`）。
5. 入口：`INTERACTABLES[场景]` 加交互点（`kind` 新分支）→ `activateInteractable` 调 `openStoryScene('S0xx')`；`stand` 必须真可通行、不占工具目标格、不压下一图出口格。
6. 存档：`state.story` 已由 `newStoryState()`/`normalizeStory`(2085) 管理；新字段要加默认值 + 归一化，旧档不补造没看过的场次/证据。
7. 跨日/读档：场次进度 `storySceneProgress` 会持久化；`storySceneFinished` 对 `MQ1-B/C` 用 `seen` 判定，**没演完不能标 seen**。
8. 验收：新增/扩展 `tests/run-m1-*.mjs`：真实走到入口按 E → 逐行推进/选择/步骤 → 断言面板文案与 `state.story` 事实；旧档补送路径单独一条；`--single-file`。
9. 文档：`docs/现状与待办.md`、`docs/m1-*.md`、`README.md` 顶部、`docs/feature-status.md`（生成器）。

## 3. 加/改交互点与场景

1. 交互点：`INTERACTABLES[scene]` 加 `{id,x,y,stand,kind,label}`；`stand` 用 `__MOSS__.isSolid` 验可通行。
2. 分发：`activateInteractable`（17802）加 `kind` 分支 → `openXxx(it)`；**漏分支不报错，只表现"按 E 没反应"**，所以必须有测试。
3. 新场景：`MAPS.xxx = (function(){…mkMap…})()`（4659）→ 加进 `SCENE_ORDER`（4783）→ 出口**两边都写**（`exits` 或 `exits.push`）→ 室内门格同时进 `*_DOOR_TILES` 与 `INTERACTABLES`。
4. 传送：`TRAVEL_NODES`（16924）/城区注册表；用 `__MOSS__.registeredRegions` 与 `doorTiles()` 核对。
5. 验收：`run-indoor-doors`、`run-world-map`、`run-fast-travel`、`run-ms1-locations`；新套件走真路（`walkTo`+`press('e')`）。

## 4. 加窗口面板

1. 数据/状态进 `state`（不要只放闭包/DOM）。
2. 入口：`activateInteractable` 分支、HUD 按钮 `onclick`、或 `openXxx()` 函数。
3. `openWindow({ id, kind, title, build(b){…}, actions:[…], wide/narrow })`（11773）；
   `title`/`actions` 可为函数；`actions[].close !== false` 时点完自动关窗；`refreshWindow()` 重绘。
4. 内容只用 `el()`/`mkBtn()`/`itemTile()` + 既有类（`.section-title/.panel-box/.grid.two/.muted`）。
5. 分页标题写 `第 n / N 页 · 主题`；测试读 `n/N`，别写死页数。
6. 验收：`run-ui`、`run-responsive-layout`、`run-*-mobile`；按钮文案=测试接口。

## 5. 加存档字段（最容易返工）

1. **不升 `SCHEMA_VERSION`**。加默认值：找到**最终生效**的 `newGameState`（23524 层）或其承载的 `newXxxState()`。
2. 写归一化：`normalizeXxx(raw)` 返回完整默认形状并裁剪不可信值；挂进最终 `normalizeSave` 路径（不是只挂 4022/4208 的旧层）。
3. 写档：最终 `serialize`（25244）补字段（若该层按整对象序列化可省略，但要确认）。
4. 旧档：只补默认值/空集合，不补"玩家没做过的事实"；证据/日期类字段缺失时保留 `null`/`-1` 语义（参考 `milLastHurtDay` 返回 -1）。
5. 旧档测试：v2 旧档用 `localStorage.setItem('moss-farm-v2', …)` + reload，或 `__MOSS__.normalizeSaveForTest`/`replaceSave`；`boot({seed})` 写的是 **`moss-farm-v1`**。
6. 验收：`run-save-invariants`、`run-r4-legacy-save`、`run-palace-save`、`run-construction-saves`；新增 seed 旧档用例走曾经出问题的路径。

## 6. 加结算页

1. 只往 `settlementPages()`（10348）的条件序列里**插页**，不改 `showSettlement`(10495)/`settleNext`(10486) 的翻页。
2. 每页 `{ title, … }` 由 `showSettlement` 渲染；需要状态就放 `state`/参数，不进 DOM。
3. 断言：从 `winTitle` 的 `n/N` 读真实页数，再逐页读当前页 `.section-title`/`.panel-box`；**不要**用 `winText()` 读整窗。
4. 验收：`run-r4-calendar`/`run-r4-season`/`run-r4-settlement-aid`、`run-r5-*`；新页要有"分页不丢页、幂等"断言。

## 7. 加 HUD 字段

1. `index.html` 的 `#hud` 加 `.hud-cell`（含 `.hud-label/.hud-value`）。
2. `refreshHud()`（11674）更新文本；由事件/结算触发，**不要每帧刷**。
3. 移动端检查 `compact-play`/`rotated-play`（`updatePlayLayout` 20047）下是否被压缩；必要时补 `styles.css` 响应式规则。
4. 验收：`run-ui`、`run-responsive-layout`、`run-main`。

## 8. 加测试钩子

1. `window.__MOSS__`（25256）里加只读导出（测试用），命名与既有风格一致。
2. 越界夹具（`dev*`、写存档）只用于回归，文件头注明"夹具边界"。
3. 需要记录提示时用 `toasts`（25826）；需要临时替换存档用 `replaceSave`（25976）。

## 9. 改钱/体力路径

1. 先加载 `xinglu-economy-invariants`；`grep 'state\.coins\s*(\+=|\+\+)'` 找出所有直接改钱处（当前 60 处量级）。
2. 每条收入写对价（扣物品/扣体力/扣次数），同一天不可重复领，跨日不可二次发。
3. 证据用快照（如 `debtAt`），展示可回退当前值但不得回写事实。
4. 验收：`run-r5-finance-safety`、`run-r5-credit`、`run-r4-*`；差值断言 + 幂等断言。

## 10. 加每帧绘制

1. 先加载 `xinglu-render-performance`；`frame`(20181) 里只 `tick*` 与 `drawScene`，tick 不算绘制。
2. 新装饰/特效尽量进分块烘焙（静态）或 `addParticle`（受 `PARTICLE_CAP` 限制），不要每帧 new 对象/重建 canvas。
3. 相机偏移只动 `cam.x/cam.y`，不改坐标系/碰撞/点击映射；`Math.round` 取整防半像素缝。
4. 验收：`run-responsive-layout`、`run-main`、`run-r5-mobile-touch`；必要时截图对比 `output/playwright/`。
