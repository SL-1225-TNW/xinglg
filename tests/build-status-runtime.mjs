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
/* 这张表由运行时注册信息生成，但「接手状态」那一行和「玩法验收边界」整节是人工维护的
   交付记录（R4／R5 的专项项数与证据链接都在里面）。重跑生成器时原样保留，否则一次
   重新生成就会把验收证据抹掉——那不叫同步文档。 */
const OUT = fileURLToPath(new URL('../docs/feature-status.md', import.meta.url));
const TAIL_MARK = '## 玩法验收边界（人工审阅）';
const DEFAULT_TAIL = [
  TAIL_MARK, '',
  '- 这一节由人工维护，列出已验收的玩法边界与对应专项；重跑 `node tests/build-status-doc.mjs` 会原样保留。',
  ''
].join('\n');
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
const statusLine = prev.split('\n').slice(1, 6).find(l => /^\d{4}-\d{2}-\d{2} /.test(l)) || '';
const tailIdx = prev.indexOf(TAIL_MARK);
const tail = (tailIdx >= 0 ? prev.slice(tailIdx) : DEFAULT_TAIL).replace(/\s*$/, '\n');
const lines = ['# 功能状态表', '', ...(statusLine ? [statusLine, ''] : []),
  '由 `node tests/build-status-doc.mjs` 启动游戏后读取最终注册表生成。需要 Playwright 与 Chromium。',
  '注册数不等于新档可进入数；入口条件、存档迁移和任务深度须另行验收。','','## 最终地图标记',
  '',`共 ${snapshot.regions.length} 个；这里是地图标记 ID，不是场景 ID。`,'','| 标记 ID | 名称 |','|---|---|',
  ...snapshot.regions.map(r=>`| ${r.id} | ${r.name} |`),'','## 已注册场景','','| 场景 ID | 名称 | 交互对象 | 指向已注册场景的门／出口对象 |','|---|---|---:|---:|',
  ...snapshot.scenes.map(s=>`| ${s.id} | ${s.name} | ${s.interactions} | ${s.doors} |`),
  '','门／出口只统计交互对象的 to 引用；不包含地图边缘 exits，不能据此判断是否可达。',
  '','## 公共传送节点','','| 节点 ID | 名称 | 场景 ID |','|---|---|---|',
  ...snapshot.nodes.map(n=>`| ${n.id} | ${n.name} | ${n.sceneId} |`),
  '', tail];
fs.writeFileSync(OUT, lines.join('\n'));
console.log(`运行时盘点：地图 ${snapshot.regions.length}；场景 ${snapshot.scenes.length}；传送节点 ${snapshot.nodes.length}`);
