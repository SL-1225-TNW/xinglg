---
name: xinglu-story-quest-authoring
description: 苔芽农场的剧情、任务与对白写作及落码——主线稿（总规 §27）、第九版 STORY_TASKS/STORY_SCENES、委托链、NPC 对白分支、人物表。Use when writing or reviewing 主线剧情稿/任务目录, when adding a M0/M1 主线任务或场次 to game.js, when adding a quest or a chained 委托, when editing NPCS lines / heartLines / city story quests, or when deciding whether a story beat can be built on existing systems.
---

# 苔芽农场 · 剧情、任务与对白

仓库里剧情相关的东西分三层：**策划稿（docs/）**、**任务注册表（game.js 常量）**、**对白与行程（NPC 数据）**。
策划稿是提案，不等于已实装；`docs/feature-status.md` 只写运行时真的存在的东西。

## 五套任务机制（优先复用，别新造）

| 机制 | 位置（2026-10-22 快照） | 状态存储 | 适用 |
| --- | --- | --- | --- |
| **第九版主线** `STORY_TASKS`/`STORY_SCENES` | `game.js:686` / `:738`（证据表 `STORY_EVIDENCE:717`） | `state.story`：`tasks/scenes/evidence/flags/choices` | **M0—M4 现行主线《长风有归处》**，幕内场次+互动+选择 |
| 主委托 `QUESTS` | `game.js:653`，4 条 | `state.questProgress[id]`：`'locked' \| 'unlocked' \| 'done'` | 早期教学性主线（收成→木料→修桥→钓鱼） |
| 交付点 `QUEST_SITES` | `game.js:670` | — | `QUESTS[].scene` 只是类型（`board`/`bridge`），坐标在这里 |
| 城市支线 `CITY_STORY_QUESTS` | `game.js:6830`，5 条链 | `exploreState().cityStories[id]`：`available/accepted/done/locked` | 中后期城市线，`requires` 前后依赖 |
| 特殊委托 `specialQuest*` | `game.js:6864–6872` | `exploreState().storyDone` / `bondDone` | 探索线（`minTier`/`minDepth`/`city`）与羁绊线（`minFriendship`） |

任务面板入口：`questById`(10733)、`questState`(10734)、`questNeedText`(10735)、`questReady`(10744)、
`questLogPush`(10328)、`renderSpecialQuestCard`(6887)、`openCityStoryQuest`(7089)。

一条城市支线的形状（照抄这个，别改字段名）：

```js
{ id:'archive', building:'library', buildingName:'蔷薇图书馆', npc:'archivist', title:'补齐山谷旧志',
  desc:'艾琳想修补记载山谷旧路的地方志。把木材和林间蘑菇带到图书馆档案桌。',
  cost:{ wood:6, mushroom:2 }, rewardItems:{ berry:2 }, coins:75, friendship:10, reputation:5,
  requires:null, rewardText:'75 金、野莓 ×2、艾琳好感 +10、城市声望 +5' },
```

`requires` 指向前一条的 `id`，形成链；`cost`/`rewardItems` 的键必须是 `ITEMS` 里已有的物品 id；
`coins` 走既有发钱通道；`friendship` 记进 `state.npcFriendship[npc]`；带 `smithCoupon` 这类一次性优惠要写进状态并在用掉后清。

## 第九版主线落码（M0/M1 现行做法，M2/M3 沿用）

**正文只从 `游戏总体规划.md` §27 的分场稿取，不另写一份剧情。** 落码五步（详细代码形状见
`xinglu-code-navigation/references/recipes.md` §2）：

1. `STORY_TASKS`（686）加任务：`{ id:'MQ1-X01', act, actName, title, goal, scenes:['S0xx',…], altScenes?, next, exp }`；
   `next` 串成链、无环；幕内任务 id 形式 `MQ1-P0x/A0x/B0x/C0x/D0x/E0x/F0x`。
2. `STORY_EVIDENCE`（717）加证据：`{ key:{ title, source } }`；`source` 写场次与地点。
3. `STORY_SCENES`（738）加场次：`{ task, place, time, where, lines:[…], memory?, evidence? }`；
   行类型：`{who,text}` 对白、`{who:'',text}` 旁白、`{when:function(c){…}}` 条件、
   `{choice,prompt,options:[{id,text}]}` 选择、`{step,text,mode:'items'|'overlay'|'reception'}` 互动步骤。
4. 入口：`INTERACTABLES[场景]` 加交互点（新 `kind`）→ `activateInteractable` 分支里调 `openStoryScene('S0xx')`；
   `stand` 真可通行、不占工具目标格、不压下一图出口格。
5. 存档与旧档：`state.story` 由 `newStoryState()`/`normalizeStory`(2085) 管理；旧档走 `storyIsOldSave()` 补送信，
   不补造没看过的场次/证据。B/C 幕额外有 `seen` 语义（`storySceneFinished` 对 `MQ1-B/C` 用 `seen` 判定）、
   顺序面板（`openStoryOrderPanel`）与"到现场才可开演"检查（`storyBNear/storyCNear`）。
   **选择在选中那一刻写入 `storyState().choices`，不等整场演完**（`buildStoryChoice` 2657）。

证据：`storyRecordEvidence`(2278) 记 `{title,source,day}` 且不重复；`故事事实共用完成键/奖励键`，重复进出不重复发经验。
验收：`run-m0-story`（96 项）、`run-m0-story-city`（133 项）、`run-m1-segment-travel`（76）、`run-m1-cross-border`（68）、
`run-m1-pine-work`、`run-m1-pine-story`（126）、`run-m1-tide-story`；全部要源码轮 + `--single-file` 轮，并挂 `run-ci.mjs`。


## 人物与对白

