# 白蔷薇宫城 P1 施工契约

日期：2026-10-13。本文件是 `docs/white-rose-palace-construction-plan.md` 第 9 节 P1 的实现契约：
场景 ID、尺寸、楼梯坐标、交互物数据形状、存档字段、对外探针。实现与测试都以此为准。

## 1. 为什么这么定

三条既成事实决定了方案形状：

1. **室内渲染按 `map.roomDef` 走 `cityRoomCanvas`**（`drawCityInterior` 的地板、墙裙、`CITY_PROPS` 陈设、
   门洞绘制都靠它）。新建宫殿楼层必须复用这条管线，否则房间只有门没有地面和陈设。
2. **门系统 `installIndoorDoors` 是硬校验**（门必须在墙上、落点不能是墙/家具/别的出口、门内站位要空）。
   它对新场景同样适用，是我们的验收闸门，不需要另写一套门。
3. **矿井 `mineStairs` 已经是"跨层"既有模板**（`INTERACTABLES` 声明 → `activateInteractable` 分支 →
   `doSwitchScene` 落到与触发格完全不同的落点）。跨层移动不需要新引擎，照抄这个形状即可。

## 2. 场景 ID 与命名

| 场景 ID | 类型 | 名称 | 说明 |
|---|---|---|---|
| `palace_grounds` | 户外 | 白蔷薇宫苑 | 城市主门进入后的常驻宫苑 |
| `palace_f1` | 室内 | 白蔷薇宫城 · 一层 门厅 | 公开办事与第一次到访 |
| `city_castle` | 室内 | 白蔷薇宫城 · 二层 王座厅 | **沿用既有 ID**，按规划扩为二层礼仪主层 |
| `palace_f3` | 室内 | 白蔷薇宫城 · 三层 起居 | 书房、寝居、客房、阅读廊 |
| `palace_gallery` | 户外 | 白蔷薇宫城 · 二层 回廊 | 二层的礼仪回廊，俯瞰荣誉内庭 |
| `palace_terrace` | 户外 | 白蔷薇宫城 · 翼楼露台 | 三层可达的局部露台 |

六个场景里三层室内是「楼层」，宫苑与两处户外不是楼层 —— `palaceFloorOf()` 对它们返回 `null`。

**用 `palace_` 前缀而不是 `city_` 前缀**：`city_` 前缀在 6 处被当作"城市内部房间"判定
（`game.js:1095 / 3428 / 5581 / 12822 / 13038 / 15361`），其中 `5581` 会拿 `slice(5)` 后的 id 去
`CITY_BUILDINGS` 里找建筑、`12822` 会把所有 `city_*` 归并到同一个传送站。宫殿是独立建筑群，不该继承这些。

因此渲染派发与通行证守卫各补一条 palace 分支：

- `drawCityInterior` 派发改为 `if (state.sceneId.indexOf('city_') === 0 || map.roomDef)` —— `roomDef` 才是
  "这是城市房间式室内"的真实判据，改成它是**严格超集**，既有场景行为不变。
- 读档守卫 `game.js:1095` 与区域可达判定 `game.js:3428` 补上 `palace_` 前缀，宫苑同样需要城市通行证
  （进宫苑的唯一入口就在城里）。

## 3. 尺寸

| 场景 | 尺寸 | 依据 |
|---|---|---|
| `palace_grounds` | 120 × 96 | 规划 §4 的建议初始值 |
| `palace_f1` | 64 × 48 | 规划 §4「整层室内以约 80×60 为排布上限」以内 |
| `city_castle` | 64 × 48 | 与一层同尺寸，大楼梯才能逐层对齐 |
| `palace_f3` | 64 × 48 | 同上 |
| `palace_gallery` | 28 × 16 | 二层礼仪回廊 |
| `palace_terrace` | 40 × 28 | 局部屋顶，不做整层 |

三层同尺寸是硬要求：主楼梯"在各层对齐"靠的就是同一坐标带。

## 4. 房间定义表

新增 `PALACE_ROOMS`，形状与 `CITY_ROOMS` 完全一致（`w / h / floor / props / spots / staff`），
放在 `game.js` 中 `configureIndoorDoors()` 之后的新章节里。`props` 里 `flat:true` 的不产生碰撞。

地板材质沿用既有 `CITY_FLOORS` / `CITY_WALL`：`marble`（礼仪层）、`tile`（门厅）、`wood`（起居层）、
`stone`（礼拜堂）。

