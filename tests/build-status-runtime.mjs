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
  '- 替代路线：授权分层与读档已测试；巡林入门仍循环依赖边境巡防，商旅首个事件仍依赖湿地开放河港。尚不能宣称三条路线均可独立从新档走通。',
  '- 军队招募和装备合同已有首轮玩法；账本以 militaryLife.core 和 institution 为准，旧职级字段是兼容视图。',
  '- 五属性、天赋、新年历、完整职业任期和银行家金融系统仍待实施。',
  '- 详细接手审查与后续顺序见 docs/takeover-review-2026-10-11.md。',''];
fs.writeFileSync(fileURLToPath(new URL('../docs/feature-status.md',import.meta.url)),lines.join('\n'));
console.log(`运行时盘点：地图 ${snapshot.regions.length}；场景 ${snapshot.scenes.length}；传送节点 ${snapshot.nodes.length}`);