- 村民表 `NPCS`（game.js:3338，7 位：芽芽 `yaya`／阿栎 `aqi`／DS 小姐 `ds`／马丁 `martin`／柯里 `councilor`／艾妲 `aida`／卢安 `luan`）。
  字段：`id/name/title/scene`、配色（`hair/shirt/accent/skin`）、`like`/`dislike`、`schedule:[{from,to,x,y}]`、
  `lines[]`／`rainLines[]`／`bridgeLines[]`／`heartLines[]`。
- 城市职员只有行程表 `CITY_STAFF_ROUTINES`（game.js:6852，10 位：`baker/postie/florist/merchant/cook/archivist/blacksmith/tailor/innkeeper/steward`，
  格式 `[[from,to,x,y],…]`），姓名与称谓来自任务里的 `npc` 字段与 `title`。
- 对白选择在 `npcDialogue(id)`（10675），优先级是**固定的一条链**，加对白就是往里插一层：
  新的 `heartLines` 阶段（一次性）→ `engOutcomeDialogue(id)`（职业线结果）→ `bridgeLines`（任务 3 解锁）→ `rainLines`（下雨）→
  `lines[(chatCount + totalDay) % lines.length]`（日常轮换）。`chatCount` 每次对话 +1。
- 对话入口 `talkToNpc`(10695) / `giftToNpc`(10708) / `openDialogue(id,text,gain)`(12574)：
  当天首次对话 +2 好感；送礼每天一次，`love +8`（在 `like` 里）、`like +3`、`dislike −2`。
- 好感档位 `friendshipStage(v)`（10642）：`>=75 / >=50 / >=25 / 0` 四档，`heartLines` 按档位取。

改对白的纪律：**每条线都要有触发条件明确的来源**（天气、任务进度、好感档、职业结果），
不要写"随机出现"的台词；文案里的承诺要和机制一致（说"三天就能收"就真是三天）。

## 写策划稿的约束（来自《长风有归处》v2/v3 审阅稿，逐条可执行）

> 现行正文以 `游戏总体规划.md` 第九版 §27 分场稿为准；审阅稿是评审记录，不另起一份平行剧情。
> 提前探索接续表在总规 §26.4；实施顺序与缺口总账在 §19/§20。

1. **门槛只用既成事实**：前章完成、真实生活经历、已知线索、合法通行。不新增"冒险等级"；
   职业条件写"任一"（工程/商旅/巡林/经营任选其一），不要求全修。
2. **门槛必须可解释**：UI 显示具体条件与已完成项；可以"尚待某封来信"，但不能让玩家不知道下一章为何不出现。
3. **每段主线检查三种情况**：初访／来过但未完成相关事务／已完成相关事务。
   已修好磨坊不再安排设备故障；已到过省城不复述初次进城；有巡防资格不再称见习者，但没有本次授权不能调兵。
4. **提前探索**：外围可提前探索，危险内段要近期路线核验与许可；提前取得的晚期线索存为"已发现"。
   若玩家能合法提前抵达，必须写"已重逢、待补全旧事"的接续，**不允许关键人物无理由隐形**。
5. **结局不设收集门槛**：不以全收集／爵位／28 天任期为看结局的条件；动作有期限时才计时；所有保底办法必须真的可玩。
6. 文档结构沿用现有 v2/v3 审阅稿：主线定位与承诺 → 人物 → 因果底稿 → 篇章结构与时长 → 任务目录与剧情 →
   解锁门槛与自由探索 → 标题与任务界面 → 制作和验收。新稿开 `docs/主线剧情-<名>-v<n>-审阅稿.md`，
   旧稿归档到文件名带版本后缀，不要覆盖。

## 落码检查

- [ ] 正文只从总规 §27 取；任务/场次 id 唯一、`next`/`requires` 链无环
- [ ] `STORY_TASKS` 的 `scenes`/`next` 与 `STORY_SCENES` 的 `task` 对得上；未实装场次标"提案"
- [ ] 入口是 `INTERACTABLES` 真实交互点，`stand` 可通行、不占工具目标格、不压出口格
- [ ] 选择/证据用 `storyState()` 持久化；`storyRecordEvidence` 记出处+日期且不重复
- [ ] 旧档只补默认值，不补造没看过的场次/证据/选择；B/C 幕 `seen` 语义正确
- [ ] `cost`/`rewardItems` 全部是 `ITEMS` 现存 id；奖励空间不足有兜底（`bagAccepts`）
- [ ] 对白分支有确定触发源；好感/声望变化走既有字段
- [ ] 至少一条套件用真实输入走完"走到入口→按 E→推进/选择/步骤→事实入库"，且支持 `--single-file`
- [ ] 策划稿里的数字（场次/任务/人物）与实际注册表一致

## 现有证据

- 主线：`run-m0-story`（96 项）、`run-m0-story-city`（133）、`run-ms1-locations`（49）、`run-m1-segment-travel`（76）、
  `run-m1-cross-border`（68）、`run-m1-pine-work`、`run-m1-pine-story`（126）、`run-m1-tide-story`（174，2026-10-22 快照）。
  这些是**局部专项证据**，项数会随版本变化，以日志为准；不替代全新存档连续游玩与实体手机验收。
- 旧机制：`run-phase-cde`（主委托与阶段推进）、`run-south-gate`、`run-industry`、`run-university`（城市线）、
  `run-r5-natural-entry`（真实入口而非夹具）。
- 策划侧：`docs/主线剧情-长风有归处-v3-审阅稿.md`、`docs/主线剧情-长风有归处-v2-审阅稿.md`、
  `docs/游戏总体规划.md` 第九版（17 场景／11 人物／37 任务，规划；实施状态看交付记录与 feature-status）。
