# 功能状态表

由 `node tests/build-status-doc.mjs` 启动游戏后读取最终注册表生成。需要 Playwright 与 Chromium。
注册数不等于新档可进入数；入口条件、存档迁移和任务深度须另行验收。

## 最终地图标记

共 18 个；这里是地图标记 ID，不是场景 ID。

| 标记 ID | 名称 |
|---|---|
| farm | 苔芽农场 |
| town | 芽芽小镇 |
| riverside | 溪畔河湾 |
| vineyard | 金叶葡萄园 |
| forest | 雾杉森林 |
| city | 白蔷薇城 |
| pass | 旧矿山 |
| mill | 风铃磨坊与麦田村 |
| meadow | 石楠草甸 |
| wetland | 芦苇湿地 |
| clinic | 白鸢医舍 |
| port | 下游河港 |
| quarry | 石灰采场 |
| waterworks | 水利站 |
| cloud_pass | 云峰山口 |
| border_camp | 边境营地 |
| old_road | 古道遗址 |
| neighbor | 北境邻领边城 |

## 已注册场景

| 场景 ID | 名称 | 交互对象 | 指向已注册场景的门／出口对象 |
|---|---|---:|---:|
| farm | 农场 | 2 | 0 |
| town | 小镇 | 11 | 0 |
| riverside | 河边 | 3 | 0 |
| forest | 雾杉森林 | 4 | 0 |
| mine1 | 旧矿山 · 第 1 层 | 3 | 0 |
| mine2 | 旧矿山 · 第 2 层 | 5 | 0 |
| mine3 | 旧矿山 · 第 3 层 | 1 | 0 |
| house | 农舍 | 6 | 0 |
| city_castle | 白蔷薇宫城 · 二层 王座厅 | 7 | 2 |
| city_library | 蔷薇图书馆 | 2 | 0 |
| city_academy | 河岸学院 | 2 | 0 |
| city_greenhouse | 蔷薇温室 | 2 | 0 |
| city_bakery | 暖炉面包房 | 2 | 0 |
| city_market | 城市商会 | 2 | 0 |
| city_tailor | 丝带裁缝铺 | 2 | 0 |
| city_bandstand | 蔷薇音乐亭 | 2 | 0 |
| city_teahouse | 公园茶亭 | 2 | 0 |
| city_keeper | 园丁小屋 | 2 | 0 |
| city_cafe | 河岸茶室 | 2 | 0 |
| city_smith | 白蔷薇铁匠铺 | 2 | 0 |
| city_hall | 居民议事厅 | 2 | 0 |
| city_inn | 南门旅馆 | 2 | 0 |
| city_post | 驿站邮局 | 2 | 0 |
| city_carriage | 南门马车站 | 2 | 0 |
| city_stable | 南门马厩 | 2 | 0 |
| city_quay_store | 河岸长条货仓 | 2 | 0 |
| city_sawmill | 东岸锯木厂 | 2 | 0 |
| city_foundry | 白蔷薇铸造车间 | 2 | 0 |
| city_watermill | 河湾水力磨坊 | 2 | 0 |
| city_boiler | 厂区锅炉房 | 2 | 0 |
| city_shipyard | 船具修理棚 | 2 | 0 |
| city_uni_main | 白蔷薇大学主楼 | 2 | 0 |
| city_uni_wing | 大学教学楼 | 2 | 0 |
| city_uni_lab | 自然史实验楼 | 2 | 0 |
| city_uni_dorm | 学生宿舍院 | 2 | 0 |
| city_bank | 白蔷薇国立银行 | 2 | 0 |
| city_exchange | 谷物交易所 | 2 | 0 |
| city_gold | 金库与票据所 | 2 | 0 |
| city_market_hall | 中央市场大厅 | 2 | 0 |
| city_townhall | 市政厅 | 2 | 0 |
| city_home1 | 蔷薇街 1 号 | 2 | 0 |
| city_home2 | 蔷薇街 2 号 | 2 | 0 |
| city_home3 | 蔷薇街 3 号 | 2 | 0 |
| city_home4 | 蔷薇街 4 号 | 2 | 0 |
| city_home5 | 蔷薇街 5 号 | 2 | 0 |
| city_home6 | 蔷薇街 6 号 | 2 | 0 |
| city_home7 | 蔷薇街 7 号 | 2 | 0 |
| city_home8 | 蔷薇街 8 号 | 2 | 0 |
| city_home9 | 蔷薇街 9 号 | 2 | 0 |
| city_home10 | 蔷薇街 10 号 | 2 | 0 |
| city_home11 | 蔷薇街 11 号 | 2 | 0 |
| city_home12 | 蔷薇街 12 号 | 2 | 0 |
| city_home13 | 蔷薇街 13 号 | 2 | 0 |
| city_home14 | 蔷薇街 14 号 | 2 | 0 |
| city_home15 | 蔷薇街 15 号 | 2 | 0 |
| city_home16 | 蔷薇街 16 号 | 2 | 0 |
| city_home17 | 蔷薇街 17 号 | 2 | 0 |
| city_home18 | 蔷薇街 18 号 | 2 | 0 |
| city_home19 | 蔷薇街 19 号 | 2 | 0 |
| city_home20 | 蔷薇街 20 号 | 2 | 0 |
| city_home21 | 蔷薇街 21 号 | 2 | 0 |
| city_home22 | 蔷薇街 22 号 | 2 | 0 |
| city_home23 | 蔷薇街 23 号 | 2 | 0 |
| city_home24 | 蔷薇街 24 号 | 2 | 0 |
| city | 白蔷薇城 | 56 | 56 |
| mill_village | 风铃磨坊与麦田村 | 9 | 4 |
| mill_workshop | 风铃磨坊 · 机房 | 4 | 0 |
| mill_bakery | 麦田村 · 面包房 | 3 | 0 |
| mill_hall | 麦田村 · 议事屋 | 2 | 0 |
| meadow | 石楠草甸与牧场 | 9 | 2 |
| meadow_barn | 石楠牧场 · 畜棚与工作间 | 2 | 0 |
| meadow_vet | 石楠草甸 · 兽医小屋 | 2 | 0 |
| wetland | 芦苇湿地与观测栈道 | 5 | 1 |
| wetland_observation | 芦苇湿地 · 观测屋 | 3 | 0 |
| vineyard | 金叶葡萄园与乡村庄园 | 3 | 2 |
| clinic | 白鸢修道院与医舍 | 2 | 2 |
| port | 下游河港与船闸 | 2 | 2 |
| quarry | 石灰采场与材料工地 | 2 | 1 |
| waterworks | 水库堤坝与水利站 | 5 | 1 |
| vineyard_press | 金叶庄园 · 压榨房 | 2 | 0 |
| vineyard_cellar | 金叶庄园 · 酒窖与储藏室 | 2 | 0 |
| clinic_ward | 白鸢医舍 · 诊疗室 | 2 | 0 |
| clinic_archive | 白鸢修道院 · 档案室 | 2 | 0 |
| port_office | 下游河港 · 船务屋 | 2 | 0 |
| port_lockhouse | 河港船闸 · 值守室 | 3 | 0 |
| quarry_shed | 石灰采场 · 测量与石料棚 | 2 | 0 |
| waterworks_control | 水利站 · 闸门控制室 | 2 | 0 |
| cloud_pass | 云峰山口 | 3 | 0 |
| border_camp | 云峰边境营地 | 3 | 2 |
| old_road | 古道遗址调查区 | 3 | 1 |
| neighbor_border | 北境邻领边城 | 3 | 2 |
| border_barracks | 云峰营地 · 值守与指挥室 | 5 | 0 |
| border_depot | 云峰营地 · 军需库 | 4 | 0 |
| oldroad_survey | 古道遗址 · 调查站 | 2 | 0 |
| neighbor_office | 北境边城 · 领地联络处 | 2 | 0 |
| neighbor_exchange | 北境边城 · 互市行栈 | 2 | 0 |
| palace_grounds | 白蔷薇宫苑 | 6 | 2 |
| palace_gallery | 白蔷薇宫城 · 二层 回廊 | 2 | 1 |
| palace_terrace | 白蔷薇宫城 · 翼楼露台 | 3 | 1 |
| palace_f1 | 白蔷薇宫城 · 一层 门厅 | 6 | 1 |
| palace_f3 | 白蔷薇宫城 · 三层 起居 | 6 | 1 |
| r2_training | 小镇安全训练场 | 1 | 0 |
| r2_hollow | 旧矿山 · 自愿危险支路 | 1 | 0 |

