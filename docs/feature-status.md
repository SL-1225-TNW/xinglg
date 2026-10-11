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
| town | 小镇 | 10 | 0 |
| riverside | 河边 | 3 | 0 |
| forest | 雾杉森林 | 4 | 0 |
| mine1 | 旧矿山 · 第 1 层 | 2 | 0 |
| mine2 | 旧矿山 · 第 2 层 | 5 | 0 |
| mine3 | 旧矿山 · 第 3 层 | 1 | 0 |
| house | 农舍 | 5 | 0 |
| city_castle | 白蔷薇城堡 | 1 | 0 |
| city_library | 蔷薇图书馆 | 1 | 0 |
| city_academy | 河岸学院 | 1 | 0 |
| city_greenhouse | 蔷薇温室 | 1 | 0 |
| city_bakery | 暖炉面包房 | 1 | 0 |
| city_market | 城市商会 | 1 | 0 |
| city_tailor | 丝带裁缝铺 | 1 | 0 |
| city_bandstand | 蔷薇音乐亭 | 1 | 0 |
| city_teahouse | 公园茶亭 | 1 | 0 |
| city_keeper | 园丁小屋 | 1 | 0 |
| city_cafe | 河岸茶室 | 1 | 0 |
| city_smith | 白蔷薇铁匠铺 | 1 | 0 |
| city_hall | 居民议事厅 | 1 | 0 |
| city_inn | 南门旅馆 | 1 | 0 |
| city_post | 驿站邮局 | 1 | 0 |
| city_carriage | 南门马车站 | 1 | 0 |
| city_stable | 南门马厩 | 1 | 0 |
| city_quay_store | 河岸长条货仓 | 1 | 0 |
| city_sawmill | 东岸锯木厂 | 1 | 0 |
| city_foundry | 白蔷薇铸造车间 | 1 | 0 |
| city_watermill | 河湾水力磨坊 | 1 | 0 |
| city_boiler | 厂区锅炉房 | 1 | 0 |
| city_shipyard | 船具修理棚 | 1 | 0 |
| city_uni_main | 白蔷薇大学主楼 | 1 | 0 |
| city_uni_wing | 大学教学楼 | 1 | 0 |
| city_uni_lab | 自然史实验楼 | 1 | 0 |
| city_uni_dorm | 学生宿舍院 | 1 | 0 |
| city_bank | 白蔷薇国立银行 | 1 | 0 |
| city_exchange | 谷物交易所 | 1 | 0 |
| city_gold | 金库与票据所 | 1 | 0 |
| city_market_hall | 中央市场大厅 | 1 | 0 |
| city_townhall | 市政厅 | 1 | 0 |
| city_home1 | 蔷薇街 1 号 | 1 | 0 |
| city_home2 | 蔷薇街 2 号 | 1 | 0 |
| city_home3 | 蔷薇街 3 号 | 1 | 0 |
| city_home4 | 蔷薇街 4 号 | 1 | 0 |
| city_home5 | 蔷薇街 5 号 | 1 | 0 |
| city_home6 | 蔷薇街 6 号 | 1 | 0 |
| city_home7 | 蔷薇街 7 号 | 1 | 0 |
| city_home8 | 蔷薇街 8 号 | 1 | 0 |
| city_home9 | 蔷薇街 9 号 | 1 | 0 |
| city_home10 | 蔷薇街 10 号 | 1 | 0 |
| city_home11 | 蔷薇街 11 号 | 1 | 0 |
| city_home12 | 蔷薇街 12 号 | 1 | 0 |
| city_home13 | 蔷薇街 13 号 | 1 | 0 |
| city_home14 | 蔷薇街 14 号 | 1 | 0 |
| city_home15 | 蔷薇街 15 号 | 1 | 0 |
| city_home16 | 蔷薇街 16 号 | 1 | 0 |
| city_home17 | 蔷薇街 17 号 | 1 | 0 |
| city_home18 | 蔷薇街 18 号 | 1 | 0 |
| city_home19 | 蔷薇街 19 号 | 1 | 0 |
| city_home20 | 蔷薇街 20 号 | 1 | 0 |
| city_home21 | 蔷薇街 21 号 | 1 | 0 |
| city_home22 | 蔷薇街 22 号 | 1 | 0 |
| city_home23 | 蔷薇街 23 号 | 1 | 0 |
| city_home24 | 蔷薇街 24 号 | 1 | 0 |
| city | 白蔷薇城 | 56 | 56 |
| mill_village | 风铃磨坊与麦田村 | 8 | 3 |
| mill_workshop | 风铃磨坊 · 机房 | 2 | 0 |
| mill_bakery | 麦田村 · 面包房 | 2 | 0 |
| mill_hall | 麦田村 · 议事屋 | 1 | 0 |
| meadow | 石楠草甸与牧场 | 9 | 2 |
| meadow_barn | 石楠牧场 · 畜棚与工作间 | 1 | 0 |
| meadow_vet | 石楠草甸 · 兽医小屋 | 1 | 0 |
| wetland | 芦苇湿地与观测栈道 | 5 | 1 |
| wetland_observation | 芦苇湿地 · 观测屋 | 2 | 0 |
| vineyard | 金叶葡萄园与乡村庄园 | 3 | 2 |
| clinic | 白鸢修道院与医舍 | 2 | 2 |
| port | 下游河港与船闸 | 2 | 2 |
| quarry | 石灰采场与材料工地 | 2 | 1 |
| waterworks | 水库堤坝与水利站 | 2 | 1 |
| vineyard_press | 金叶庄园 · 压榨房 | 1 | 0 |
| vineyard_cellar | 金叶庄园 · 酒窖与储藏室 | 1 | 0 |
| clinic_ward | 白鸢医舍 · 诊疗室 | 1 | 0 |
| clinic_archive | 白鸢修道院 · 档案室 | 1 | 0 |
| port_office | 下游河港 · 船务屋 | 1 | 0 |
| port_lockhouse | 河港船闸 · 值守室 | 2 | 0 |
| quarry_shed | 石灰采场 · 测量与石料棚 | 1 | 0 |
| waterworks_control | 水利站 · 闸门控制室 | 1 | 0 |
| cloud_pass | 云峰山口 | 3 | 0 |
| border_camp | 云峰边境营地 | 3 | 2 |
| old_road | 古道遗址调查区 | 3 | 1 |
| neighbor_border | 北境邻领边城 | 3 | 2 |
| border_barracks | 云峰营地 · 值守与指挥室 | 4 | 0 |
| border_depot | 云峰营地 · 军需库 | 3 | 0 |
| oldroad_survey | 古道遗址 · 调查站 | 1 | 0 |
| neighbor_office | 北境边城 · 领地联络处 | 1 | 0 |
| neighbor_exchange | 北境边城 · 互市行栈 | 1 | 0 |

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

## 玩法验收边界（人工审阅）

- 工程师：签署、事故两分支、任职、一次预算和说明会已有界面回归；施工委托尚未实现，事故目前为即时脚本事件。
- 替代路线：授权分层与读档已测试；巡林入门仍循环依赖边境巡防，商旅首个事件仍依赖湿地开放河港。尚不能宣称三条路线均可独立从新档走通。
- 军队招募和装备合同已有首轮玩法；账本以 militaryLife.core 和 institution 为准，旧职级字段是兼容视图。
- 五属性、天赋、新年历、完整职业任期和银行家金融系统仍待实施。
- 详细接手审查与后续顺序见 docs/takeover-review-2026-10-11.md。
