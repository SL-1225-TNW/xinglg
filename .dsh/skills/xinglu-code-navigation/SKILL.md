---
name: xinglu-code-navigation
description: 在苔芽农场的 game.js（单文件约 2.6 万行）里找代码、定位状态/存档/交互/渲染/结算入口，或准备加物品、作物、NPC、任务场次、交互点、面板、存档字段时使用。Use when you need to locate where a system lives, when a documented line number no longer matches, or before adding a new item/crop/quest scene/interactable/panel/save field/settlement page.
---

# 苔芽农场 · 代码导航

`game.js` 是一个 2.6 万行、无模块、顶层 `var` 注册表 + `function` 的单文件。找代码靠 **grep 符号**，不靠记忆里的行号。
本页给分层地图与导航规则；完整锚点见 `references/anchors.md`，逐步配方见 `references/recipes.md`。

## 三个反直觉事实（先记住）

1. **没有 `SCREEN` 全局**。场景态 = `state.sceneId` + `SCENE_ORDER`（合法 id 白名单）。
2. **`newGameState` / `serialize` / `normalizeSave` 在后段被重定义**：`newGameState` 4022→23362→23524；`serialize` 4118→23364→23514→25244；`normalizeSave` 4208→23366→23506。**只改前面的定义会被外层覆盖**——改存档逻辑先看最后一份。
3. **`SCHEMA_VERSION = 2` 不许升**。加字段 = 默认值 + `normalizeXxx` + 必要 `migrate*`；旧档只补空事实（见 `xinglu-save-compat`）。

> 行号基准：2026-10-22、`HEAD ed2e94b` + 未提交的 M1 第三幕改动。**任何行号都会漂移，改前先 grep 当前符号。**

## 分层地图

```
数据注册表  CFG / ITEMS / CROPS / RECIPES / QUESTS / STORY_TASKS / STORY_SCENES
            NPCS / TOOLS / MAPS / SCENE_ORDER / INTERACTABLES / TRAVEL_NODES
      ↓
状态         var state（唯一存档态，3838）→ newGameState / normalizeSave / migrate* / serialize
      ↓
系统         tickTime / tickPlayer / tickNpc / useTool / useFarm… / performSettlement
      ↓
交互与 UI     interact(17748) → activateInteractable(17802) → openXxx() → openWindow(11773) → renderWindow
      ↓
渲染        frame(20181) → drawScene(19557) → drawGround(18690)/groundChunk(18668) → px(17989)
```

## 顶层符号速查（2026-10-22 快照）

| 组 | 符号：行 | 说明 |
| --- | --- | --- |
| 版本 | `SCHEMA_VERSION`:62 | 禁止升 |
| 数值 | `CFG`:64 / `ITEMS`:100 / `CROPS`:487 / `RECIPES`:642 / `TOOLS`:3562 | 时间体力背包、物品、作物、配方、工具 |
| 任务 | `QUESTS`:653 / `QUEST_SITES`:670 / `CITY_STORY_QUESTS`:6830 | 旧委托链/交付点/城市支线 |
| 主线 | `STORY_TASKS`:686 / `STORY_EVIDENCE`:717 / `STORY_SCENES`:738 | 第九版《长风有归处》：任务、证据、场次 |
| NPC | `NPCS`:3338 / `CITY_STAFF_ROUTINES`:6852 | 村民表/城市职员行程 |
| 世界 | `MAPS`:4659 / `SCENE_ORDER`:4783 / `INTERACTABLES`:5553 / `TRAVEL_NODES`:16924 | 地图、场景白名单、交互点、传送 |
| 状态 | `var state`:3838 / `saveNow`:4182 / `markDirty`:4195 / `loadGame`:4604 | 存档态与读写 |
| 剧情运行 | `storyState`:2179 / `openStoryScene`:2576 / `storyNextScene`:2272 | 主线状态与场次打开 |
| 交互 | `checkExit`:5443 / `doSwitchScene`:5473 / `findInteractable`:9049 / `interact`:17748 / `activateInteractable`:17802 | 出口、切场景、交互分派 |
| 工具 | `useTool`:9322 / `onKeyDown`:19916 / `tickPlayer`:19997 | 工具总入口、键位、移动碰撞 |
| UI | `UI`:11065 / `toast`:11068 / `refreshHud`:11674 / `openWindow`:11773 / `renderWindow`:11795 / `closeWindow`:11812 / `mkBtn`:11823 | 窗口系统（详见 `xinglu-ui-window-css`） |
| 结算 | `tickTime`:10031 / `requestSleep`:10062 / `performSettlement`:10097 / `showSettlement`:10495 | 时间、睡觉、日结算（详见 `xinglu-economy-invariants`） |
| 渲染 | `px`:17989 / `groundChunks`:18434 / `drawGround`:18690 / `drawScene`:19557 / `resizeCanvas`:20124 / `frame`:20181 | 渲染（详见 `xinglu-render-performance`） |
| 启动 | `boot`:20202 | 读档、绑 DOM、启动循环 |
| 测试钩子 | `window.__MOSS__`:25256 / `normalizeSaveForTest`:25507 / `replaceSave`:25976 / `devSwitchScene`:25382 / `toasts`:25826 | 约 347 个导出；`dev*` 是越界夹具 |

## 存档链（改存档必看）