## 5. 房间生成

**不复用 `building()`**：它硬编码 `roomId='city_'+id`、`exits` 指向 `city`、并往 `INTERACTABLES.city`
塞一个门。新写一个 `palaceRoom(id, label, def, exits)`，只做房间地图、`MAPS` / `SCENE_ORDER` /
`INTERACTABLES` 登记，门的 `exits` 由调用方给定，随后显式调用 `installIndoorDoors` 拿到校验。

在 `configureIndoorDoors()` 之后插入 ⇒ 不会被自动门接管逻辑挪动门位。

## 6. 楼梯系统

### 6.1 交互物

**每个方向一条记录**，中间楼层因此有两条：

```js
/* 一层的上行梯 */
{ id:'palace_f1_up', kind:'palaceStair', floorId:'palace_f1', dir:'up',
  x:28, y:35, stand:[[28,38],[29,38],[28,39],[29,39]],
  to:'city_castle', tx:31, ty:27, label:'上楼 · 二层 · 王座厅' }
/* 二层的下行梯 */
{ id:'city_castle_down', kind:'palaceStair', floorId:'city_castle', dir:'down',
  x:33, y:35, stand:[[33,31],[34,31],[33,32],[34,32]],
  to:'palace_f1', tx:31, ty:42, label:'下楼 · 一层 · 门厅' }
```

- 楼梯带是 `flat` prop，**可行走**；玩家站上台阶或站在 `stand` 任一格、面朝台阶即可触发。
- 上行触发点在楼梯**西端**、stand 在**南侧**；下行触发点在**东端**、stand 在**北侧**。
  两个方向分处楼梯两头，`findInteractable` 的「正前方优先」不会在两个方向之间挑错。
- 落点 `tx,ty` 固定在楼梯另一端之外（上行 `(31,27)`、下行 `(31,42)`），
  **与 stand 里的任何一格都相距 ≥3 格**（实测 12～13 格）。这是规划 §6
  「楼梯平台落点与触发格分开，防止刚上楼便自动下楼」的机械保证。
- 换层时设置朝向：从楼梯口走出来的人面朝楼梯那一侧（上行落点 `face:'down'`、下行落点 `face:'up'`）。
- 一层没有下行梯、三层没有上行梯，因此三层的 `(x,y)` 集合**本就不同**——
  "对齐"的不变量是所有触发点落在同一条楼梯坐标带上，不是集合相等。

### 6.2 接入点（共 4 处）

1. `INTERACTABLES[scene]` 数组：声明数据。
2. 基函数 `activateInteractable`（`game.js:13439` 紧邻 `mineStairs`）加
   `if(it.kind==='palaceStair'){usePalaceStair(it);return;}`。
   后面的 4 层装饰器包装（`17150 / 17183 / 17450 / 17668`）都会向下委托，无需改动。
3. 实体渲染：`game.js:15277` 那一串 `if/else` 里加 `palaceStair` 分支，画台阶口的木牌与上下箭头。
   台阶面本身用 `flat` prop 烘进房间画布，玩家从上面走过。
4. `usePalaceStair(it)`：校验玩家确实站在 `stand` 内（沿用 `enterIndoorDoor` 的写法），
   再 `doSwitchScene(it.to, it.tx, it.ty, face)`。

桌面 E 键（`interact()`，`game.js:15500`）、手机 `#touchAct`（`game.js:15909`）、
画布点按（`game.js:15881`）三条路径都走 `findInteractable → activateInteractable`，
**新增一种 kind 同时覆盖桌面与手机，不需要额外接线**。

### 6.3 大楼梯对齐带

三层共用同一条楼梯带 `x=27..34 / y=33..37`（`stairs` prop + 两侧 `stairRail` 栏杆）。
上行触发点 `(28,35)`、下行触发点 `(33,35)`，三层完全一致。

**对齐的不变量**：所有 `palaceStair` 触发点的 y 相同、x 跨度 ≤ 8 格；同层若同时有上下梯，
两个触发点的 x 必须不同（否则「正前方优先」会挑错方向）。
**不是**"各层 (x,y) 集合相等"——一层没有下行梯、三层没有上行梯，集合本就不同。

服务梯（B1 ↔ 1F）按规划属于 P2，本批只在三层留出同一坐标带（`x=39..41 / y=33..37`）与门牌，不连地下层。

## 7. 出入口