门／出口只统计交互对象的 to 引用；不包含地图边缘 exits，不能据此判断是否可达。

## 公共传送节点

| 节点 ID | 名称 | 场景 ID |
|---|---|---|
| farm.home | 苔芽农场 | farm |
| town.square | 芽芽小镇 | town |
| riverside.bank | 溪畔河湾 | riverside |
| forest.gate | 雾杉森林 | forest |
| mine.entrance | 旧矿山 | mine1 |
| city.gate | 白蔷薇城 | city |
| mill.village | 风铃磨坊与麦田村 | mill_village |
| meadow.pasture | 石楠草甸与牧场 | meadow |
| wetland.marsh | 芦苇湿地 | wetland |
| vineyard.estate | 金叶葡萄园 | vineyard |
| clinic.white_stork | 白鸢修道院与医舍 | clinic |
| port.lower_lock | 下游河港与船闸 | port |
| quarry.limestone | 石灰采场与材料工地 | quarry |
| waterworks.reservoir | 水库堤坝与水利站 | waterworks |
| pass.cloud_peak | 云峰山口 | cloud_pass |
| camp.frontier | 边境营地 | border_camp |
| road.ancient | 古道遗址调查区 | old_road |
| neighbor.market_town | 北境邻领边城 | neighbor_border |
| castle.palace | 白蔷薇宫城 | palace_grounds |

## 玩法验收边界（人工审阅）

