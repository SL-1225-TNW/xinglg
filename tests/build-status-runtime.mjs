import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {launch,boot} from './harness.mjs';
const run=await launch();
let snapshot;
try {
  await boot(run.page);
  snapshot=await run.page.evaluate(()=>({
    regions:__MOSS__.registeredRegions(),nodes:__MOSS__.travelNodes,
    scenes:Object.entries(__MOSS__.MAPS).map(([id,map])=>({id,name:map.name||id,
      interactions:(__MOSS__.INTERACTABLES[id]||[]).length,
      doors:(__MOSS__.INTERACTABLES[id]||[]).filter(x=>x.to&&__MOSS__.MAPS[x.to]).length}))
  }));
  if(run.errors.length)throw new Error(run.errors.join('\n'));
}finally{await run.browser.close();}
const lines=['# 功能状态表','','由 `node tests/build-status-doc.mjs` 启动游戏后读取最终注册表生成。需要 Playwright 与 Chromium。',
  '注册数不等于新档可进入数；入口条件、存档迁移和任务深度须另行验收。','','## 最终地图标记',
  '',`共 ${snapshot.regions.length} 个；这里是地图标记 ID，不是场景 ID。`,'','| 标记 ID | 名称 |','|---|---|',
  ...snapshot.regions.map(r=>`| ${r.id} | ${r.name} |`),'','## 已注册场景','','| 场景 ID | 名称 | 交互对象 | 指向已注册场景的门／出口对象 |','|---|---|---:|---:|',
  ...snapshot.scenes.map(s=>`| ${s.id} | ${s.name} | ${s.interactions} | ${s.doors} |`),
  '','门／出口只统计交互对象的 to 引用；不包含地图边缘 exits，不能据此判断是否可达。',
  '','## 公共传送节点','','| 节点 ID | 名称 | 场景 ID |','|---|---|---|',
  ...snapshot.nodes.map(n=>`| ${n.id} | ${n.name} | ${n.sceneId} |`),
  '','## 玩法验收边界（人工审阅）','',
  '- 工程师：签署、事故两分支、任职、一次预算和说明会已有界面回归；施工委托尚未实现，事故目前为即时脚本事件。',
  '- 替代路线：小镇任务板 →「小镇入门」提供公共水泵维修、本地货单交付、林缘安全调查；三条均有独立自然新档验收，不依赖修桥、湿地、城门证或边境巡防。完成只给到访引荐，军事委任与指挥权另行取得。',
  '- 军队招募和装备合同已有首轮玩法；账本以 militaryLife.core 和 institution 为准，旧职级字段是兼容视图。',
  '- 角色常驻入口已交付：顶栏「角色」、键盘 P、手机按钮与暂停菜单都能打开，属性/天赋/武器/经历四页始终可查看。R1 已接上角色等级、五属性、经验发放、属性点分配、洗点与首批天赋（节省力气、均衡饮食真实生效）；个人刀剑及其装备/升级/战斗界面仍待实施；军需装备合同不是个人武器系统。',
  '- 角色经验首批只开放到 10 级，达到后暂停发放；旧档首次迁移给等级 1、基础各 5 与未分配创建点 10，不按历史天数补发。证据见 [R0](r0-entry-and-honest-status.md) 与 [R1](r1-character-growth.md)。',
  '- 新年历、长期照料委托、完整职业任期和银行家金融系统仍待实施。',
  '- 室内门已统一配置；具体门洞、通行与双入口验收见 docs/indoor-doors-plan.md。',
  '- 当前唯一总规为 [第八版](../游戏总体规划.md)，按 R0—R5 实施；旧 A—E 只表示历史地区批次。',
  '- 当前玩家视角与证据边界见 [2026-10-12 审查](player-review-20261012.md)，历史接手审查见 takeover-review-2026-10-11.md。',''];
fs.writeFileSync(fileURLToPath(new URL('../docs/feature-status.md',import.meta.url)),lines.join('\n'));
console.log(`运行时盘点：地图 ${snapshot.regions.length}；场景 ${snapshot.scenes.length}；传送节点 ${snapshot.nodes.length}`);
