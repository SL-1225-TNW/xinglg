# game.js 锚点清单（2026-10-22 快照）

> 基准：`HEAD ed2e94b` + 未提交的 M1 第三幕改动；`game.js` 26,280 行（read 口径）。行号会漂移，**先 grep 再用**。
> 重新生成：`node -e "const fs=require('fs');const g=fs.readFileSync('game.js','utf8').split('\n');g.forEach((l,i)=>{if(/^function (openWindow|renderWindow)/.test(l))console.log(i+1,l)})"`

## 1. 数据注册表

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 62 | `SCHEMA_VERSION = 2` | 存档版本，禁止升 |
| 64 | `CFG` | 时间/体力/背包/存档去抖（`saveDebounceMs:750`、`moveSpeed:4`、`tickMinutes:10`、`tickSeconds:7.5`） |
| 100 | `ITEMS` | 物品：`kind/sell/device/food/desc` |
| 487 | `CROPS` | 作物：`growDays/regrow/yield/price` |
| 642 | `RECIPES` | 配方 |
| 653 | `QUESTS` | 旧主线委托链（4 条） |
| 670 | `QUEST_SITES` | 交付点 |
| 686 | `STORY_TASKS` | 第九版主线任务：`id/act/actName/title/goal/scenes/altScenes/next/exp` |
| 717 | `STORY_EVIDENCE` | 主线证据：`title/source` |
| 738 | `STORY_SCENES` | 主线场次：`task/place/time/where/lines/choices/evidence/memory` |
| 3338 | `NPCS` | 村民表：配色/喜好/`schedule`/`lines/rainLines/bridgeLines/heartLines` |
| 3562 | `TOOLS` | 快捷栏工具 |
| 4659 | `MAPS` | 场景地图：`w/h/t/solid/exits/buildings/plantArea` |
| 4783 | `SCENE_ORDER` | 合法场景 id 白名单（没有 `SCREEN`） |
| 4784 | `EXPLORE_NODES` | 探索采集点 |
| 5096/5110/5156/5187 | `HOUSE_FURNITURE`/`HOUSE_DOOR_TILES`/`INTERIOR_FURNITURE`/`INTERIOR_DOOR_TILES` | 室内装修/门格 |
| 5553 | `INTERACTABLES` | 每场景交互点：`{id,x,y,stand,kind,label}` |
| 5642 | `CITY_ROOMS` | 城市室内房间 |
| 6276/6407 | `CITY_DISTRICTS`/`CITY_BUILDINGS` | 街区/建筑 |
| 6830 | `CITY_STORY_QUESTS` | 城市支线（`requires` 链） |
| 6852 | `CITY_STAFF_ROUTINES` | 城市职员行程 |
| 16924 | `TRAVEL_NODES` | 公共传送节点 |

## 2. 状态与存档

`var state`：3838。

### newGameState 一级字段（4022 起，后段有包装）

`version`、`migratedFrom`、`totalDay`、`timeMinutes`、`weather`、`randomState`、`coins`、`energy`、`sceneId`、`player`、`selectedTool`、`selectedSeed`、`selectedDevice`、`inventory`、`plots`、`resourceNodes`、`structures`、`shipping`、`houseChest`、`nextStructureId`、`fishpond`、`millLife`、`meadowLife`、`farmCare`、`farmPlan`、`tutorial`、`npcFriendship`、`npcDailyInteractions`、`dsMet`、`rodLevel`、`exploration`、`questProgress`、`unlockedRecipes`、`bridgeRepaired`、`settleHistory`、`settings`、`overloaded`、`char`、`personal`、`palace`、`university`、`southGate`、`industry`、`construction`、`seasonStock`、`settlementAid`、`story`。

后段补充：`travel`（4084 追加）、`wetlandLife/professionalLife/militaryLife`（23362 包裹器），`personal` 懒建 25051。