| 起点 | 目标 | 机制 |
|---|---|---|
| 城市街道 城堡门 `(320,164)` | `palace_grounds` | 新 kind `palaceGate`，见 7.1，落点 `(60,90)` |
| `palace_grounds` 主宫南门 `(60,46)` | `palace_f1` | `kind:'indoorEntrance'`, `doorId:'main'`，落点 `(60,49)` |
| `palace_f1` 主门 | `palace_grounds` | `exits`（走过即切）+ 门系统生成的 `indoorExit`（按 E 也可） |
| `palace_grounds` 南缘 `(60,93)` | `city` | `kind:'palaceGate'`，落点城市 `(320,165)` |
| `palace_grounds` 礼堂／旧堡／东翼／后勤院 | 暂不开放（P2／P3） | `kind:'palaceLocked'` 门牌写清用途与开放批次 |
| `city_castle` 东墙 `(63,10)` | `palace_gallery` | 室内侧是门系统生成的 `indoorExit`（`doorId:'gallery'`） |
| `palace_gallery` 西口 | `city_castle` | `exits` 落点 `(60,10)` + `kind:'indoorEntrance'` |
| `palace_f3` 东墙 `(63,34)` | `palace_terrace` | 室内侧是门系统生成的 `indoorExit`（`doorId:'terrace'`） |
| `palace_terrace` 西口 `(3,13)` | `palace_f3` | `exits` 落点 `(60,34)` + `kind:'indoorEntrance'` |
| 露台／回廊临空边 | — | 栏杆是实心碰撞，**不画假门** |

**关于门的 kind**：室内侧的门交互物一律由 `installIndoorDoors` 生成成 `indoorExit`
（只有 `doorId`，没有 `to`）；`indoorEntrance` 落在**户外那一侧**。
写测试时不能按 `to` 字段找室内侧的门，要按 `MAPS[scene].doors[].doorId` 反查。

**关于落点距离**：对向落点都比门内侧站位再远一格（一层主门落在宫苑 `(60,49)`，门牌在 `(60,47)`），
免得「走出去」紧接着又被门拉回来。

**关于露台的边界**：`installIndoorDoors` 硬性要求门在周边一圈上，所以"露台四边全部 solid"
按字面无法满足——合法出口必须把那一格写成 `solid=0`。真正的验收口径是：
边界实心**除了合法出口**，出口数量有限、每个出口都通向真实可走的场景、且露台没有 `doors` 数组。

### 7.1 `palaceGate`

城市的城堡门原本是 `building()` 生成的 `cityDoor`（`game.js:3153`，`to:'city_castle'`）。
城市 IIFE 跑完后改写这一条：

```js
{ id:'castle', x:320, y:164, stand:[[320,165],[319,164],[321,164]],
  kind:'palaceGate', to:'palace_grounds', tx:60, ty:90, label:'白蔷薇宫城' }
```

`usePalaceGate(it)` 同样先校验站位再 `doSwitchScene`，并且要求已持城市通行证
（进宫苑的唯一入口就在城里，没有理由绕过通行证）。规划 §3 明确"先保留城市主入口、道路与交通落点"，
所以城堡地基坐标、马车停靠 `(320,178)`、前庭全部不动，只是门后通向的东西从王座厅换成宫苑。

## 8. 存档

新增 `state.palace`，**不升 `SCHEMA_VERSION`**（`game.js:1083-1086` 有注释：版本号一变旧档会被判损坏）。

```js
palace: { layoutVersion: 1, discovered: {} }
```

`discovered` **从空开始**：新档的玩家还站在农场，没去过宫城，导览不该替他记上一笔。
只有真正走进某个场景（`notePalaceArrival` 挂在 `doSwitchScene` 上）才写进去。

- `serialize()`（`game.js` 的字段白名单）加 `palace: state.palace`。
- `normalizeSave` 加 `normalizePalace(raw.palace)`，旧档缺字段时补默认值并置 `layoutVersion: 0`。
- **`normalizePalace` 必须幂等**：归一化读一次与读两次要得到同一份数据。
  写的时候要从空 `discovered` 起，只拷贝输入里为 `true` 的键；
  若先填默认再"拷贝输入"，缺省的键会留在默认里，往返一次就凭空多出到访记录。
- **一次性迁移**：旧档没有 `layoutVersion` 时，若玩家停在 `city_castle` 内部，
  把玩家挪到一层安全门厅落点，并置 `layoutVersion=1`。
  任务、好感、供货、已取得许可一律不动——只挪坐标。