- **读档**：`loadGame`(4604) → 最终 `normalizeSave`（23506 层）→ 失败写 `moss-farm-v2-corrupt` 备份 → 再试 `migrateV1` → 仍失败走新档。
- **写档**：最终 `serialize`（25244 层，补 `personal`）→ `saveNow`(4182) 写 `moss-farm-v2`；平时走 `markDirty`(4195) 去抖 `CFG.saveDebounceMs=750`。
- **状态字段**：`newGameState`(4022) 是字面量起点，但 23362 包裹器补 `wetlandLife/professionalLife/militaryLife`、23524 再包装；`travel` 在 4084 追加；`personal` 懒建于 25051。加字段要进**最终生效的那一层**并在 `normalizeSave` 路径上有对应 `normalizeXxx`。
- **归一化**：32 个 `normalizeXxx`，完整清单见 `references/anchors.md`；`sanitize*` 管背包/耕地/资源点/设备。
- **迁移**：`migrateV1`:4541、`migrateTravelForOldSaves`:17121、`migrateFishpondForOldSaves`:3715、`migrateUnifiedSave`:23469（`LEGACY_SCENES`:23397）。

## 十类改动先看哪里

| 要改什么 | 先看 | 先跑/先读测试 |
| --- | --- | --- |
| 数值、物品、配方、工具 | `CFG/ITEMS/CROPS/RECIPES/TOOLS` | `run-guide`、`run-industry` |
| 地图/房间/门/出口 | `MAPS/SCENE_ORDER/INTERACTABLES`、`doSwitchScene/checkExit/onSceneChanged` | `run-indoor-doors`、`run-world-map`、`run-fast-travel`、`run-ms1-locations` |
| 交互 kind/面板入口 | `INTERACTABLES/findInteractable/interact/activateInteractable` | `run-ui`、`run-r5-natural-entry`、`run-palace-*` |
| 窗口/面板/分页 | `openWindow/renderWindow/closeWindow/UI/mkBtn` | `run-ui`、`run-responsive-layout`、`run-*-mobile` |
| 存档字段/旧档 | 最终层 `newGameState/serialize/normalizeSave`、`migrateUnifiedSave` | `run-save-invariants`、`run-r4-legacy-save`、`run-palace-save`、`run-construction-saves` |
| 钱/体力/补助/贷款/扣押/结算 | `tickTime/requestSleep/performSettlement/showSettlement` | `run-r4-*`、`run-r5-credit/finance-safety/review` |
| 渲染/相机/缩放/卡顿 | `frame/drawScene/resizeCanvas/drawGround/updatePlayLayout` | `run-responsive-layout`、`canvas-size` |
| 输入/移动/寻路 | `onKeyDown/tickPlayer` | `run-main`、`run-edge`、`run-*-mobile` |
| NPC/主线/任务/对白 | `NPCS/STORY_*/QUESTS`、`storyState/openStoryScene` | `run-m0-story*`、`run-m1-*`、`run-city-npc` |
| 打包/状态文档/CI | `tests/build-single-file.mjs`、`tests/build-status-runtime.mjs`、`tests/run-ci.mjs` | `run-single-file-smoke` |

## grep 姿势

```powershell
# 新套件不依赖 shell 工具时，用工具自带的 grep；命令行可用 Select-String：
Select-String -Path game.js -Pattern '^function (openWindow|renderWindow|closeWindow)\('
# 找所有直接改钱的位置（economy 技能会要求守恒断言）
Select-String -Path game.js -Pattern 'state\.coins\s*(\+=|\+\+)'
# 找某个 state 子系统的归一化/迁移
Select-String -Path game.js -Pattern '^function (new|normalize|migrate)(Story|Pine|Tide)\w*\('
```

- 文档/技能里的行号只是索引，**永远先 grep 符号名再 read**。
- 改 `game.js` 后必须 `node --check game.js` → 重建单文件 → 对应套件（源码轮+`--single-file` 轮）。
- 不要用 read 通读全文件；按注册表锚点局部读，每段 ≤ 200 行。

## 测试钩子（`window.__MOSS__`，25256 起，约 347 个导出）

- 只读：`snap` 之外的 `isSolid/findPath/doorTiles/registeredRegions/travelNodes/...`。
- 存档夹具：`normalizeSaveForTest`(25507)、`replaceSave`(25976)。
- 越界夹具（仅回归、文件头注明）：`devSwitchScene`(25382)、`devOpenService`(25775)、`startGame`(25994)。
- 提示记录：`toasts`(25826) 环形数组（≤60）。
- 测试的 `boot({seed})` 实际写的是 **`moss-farm-v1`**；v2 旧档测试要自己 `localStorage.setItem('moss-farm-v2', …)` 再 reload。

## 参考

- `references/anchors.md`：完整符号/状态字段/normalize 清单。
- `references/recipes.md`：加物品、剧情场次、交互点、面板、存档字段、结算页、HUD、测试钩子的逐步写法。
- 子系统技能：`xinglu-save-compat`、`xinglu-economy-invariants`、`xinglu-scene-interaction`、`xinglu-story-quest-authoring`、`xinglu-ui-window-css`、`xinglu-render-performance`。

## 自查

- [ ] 我 grep 到的是**当前**符号，不是文档里的旧行号
- [ ] 改存档时改的是最后生效的那层 `newGameState/serialize/normalizeSave`
- [ ] 新系统复用了既有注册表与 `normalizeXxx`，没有另起框架
- [ ] `node --check game.js` 通过，单文件已重建
- [ ] 对应 `tests/run-*.mjs` 源码轮与 `--single-file` 轮都跑过