### 读写链

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 4022 / 23362 / 23524 | `newGameState` | **最终 23524** 生效 |
| 4118 / 23364 / 23514 / 25244 | `serialize` | **最终 25244** 生效（补 personal） |
| 4182 | `saveNow` | `localStorage['moss-farm-v2']` |
| 4195 | `markDirty` | 750ms 去抖写 |
| 4208 / 23366 / 23506 | `normalizeSave` | **最终 23506** 生效 |
| 4541 | `migrateV1` | v1 → 新档 |
| 3715 | `migrateFishpondForOldSaves` | 鱼塘旧档补账 |
| 17121 | `migrateTravelForOldSaves` | 传送旧档补登 |
| 23397 / 23428 / 23469 | `LEGACY_SCENES` / `bindMilitaryLedger` / `migrateUnifiedSave` | 旧场景别名、军事账本、磨坊/草甸合并 |
| 4604 | `loadGame` | v2 → 坏档备份(`moss-farm-v2-corrupt`) → v1 → 新档 |

### normalize / sanitize

| normalize | 行 | normalize | 行 |
| --- | --- | --- | --- |
| CreditReview | 180 | Credit | 295 |
| Story | 2085 | PineChapter | 2305 |
| TideChapter | 2336 | SettlementAid | 3884 |
| SeasonStock | 3977 | Save | 4208 |
| SettleHistory | 4371 | Exploration | 4796 |
| Tutorial | 11088 | EngSafety | 13721 |
| EngDuty | 13837 | PostTerms | 13990 |
| EngProject | 14544 | Char | 15209 |
| MillLife | 20447 | MeadowLife | 20822 |
| FarmCare | 20934 | SegmentJourney | 21036 |
| FarmPlan | 21430 | WetlandLife | 21581 |
| ProfessionalLife | 21600 | MilitaryLife | 21661 |
| TideWork | 23100 | PineWork | 23169 |
| University | 24581 | SouthGate | 24696 |
| Industry | 24810 | Palace | 24922 |
| Personal | 25034 | Construction | 26051 |

`sanitize*`：`Inv`:4421、`Plots`:4432、`Nodes`:4462、`Structures`:4475。

## 3. 交互与场景

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 5443 | `checkExit` | 地图边缘出口触发 |
| 5473 | `doSwitchScene` | 淡入切场景 |
| 5495 | `onSceneChanged` | 场景进入钩子 |
| 9049 | `findInteractable` | 正前方→`stand` 相邻 |
| 9322 | `useTool` | 工具/种子/收获总入口 |
| 17748 | `interact` | E：交互→NPC→家具→设备→工具 |
| 17802 | `activateInteractable` | `kind` 大分派（100+ 分支） |
| 19916 | `onKeyDown` | 键位表（1-9/B/C/J/F/M/N/P/E/空格/Esc） |
| 19997 | `tickPlayer` | 移动/碰撞 |

## 4. UI / 窗口

| 行 | 符号 |
| --- | --- |
| 11065 | `UI`（窗口单例状态） |
| 11068 | `toast`（25997 覆写并记入 `__MOSS__.toasts`） |
| 11674 / 11701 | `refreshHud` / `refreshHotbar` |
| 11773 | `openWindow` |
| 11795 / 11811 / 11812 | `renderWindow` / `refreshWindow` / `closeWindow` |
| 11823 | `mkBtn` |
| 14918 / 15055 / 17420 | `openPause` / `openCharacter` / `openWorldMap` |

## 5. 结算

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 10031 | `tickTime` | 时间推进/到点结算 |
| 10062 | `requestSleep` | 睡觉确认 |
| 10097 | `performSettlement` | 作物/肥力/出货/补助/天数+1(10211)/发钱(10178,10220)/体力(10228)/水/存档(10289)，失败回滚(10294) |
| 10348 | `settlementPages` | 条件性页序列 |
| 10495 | `showSettlement` | 分页结算 UI |
| 10486 | `settleNext` | 翻页 |