- **卡墙兜底**：`normalizeSave` 只钳制边界，不会把卡进墙里的人救出来（`game.js:1044-1051`）。
  宫城任何落点若落在墙或家具上，用 `nearestWalkable(sceneId, x, y)` 拉到最近可走格。
  旧档里 `city_castle` 原本是 34×24，扩到 64×48 后原坐标 `(13,6)`、`(17,7)`、`(25,19)` 仍可走，
  但迁移不能依赖这一点。`onSceneChanged` 里也补一道同样的兜底（半径 3 内找空位对 64×48 的楼层不够）。

## 9. 对外探针（`window.__MOSS__`）

供自动化测试使用，只读状态或调既有函数，不注入数据：

```js
PALACE_FLOORS: [{id,label,sceneId,order}],          // 楼层表，供导航 UI 与测试
palaceFloorOf: function(sceneId),                    // 当前场景属于哪一层（无则 null）
PALACE_STAIRS: [...],                                // 全部楼梯记录
palaceStairFrom: function(sceneId),                  // 该层所有楼梯
```

复用既有探针：`devSwitchScene`（跳场景）、`devInteract(kind)`（按 kind 激活当前场景第一个交互物）、
`hasProp(kind)`、`MAPS`、`INTERACTABLES`、`state`。

## 10. 楼层导航 UI

宫城场景内常驻一枚楼层牌（HUD 芯片 `#floorTag`），点开是楼层导览窗口：列出各层、该层房间与当前层高亮。
楼层导览从芯片进入（查阅），楼梯本身按 E 直接换层，不再多一次窗口点击。
手机横竖屏都要可读可点 —— 复用 `#touch*` 那套常驻按钮的尺寸与断点，不用新的媒体查询。

## 11. 测试分工（文件互不重叠）

| 文件 | 归属 | 断言 | 实跑 |
|---|---|---|---|
| `tests/run-palace-floors.mjs` | 测试组 | 城市门→宫苑→一层→二层→三层→露台→原路返回；双向楼梯不弹回；朝向；每层有可交互内容；管家服务台 | 82 |
| `tests/run-palace-layout.mjs` | 测试组 | `MAPS` 洪水填充：入口落点可达所有门/楼梯/交互物站位；楼梯落点距触发格 ≥3 且反向成对；触发点同带；无孤立区域；露台栏杆是实心碰撞 | 106 |
| `tests/run-palace-save.mjs` | 测试组 | 旧档（无 `palace`、玩家停在 `city_castle`）落到一层门厅；只迁一次；往返两次不变；新档不被挪动 | 25 |
| `tests/run-palace-mobile.mjs` | 测试组 | 390×844 与 844×390 视口下楼层牌可见可读、触屏按钮能换层、导览窗口不溢出、画布点按可触发 | 32 |
| `game.js` / `styles.css` / `index.html` | 我 | 全部实现 | — |

四个文件都进 `tests/run-ci.mjs` 的 BROWSER 层。合计 245 条断言。

## 12. 验收对照（规划 §10）

1. 从原城市入口进入宫苑，能辨认主宫、翼楼、旧堡、后勤院和花园方向 → `palace_grounds` 五区都有可辨识建筑，未开放区写明用途
2. 真实键盘与手机上到二层、三层并下楼，落点与台阶朝向对应，不循环触发 → 楼梯契约 §6.1 保证落点距触发格 ≥3（实测 12～13）并设置朝向
3. 同层房门、回廊、内庭连续可走；楼上不穿栏杆落到虚空 → 三层洪水填充 100% 连通；露台栏杆是实心碰撞，无假门
4. 每个已开放层至少一个可交互房间或生活事务 → 每层 4 个 `cityService` / `interiorProp`，各带可读文案
5. 管家与既有城堡委托可找，已领奖励不重复，旧档不卡在墙里 → 事务台迁到一层（`service:'castle'` 保留，蔷薇春宴任务仍可交）+ §8 迁移
6. 后勤货门到厨房再到备餐间 → **P2**，本批不开通，服务梯门牌写明未开放
7. 手机横竖屏门牌、楼梯按钮、楼层导航可读可点 → §10 与 `run-palace-mobile.mjs`（32 条全绿）
8. 单文件版与正常入口都完成进出、跨层、读档验证 → `run-palace-floors.mjs` 对源码与打包版跑同一套断言
