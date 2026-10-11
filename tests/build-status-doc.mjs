/* 生成功能状态表：从 game.js 的实际注册信息读出，不手写，避免再次漂移。
   用法：node tests/build-status-doc.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const s = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

const regions = [...s.match(/var WORLD_REGIONS = \[([\s\S]*?)\n\];/)[1].matchAll(/\{id:'([\w_]+)',name:'([^']+)'/g)]
  .map(m => ({ id: m[1], name: m[2] }));

const extended = [...s.matchAll(/extendedMap\('(\w+)',\s*'([^']+)'/g)].map(m => ({ id: m[1], name: m[2] }));
const nodes = [...s.matchAll(/addExtendedNode\('([\w.]+)',\s*'([^']+)',\s*'(\w+)'/g)]
  .map(m => ({ node: m[1], loc: m[2], scene: m[3] }));
const base = [...s.matchAll(/^MAPS\.(\w+) = /gm)].map(m => m[1]);
const interiors = [...s.matchAll(/addExtendedRoom\('(\w+)'/g)].map(m => m[1]);

// 每个 extended 地点的交互点与真实室内
function bodyOf(id) {
  const i = s.indexOf(`extendedMap('${id}'`);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '(') { d++; started = true; }
    else if (s[k] === ')') { d--; if (started && d === 0) return s.slice(i, k + 1); }
  }
  return '';
}
const rows = extended.map(e => {
  const body = bodyOf(e.id);
  const sites = (body.match(/extendedSite\(/g) || []).length;
  const doors = (body.match(/extendedDoor\(/g) || []).length;
  const rooms = [...s.matchAll(new RegExp(`EXTENDED_REGION_BY_SCENE\\.(\\w+?)='${e.id}'`, 'g'))].map(m => m[1]);
  return { ...e, sites, doors, rooms: rooms.length };
});

const L = [];
L.push('# 功能状态表');
L.push('');
L.push('> 本文由 `node tests/build-status-doc.mjs` 从 `game.js` 的实际注册信息生成，**不要手改**。');
L.push('> 手写"已实现"清单必然会和代码漂移——本轮之前就发生过（README 一处说葡萄园待开放，另一处说已接入）。');
L.push('');
L.push('生成时间基线：见文末「口径说明」。');
L.push('');
L.push('## 一、地图区域（M 地图上的标记）');
L.push('');
L.push(`共 **${regions.length}** 个区域标记：${regions.map(r => r.name).join('、')}。`);
L.push('');
L.push('| 区域 | 场景 id | 状态取值来源 |');
L.push('|---|---|---|');
const B = (s) => String.fromCharCode(96) + s + String.fromCharCode(96);
regions.forEach(r => L.push('| ' + r.name + ' | ' + B(r.id) + ' | ' + B('worldRegionStatus()') + ' |'));
L.push('');
L.push('## 二、独立可玩地点（`extendedMap` 场景）');
L.push('');
L.push('共 **' + extended.length + '** 个。这些不在 M 地图上单列，而是从所属区域的门进入，');
L.push('首次步行到访后自动登记为公共传送节点。');
L.push('');
L.push('| 地点 | 场景 id | 工作台 | 门 | 配套室内 |');
L.push('|---|---|---:|---:|---:|');
rows.forEach(r => L.push('| ' + r.name + ' | ' + B(r.id) + ' | ' + r.sites + ' | ' + r.doors + ' | ' + r.rooms + ' |'));
L.push('');
L.push('## 三、内建场景（`MAPS.*`）');
L.push('');
L.push('| 场景 | 用途 |');
L.push('|---|---|');
base.forEach(b => L.push(`| \`${b}\` | ${scenePurpose(b)} |`));
L.push('');
L.push(`另有两处农舍式室内（\`${interiors.join('`、`')}\`）由 \`addExtendedRoom\` 生成。`);
L.push('');
L.push('## 四、公共传送节点');
L.push('');
L.push('| 节点 id | 稳定地点 ID | 场景 |');
L.push('|---|---|---|');
nodes.forEach(n => L.push('| ' + B(n.node) + ' | ' + B(n.loc) + ' | ' + B(n.scene) + ' |'));
L.push('');
L.push('## 五、进入路线与授权分层');
L.push('');
L.push('原设计里 D—E 是一条公共工程主线串下来的：磨坊验收 → 湿地调查 → 采场／河港 → 水利验收 → 边境。');
L.push('这有利于顺序教学，但也意味着想做商人或巡林人的玩家必须先走完整条链。现已开放三条替代路线：');
L.push('');
L.push('| 路线 | 靠什么推进 | 达到 2 点 |');
L.push('|---|---|---|');
L.push('| 工程路线 | 采场测量裂隙、选定采区、支护采区、水利验收证书 | 可作到访凭证 |');
L.push('| 商旅路线 | 河港核验运单、医舍签收、石料签收 | 可作到访凭证 |');
L.push('| 巡林路线 | 关口巡路巡查 | 可作到访凭证 |');
L.push('');
L.push('到访、接任务、指挥军队三层授权分开授予：');
L.push('');
L.push('- **到访**：任一路线到 2 点，或走完公共工程主线');
L.push('- **接任务**：任一路线到 4 点（可受理巡防登记）');
L.push('- **指挥军队**：只来自军事线 —— 已登记 + 军衔达可指挥级 + 指挥上限大于 0');
L.push('');
L.push('因此普通商人能进边城做生意，却不会因此拿到军事指挥权；边境营地（军事设施）额外需要「接任务」授权。');
L.push('');
L.push('## 六、仍属规划、尚未实现');
L.push('');
L.push('以下是总规里写明、但当前代码中**没有**实现的。不要在文档里把它们写成可玩：');
L.push('');
['五属性上限与天赋加点', '新年历（四季 × 28 天 = 112 天/年）', '完整职业晋升链与任期',
 '银行家路线与金融账本', '军队招募／装备采购的完整合同流程',
 '十九世纪技术氛围与刀剑的设定说明']
  .forEach(x => L.push(`- ${x}`));
L.push('');
L.push('## 七、已知口径陷阱');
L.push('');
L.push('合并 `main` 之后，`game.js` 里同时存在**两套军事等级取值**，写代码时务必看清用的是哪一套：');
L.push('');
L.push('| 表 | 取值 | 用途 |');
L.push('|---|---|---|');
L.push('| `MIL_RANKS` | `civilian`/`trainee`/`member`/`squad`/`captain`/`regional`/`marshal` | 阶段 E 裁判与权限分级 |');
L.push('| `militaryLife.rank` | `resident`/`patrol`/`squad_leader`/`captain`/`field_commander` | 云峰边境营地实机流程 |');
L.push('');
L.push('两者职级名不同，判断指挥权要读 `militaryLife`，不要读 `MIL_RANKS`。');
L.push('');
L.push('## 口径说明');
L.push('');
L.push(`- M 地图区域标记：${regions.length} 个`);
L.push(`- 独立可玩地点（extendedMap）：${extended.length} 个`);
L.push(`- 内建场景（MAPS.*）：${base.length} 个`);
L.push(`- 公共传送节点（extended）：${nodes.length} 个`);
L.push('');
L.push('「可进入的地点总数」= 内建场景 + 独立地点 + 矿层 + 农舍室内，');
L.push('与 M 地图标记数不是同一个口径，引用时必须说清是哪一种。');

fs.writeFileSync(path.join(root, 'docs', 'feature-status.md'), L.join('\n'));
console.log(`已生成 docs/feature-status.md（${L.length} 行）`);
console.log(`  区域 ${regions.length} · 独立地点 ${extended.length} · 内建场景 ${base.length} · 传送节点 ${nodes.length}`);

function scenePurpose(id) {
  if (['farm', 'town', 'riverside', 'house', 'city'].includes(id)) return '主地图区域';
  if (['millroom', 'vetroom'].includes(id)) return '阶段 C 真实内部';
  return '—';
}