## 6. 渲染

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 17989 | `px` | `fillRect` 像素原语 |
| 18434 | `groundChunks` / `groundChunkOrder` | 地面块缓存 |
| 18543/18544 | `GROUND_CHUNK=48` / `GROUND_CHUNK_CAP=40` | 分块参数 |
| 18668 | `groundChunk` | 烘焙/取缓存（LRU） |
| 18690 | `drawGround` | 只画视野块 |
| 19414/19415 | `PARTICLE_CAP=120` / `addParticle` | 粒子 |
| 19557 | `drawScene` | 相机+分层绘制 |
| 20047 | `updatePlayLayout` | 布局/immersive |
| 20124 | `resizeCanvas` | DPR/zoom/视口瓦片对齐 |
| 20181 | `frame` | rAF 主循环（`dt≤0.1`） |
| 20202 | `boot` | 读档/绑 DOM/启动 |

## 7. 主线剧情系统（M0/M1 使用）

| 行 | 符号 | 说明 |
| --- | --- | --- |
| 686/717/738 | `STORY_TASKS`/`STORY_EVIDENCE`/`STORY_SCENES` | 数据 |
| 2085 | `normalizeStory` | 主线存档归一化 |
| 2179 | `storyState` | `state.story` 懒建 |
| 2181/2188/2198 | `storySceneProgress`/`storySceneFinished`/`storySceneSeen` | 场次进度 |
| 2201/2209/2221/2272 | `storyTaskStatus`/`storyTaskUnlocked`/`storyPrevTask`/`storyNextScene` | 任务解锁/顺序 |
| 2247/2262/2268 | `storyIsOldSave`/`storyRouteFor`/`storyTaskScenes` | 旧档补送、桥未修替代路线 |
| 2278/2286 | `storyRecordEvidence`/`storyHasEvidence` | 证据入库（记出处与日期，不重复） |
| 2576/2607 | `openStoryScene`/`buildStoryScene` | 场次面板 |
| 2657 | `buildStoryChoice` | 选择分支（选择即生效，不等演完） |

M1 第二/三幕额外：`normalizePineChapter`:2305、`normalizeTideChapter`:2336、`normalizePineWork`:23169、`normalizeTideWork`:23100；`pineWorkState()`/`tideWorkState()` 等用 `grep` 定位。

## 8. 测试钩子（`window.__MOSS__`，25256 起，约 347 个导出）

| 行 | 符号 | 用途 |
| --- | --- | --- |
| 25256 | `window.__MOSS__` | 总入口 |
| 25382 | `devSwitchScene` | 越界夹具：切场景 |
| 25507 | `normalizeSaveForTest` | 存档夹具最常用 |
| 25775 | `devOpenService` | 越界夹具：开服务面板 |
| 25826 | `toasts` | 提示环形记录（≤60） |
| 25960 | `findPath`/`isSolid` | 寻路/碰撞只读 |
| 25976/25994 | `replaceSave`/`startGame` | 热替换状态 |

## 9. 测试基建

| 文件 | 要点 |
| --- | --- |
| `tests/harness.mjs` | 339 行、32 exports：`launch/boot/snap/hud/pos/walkTo/walkAdjacent/interactWith/clickWin/winTitle/winText/...`；`boot({seed})` 写 **`moss-farm-v1`** |
| `tests/run-ci.mjs` | 156 行：FAST 19-25（5 步，语法检查全部 `.mjs`）；BROWSER 字符串数组 28-96（84 条）；`run()` 98-105；单文件复跑 128-153（26 条）；汇总 155-156 |
| `tests/build-single-file.mjs` | 4 道硬校验：`</script`、`</style`、必须匹配 `<link rel="stylesheet" href="styles.css">` 与 `<script src="game.js"></script>`、生成后不得残留外链 |
| `tests/build-status-runtime.mjs` | 启动游戏读运行时注册表，生成 `docs/feature-status.md`（保留顶部状态行与人工节） |
| `tests/build-status-doc.mjs` | 1 行 import 别名 |
