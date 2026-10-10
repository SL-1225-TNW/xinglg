# 功能状态表

> 本文由 `node tests/build-status-doc.mjs` 从 `game.js` 的实际注册信息生成，**不要手改**。
> 手写"已实现"清单必然会和代码漂移——本轮之前就发生过（README 一处说葡萄园待开放，另一处说已接入）。

生成时间基线：见文末「口径说明」。

## 一、地图区域（M 地图上的标记）

共 **12** 个区域标记：苔芽农场、芽芽小镇、溪畔河湾、石楠草甸、金叶葡萄园、雾杉森林、白蔷薇城、云峰山口、古道遗址、邻领边城、旧矿山、风铃磨坊与麦田村。

| 区域 | 场景 id | 状态取值来源 |
|---|---|---|
| 苔芽农场 | `farm` | `worldRegionStatus()` |
| 芽芽小镇 | `town` | `worldRegionStatus()` |
| 溪畔河湾 | `riverside` | `worldRegionStatus()` |
| 石楠草甸 | `heath` | `worldRegionStatus()` |
| 金叶葡萄园 | `vineyard` | `worldRegionStatus()` |
| 雾杉森林 | `forest` | `worldRegionStatus()` |
| 白蔷薇城 | `city` | `worldRegionStatus()` |
| 云峰山口 | `cloud` | `worldRegionStatus()` |
| 古道遗址 | `oldroad` | `worldRegionStatus()` |
| 邻领边城 | `border` | `worldRegionStatus()` |
| 旧矿山 | `pass` | `worldRegionStatus()` |
| 风铃磨坊与麦田村 | `mill` | `worldRegionStatus()` |

## 二、独立可玩地点（`extendedMap` 场景）

共 **10** 个。这些不在 M 地图上单列，而是从所属区域的门进入，
首次步行到访后自动登记为公共传送节点。

| 地点 | 场景 id | 工作台 | 门 | 配套室内 |
|---|---|---:|---:|---:|
| 芦苇湿地与观测栈道 | `wetland` | 0 | 0 | 2 |
| 金叶葡萄园与乡村庄园 | `vineyard` | 0 | 0 | 3 |
| 白鸢修道院与医舍 | `clinic` | 0 | 0 | 3 |
| 下游河港与船闸 | `port` | 0 | 0 | 3 |
| 石灰采场与材料工地 | `quarry` | 0 | 0 | 2 |
| 水库堤坝与水利站 | `waterworks` | 0 | 0 | 2 |
| 云峰山口 | `cloud_pass` | 0 | 0 | 1 |
| 云峰边境营地 | `border_camp` | 0 | 0 | 1 |
| 古道遗址调查区 | `old_road` | 0 | 0 | 1 |
| 北境邻领边城 | `neighbor_border` | 0 | 0 | 0 |

## 三、内建场景（`MAPS.*`）

| 场景 | 用途 |
|---|---|
| `farm` | 主地图区域 |
| `town` | 主地图区域 |
| `riverside` | 主地图区域 |
| `house` | 主地图区域 |
| `millroom` | 阶段 C 真实内部 |
| `vetroom` | 阶段 C 真实内部 |
| `city` | 主地图区域 |

另有两处农舍式室内（`wetland_observation`、`vineyard_press`、`vineyard_cellar`、`clinic_ward`、`clinic_archive`、`port_office`、`port_lockhouse`、`quarry_shed`、`waterworks_control`、`border_barracks`、`border_depot`、`oldroad_survey`、`neighbor_office`、`neighbor_exchange`）由 `addExtendedRoom` 生成。

## 四、公共传送节点

| 节点 id | 稳定地点 ID | 场景 |
|---|---|---|
| `wetland.marsh` | `white_rose.southwest.reed_marsh` | `wetland` |
| `vineyard.estate` | `white_rose.north.hillside_vineyard` | `vineyard` |
| `clinic.white_stork` | `white_rose.highland.white_stork_clinic` | `clinic` |
| `port.lower_lock` | `white_rose.southwest.lower_river_port` | `port` |
| `quarry.limestone` | `white_rose.northeast.limestone_quarry` | `quarry` |
| `waterworks.reservoir` | `white_rose.southeast.waterworks_station` | `waterworks` |
| `pass.cloud_peak` | `white_rose.northeast.cloud_peak_pass` | `cloud_pass` |
| `camp.frontier` | `white_rose.northeast.frontier_camp` | `border_camp` |
| `road.ancient` | `white_rose.border.ancient_road` | `old_road` |
| `neighbor.market_town` | `neighbor.north.frontier_market_town` | `neighbor_border` |

## 五、仍属规划、尚未实现

以下是总规里写明、但当前代码中**没有**实现的。不要在文档里把它们写成可玩：

- 五属性上限与天赋加点
- 新年历（四季 × 28 天 = 112 天/年）
- 完整职业晋升链与任期
- 银行家路线与金融账本
- 军队招募／装备采购的完整合同流程
- 十九世纪技术氛围与刀剑的设定说明

## 六、已知口径陷阱

合并 `main` 之后，`game.js` 里同时存在**两套军事等级取值**，写代码时务必看清用的是哪一套：

| 表 | 取值 | 用途 |
|---|---|---|
| `MIL_RANKS` | `civilian`/`trainee`/`member`/`squad`/`captain`/`regional`/`marshal` | 阶段 E 裁判与权限分级 |
| `militaryLife.rank` | `resident`/`patrol`/`squad_leader`/`captain`/`field_commander` | 云峰边境营地实机流程 |

两者职级名不同，判断指挥权要读 `militaryLife`，不要读 `MIL_RANKS`。

## 口径说明

- M 地图区域标记：12 个
- 独立可玩地点（extendedMap）：10 个
- 内建场景（MAPS.*）：7 个
- 公共传送节点（extended）：10 个

「可进入的地点总数」= 内建场景 + 独立地点 + 矿层 + 农舍室内，
与 M 地图标记数不是同一个口径，引用时必须说清是哪一种。