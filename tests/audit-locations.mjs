/* 盘点每个 extended 地点的实际内容，用于生成功能状态表。
   只读源码，不改任何文件。 */
import fs from 'node:fs';
const s = fs.readFileSync('game.js', 'utf8');

const em = [...s.matchAll(/extendedMap\('(\w+)',\s*'([^']+)'/g)].map(m => ({ id: m[1], name: m[2] }));

function segment(startIdx) {
  // 从 extendedMap 调用处往后取到配平结束，粗略圈出该地点的代码块
  let depth = 0, started = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '(') { depth++; started = true; }
    else if (c === ')') { depth--; if (started && depth === 0) return s.slice(startIdx, i + 1); }
  }
  return '';
}

console.log('id'.padEnd(18), '名称'.padEnd(22), '代码行数', ' 交互点', ' 专用函数');
for (const e of em) {
  const idx = s.indexOf(`extendedMap('${e.id}'`);
  const seg = segment(idx);
  const lines = seg.split('\n').length;
  const items = (seg.match(/kind:'/g) || []).length;
  const fns = [...s.matchAll(new RegExp(`function (\\w*${e.id}\\w*|\\w+${e.id.replace(/_(.)/g, (_, c) => c.toUpperCase())}\\w*)\\s*\\(`, 'g'))].map(m => m[1]);
  console.log(e.id.padEnd(18), e.name.slice(0, 20).padEnd(22), String(lines).padStart(6), String(items).padStart(7), ' ' + [...new Set(fns)].slice(0, 4).join(','));
}

// 地点总数口径
const regions = [...s.match(/var WORLD_REGIONS = \[([\s\S]*?)\n\];/)[1].matchAll(/\{id:'([\w_]+)'/g)].map(m => m[1]);
const baseScenes = [...s.matchAll(/^MAPS\.(\w+) = /gm)].map(m => m[1]);
console.log('\n口径：');
console.log('  M 地图区域标记   ', regions.length, JSON.stringify(regions));
console.log('  内建场景 MAPS.*  ', baseScenes.length, JSON.stringify(baseScenes));
console.log('  extended 地点    ', em.length);
