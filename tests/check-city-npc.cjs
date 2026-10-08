/* 静态核对：15 栋的 staff 声明 vs NPCS 表 vs CITY_STAFF_ROUTINES vs postResident 布置 */
const fs = require('node:fs'), vm = require('node:vm');
const src = fs.readFileSync('/root/xinglg/game.js', 'utf8');

function block(decl) {
  const s = src.indexOf(decl);
  if (s < 0) throw new Error('找不到 ' + decl);
  let i = src.indexOf('{', s), d = 1, j = i + 1;
  for (; d; j++) { if (src[j] === '{') d++; else if (src[j] === '}') d--; }
  return src.slice(s, j);
}
const ctx = { console, Math, JSON };
vm.createContext(ctx);
vm.runInContext(block('var CITY_ROOMS ='), ctx);
vm.runInContext(block('var CITY_STAFF_ROUTINES ='), ctx);
const ROOMS = ctx.CITY_ROOMS, ROUTINES = ctx.CITY_STAFF_ROUTINES;

const NEW = ['boiler', 'sawmill', 'foundry', 'watermill', 'shipyard', 'quay_store',
  'uni_main', 'uni_wing', 'uni_lab', 'uni_dorm', 'bank', 'exchange', 'gold',
  'market_hall', 'townhall'];

/* 从源码里抽出 postStaff(...) 的实参 */
const calls = [];
const re = /postStaff\(\s*'([a-z_]+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([a-z]+)'[\s\S]*?'(city_[a-z_]+)'\s*,\s*\[(\d+)\s*,\s*(\d+)\]\s*\)/g;
let m;
while ((m = re.exec(src))) {
  calls.push({ id: m[1], name: m[2], title: m[3], style: m[4], scene: m[5], x: +m[6], y: +m[7] });
}
console.log('=== postStaff 调用解析到 ' + calls.length + ' 条 ===\n');

const fails = [];
const T = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails.push(name);
};

/* postResident 是否被调用 */
const posted = new Set();
const re2 = /postResident\(\s*'([a-z_]+)'\s*,\s*'(city_[a-z_]+)'/g;
while ((m = re2.exec(src))) posted.add(m[1]);
console.log('=== postResident 显式调用: ' + [...posted].join(' ') + ' ===');
/* postStaff 内部也会调 postResident，所以这 15 条由 postStaff 覆盖 */

console.log('\n=== 逐栋核对 ===');
for (const rid of NEW) {
  const room = ROOMS[rid];
  if (!room) { T(rid + ' 房间存在', false); continue; }
  const svc = (room.spots && room.spots[0]) ? room.spots[0].service : null;
  // 找调用里 scene === 'city_'+rid 的
  const c = calls.find(x => x.scene === 'city_' + rid);
  if (!T(rid + ' 有 postStaff', !!c, c ? `${c.id} @(${c.x},${c.y})` : '未找到')) continue;
  T('  · style 合法', ['baker', 'postie', 'ranger', 'engineer', 'scholar'].includes(c.style), c.style);
  // 坐标在房间内
  T('  · 坐标在房间内', c.x > 0 && c.y > 0 && c.x < room.w && c.y < room.h,
    `(${c.x},${c.y}) vs ${room.w}x${room.h}`);
  // 不与 spot 重叠
  const sp = room.spots[0];
  T('  · 不压着 spot', !(c.x === sp.x && c.y === sp.y), `spot=(${sp.x},${sp.y})`);
  // 作息表存在
  T('  · 作息表已生成', !!ROUTINES[c.id], ROUTINES[c.id] ? ROUTINES[c.id].length + ' 段' : '缺');
  // 有台词
  T('  · 有台词', c.name && c.title, `${c.name}·${c.title}`);
}

console.log('\n=== staff 声明 vs 实际 NPC 数 ===');
for (const rid of NEW) {
  const declared = (ROOMS[rid].staff || []).length;
  const actual = calls.filter(x => x.scene === 'city_' + rid).length;
  T(rid.padEnd(12), declared === actual && actual >= 1, `声明 ${declared} 实际 ${actual}`);
}

console.log('\n=== 汇总 ===');
console.log(fails.length ? '失败 ' + fails.length + ' 项：' + fails.join('; ') : '全部通过');
process.exitCode = fails.length ? 1 : 0;
