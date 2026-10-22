---
name: xinglu-scene-interaction
description: 在苔芽农场（game.js 单文件经营游戏，22 个地图标记 / 142 个场景，数量以 docs/feature-status.md 为准）里新增或修改地图、室内房间、门洞、交互点和面板窗口。Use when adding a scene/room/building, wiring a door or exit, adding an interactable with a new kind, building an openWindow panel, or when a 交互/传送/进门 regression needs locating.
---

# 苔芽农场 · 场景、门洞与交互

`game.js` 的世界数据是三套并行注册表 + 一条长 `if` 分发链，加东西的地方分散，漏一处就"看得见走不进"。

## 世界数据在哪（2026-10-22 快照，先 grep 再用）

| 行 | 符号 | 内容 |
| --- | --- | --- |
| 4659 | `var MAPS = {}` | 每个场景一个 IIFE：`mkMap(w,h,tile)` + `fillRow/fillCol/fillRect`，返回 `{ w, h, t, solid, name, exits, plantArea, buildings, trees, rocks, berries, pond, decor }` |
| 4783 | `var SCENE_ORDER` | 合法场景 id 白名单，`normalizeSave` 用它校验 `sceneId`（**没有 `SCREEN` 全局**） |
| 4784 | `var EXPLORE_NODES` | 探索采集点（`MAPS.mine1['4,3'] = {rich:true, qty:4}` 就在这层） |
| 5096/5156 | `HOUSE_FURNITURE` / `INTERIOR_FURNITURE` | 室内家具（可交互物） |
| 5110/5187 | `HOUSE_DOOR_TILES` / `INTERIOR_DOOR_TILES` | 门洞格；`__MOSS__.doorTiles()` 读的就是它们 |
| 5404/5413 | `enterIndoorDoor(it)` / `useIndoorExit(it)` | 进门/出门的门槛与落点 |
| 5443/5473/5495 | `checkExit` / `doSwitchScene` / `onSceneChanged` | 地图边缘出口、切场景、进入钩子（旧的 `sceneSwitch` 已不在） |
| 5553 | `var INTERACTABLES` | 按场景分组的交互点：`{ id, x, y, stand: [[x,y],…], kind, label }` |
| 5642 | `CITY_ROOMS` | 白蔷薇城室内房间 |
| 6276/6407 | `CITY_DISTRICTS` / `CITY_BUILDINGS` | 街区与建筑外观/门 |
| 16924 | `TRAVEL_NODES` | 公共传送节点 |
| 17802 | `activateInteractable(it)` | 一条 `if (it.kind === '…')` 长链，按 kind 分发到 `openXxx()` |

> 主线 M0/M1 的剧情入口也是 `INTERACTABLES` 里的一种 `kind`，分发后调 `openStoryScene('S0xx')`（见 `xinglu-story-quest-authoring`）；新入口同样要过"不占工具目标格/落脚点不压出口"检查。

## 加一个交互点的四件事

1. **数据**：在 `INTERACTABLES[场景]` 里加 `{ id, x, y, stand, kind, label }`。
   `stand` 是玩家可站的施法位，**必须真的可通行**（用 `__MOSS__.isSolid(scene, x, y)` 验一遍，别只看坐标好看）。
2. **分发**：在 `activateInteractable` 里加 `if (it.kind === 'xxx') { openXxx(it); return; }`。
   这里没有中心注册表，**漏了不会报错**，只会表现为"按 E 没反应"，所以每加一个 kind 都必须有测试走到它。
3. **面板**：`openWindow({ id, kind, title, build(bodyEl){…}, actions:[…] })`。
   `renderWindow()` 每次都会清空并重建 body —— **状态放 `state`，不要放 DOM**；按钮用 `mkBtn(label, kind, fn)` 生成，
   测试按文案点（`.win button` 的 `hasText`），所以文案改动等于改接口，改文案要同步测试。
4. **测试与文档**：一条真实输入用例（`walkTo` 到 `stand` → `press('e')` → 断言 `winTitle`），
   再加进 `tests/run-ci.mjs`；`docs/feature-status.md` 的数量由生成器读取运行时注册表得出，不用手抄。

## 加一个场景 / 门洞

- 地图：`MAPS.xxx = (function(){ var m = mkMap(w,h,T_GRASS); …; return { w, h, t, solid, name, exits, … }; })();`
  然后加进 `SCENE_ORDER`。可走性看 `solid` 数组；`fillRect(..., true)` 的最后一参是实心。
- 出口**两边都要写**：`MAPS.farm.exits = [{x:31,y:10,to:'town',tx:1,ty:10}, …]` 与 `MAPS.town.exits` 里的反向条。
  有些出口是在文件后面 `MAPS.town.exits.push({x:14,y:0,to:'forest',tx:14,ty:26})` 补的 —— grep `exits.push` 并确认目的地也有条目。
- 室内：门的格要同时出现在 `*_DOOR_TILES` 与对应 `INTERACTABLES`（`kind:'indoorEntrance'` / `'cityDoor'` / `'millDoor'` 等），
  出门用 `'indoorExit'`。`enterIndoorDoor(it)` 与 `useIndoorExit(it)` 里能读出门槛条件（信任、工程进度、营业时间）。
- 传送：公共传送节点与 M 地图的注册在城市场景那一层（`registeredRegions`、`CITY_BUILDINGS`），
  加完用 `__MOSS__.registeredRegions` 和 M 地图的「全境总图」核对可点、可传送。

## 面板窗口的既有约定

- 标题：`.win-title`，分页面板形如 `第 3 / 7 页 · 土壤肥力`（测试从 `n/N` 取真实页数）。
- 正文：`.win-body`，内容块用 `.section-title` / `.panel-box` / `.grid.two` 这类既有类名，样式在 `styles.css`。
- 动作：`actions:[{label:'开始新的一天', onClick(){…}, kind:'primary'}]`，`close !== false` 时点完自动关窗。
- 分页演出：`settlementPages()` 生成页数组 → `showSettlement()` 逐页渲染（`settleNext` / `settleSkip`）。
  加新页只往 `settlementPages()` 的条件序列里插，别改 `showSettlement` 的翻页逻辑。

## 自查

- [ ] `stand` 坐标可用（`isSolid` 为 false），相邻关系与 `faceTowards` 一致
- [ ] `activateInteractable` 加了分支，且有一条测试真的按 E 打开了面板
- [ ] 出口/门洞两边都注册；`__MOSS__.doorTiles()` 与实际门格一致
- [ ] 面板状态不依赖 DOM，重新开窗后一致（`renderWindow` 会重建）
- [ ] 测试支持 `--single-file`，已挂进 `tests/run-ci.mjs`
- [ ] 截图存 `output/playwright/`，文档表格由生成器更新而不是手改数字