- 工程师：勘测→认证→方案→材料→施工（亲自／委托共用同一份进度）→跨日试运行→验收已走通真实按钮；试运行有高风险预警、现场预防与漏检后的应急控水／补修／隔夜复查。岗位评价有两条来源（汛前预防加固或旧事故处置），存档不再强制先出事。验收后的养护是 3 天周期的岗位责任，显示下次检视日、工作范围与联系人，评价按周期结算，支持延期（封顶 3 次）、交接与退出；交班不清掉未处理的安全事件。完整任期与行政权留待 R5。
- R3-D 湿地／河湾水位复查：观察屋记录台新增「水位复查」入口，仅在许可、原因查明与栖息地修复三件事都完成后才开放；登记只写一次，普通调查路线始终可用，辨迹／识矿路线只在已学天赋时显示，但普通路线已能完整走完，不强迫学习；面板只读工程与湿地已存事实，未验收时显式说明「工程尚未验收；水位变化以湿地栖息地事实为准」，不会把水位改善归功于工程。证据见 [`tests/run-r3-wetland-recheck.mjs`](../tests/run-r3-wetland-recheck.mjs) 42 项与 [下一步待办](下一步待办清单.md)。
- R3-D 风铃磨坊工程养护复核：风铃磨坊机房 (15,11) 新增「马丁的工程养护复核」入口，与水利控制室、河港面板、船闸值守室共用同一份事实；六种状态（未到期 / 到期 / 逾期 / 延期 / 交接 / 退出）都能直接看到；沿用既有 3 天养护周期与评价上限，不再造周期、不再发奖；河港面板与船闸值守室只复读，不挂按钮；今日安排与项目手册都挂出独立入口，玩家不必靠测试脚本去找。证据见 [`tests/run-r3-mill-duty.mjs`](../tests/run-r3-mill-duty.mjs) 57 项（源码 / 单文件版各一轮）。
- R4 第一块：四季年历单源派生。`SEASONS=[春,夏,秋,冬]`、`DAYS_PER_SEASON=28`、`DAYS_PER_YEAR=112`；HUD 显示「N 年 X 季 第 D 天（总第 M 天）」并按季节染色；旧档 `totalDay` 单源派生，不动一行，归一化往返幂等。证据见 [`tests/run-r4-calendar.mjs`](../tests/run-r4-calendar.mjs) 18 项（源码 / 单文件版各一轮）。
- R4 第二块：农场照料委托。`state.farmCare` 状态 + `bookFarmCare / cancelFarmCare / applyFarmCareTick` 三件套；预约一次性扣款、跨日结算、缺料只增 `shortageDays`、取消按剩余天数退款、已结算日不抹除；`openFarmCarePanel` 给 3/5/7/10/14 天材料与费用预览；`serialize + normalizeFarmCare` 双向闭环。证据见 [`tests/run-r4-farm-care.mjs`](../tests/run-r4-farm-care.mjs) 46 项（源码 / 单文件版各一轮）。
- R4 第三块：3／7 天农场计划。`state.farmPlan` 状态 + `bookFarmPlan(3|7)` 一次性扣 6 金/天；`applyFarmPlanTick` 由 settle 在跨日时推进；`pausedDays` 在关键事件（雨）到来时只增不增 `deliveredDays`；`resumePlanToday` 让玩家主动把暂停的当天重新结算；`serialize + normalizeFarmPlan` 双向闭环。证据见 [`tests/run-r4-farm-plan.mjs`](../tests/run-r4-farm-plan.mjs) 36 项（源码 / 单文件版各一轮）。
- 替代路线：小镇任务板 →「小镇入门」提供公共水泵维修、本地货单交付、林缘安全调查；三条均有独立自然新档验收，不依赖修桥、湿地、城门证或边境巡防。完成只给到访引荐，军事委任与指挥权另行取得。
- 军队招募和装备合同已有首轮玩法；账本以 militaryLife.core 和 institution 为准，旧职级字段是兼容视图。
- 角色常驻入口已交付：顶栏「角色」、键盘 P、手机按钮与暂停菜单都能打开，属性/天赋/武器/经历四页始终可查看。R1 已接上角色等级、五属性、经验发放、属性点分配、洗点；R2 已接上十个入门天赋、免费试刀试剑、独立装备与旧/铜/铁/精钢升级、两段可同奖绕行的个人遭遇。军需装备合同不属于个人武器系统。
- 角色经验首批只开放到 10 级，达到后暂停发放；旧档首次迁移给等级 1、基础各 5 与未分配创建点 10，不按历史天数补发。证据见 [R0](r0-entry-and-honest-status.md)、[R1](r1-character-growth.md) 与 [R2](r2-personal-weapons.md)。
- 新年历、长期照料委托、完整职业任期和银行家金融系统仍待实施。
- 室内门已统一配置；具体门洞、通行与双入口验收见 docs/indoor-doors-plan.md。
- 当前唯一总规为 [第八版](../游戏总体规划.md)，按 R0—R5 实施；旧 A—E 只表示历史地区批次。
- 当前玩家视角与证据边界见 [2026-10-12 审查](player-review-20261012.md)，历史接手审查见 takeover-review-2026-10-11.md。
