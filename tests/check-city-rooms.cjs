const fs = require('node:fs');
const vm = require('node:vm');

/* 不进浏览器，纯静态核对 CITY_ROOMS 键名 vs service 名 vs 室内 spot 是否一致 */
const source = fs.readFileSync('/root/xinglg/game.js', 'utf8');
function block(decl) {
  const start = source.indexOf(decl);
  let i = source.indexOf('{', start), depth = 1, j = i + 1;
  for (; depth; j++) { if (source[j] === '{') depth++; else if (source[j] === '}') depth--; }
  return source.slice(start, j);
}
const ctx = { Math, console };
vm.createContext(ctx);
vm.runInContext(block('var CITY_ROOMS ='), ctx);
const ROOMS = ctx.CITY_ROOMS;

const WANT = ['boiler', 'sawmill', 'foundry', 'watermill', 'shipyard', 'quay_store',
  'uni_main', 'uni_wing', 'uni_lab', 'uni_dorm', 'bank', 'exchange', 'gold',
  'market_hall', 'civic'];

console.log('=== CITY_ROOMS 键名 vs service 名 ===');
const mismatch = [];
for (const id of WANT) {
  const key = Object.keys(ROOMS).find(k => k === id);
  const room = ROOMS[id];
  if (!room) {
    mismatch.push(id + '：CITY_ROOMS 无此键');
    console.log(`  ✗ ${id.padEnd(13)} CITY_ROOMS 里没有这个键`);
    continue;
  }
  const spots = room.spots || [];
  const svcs = spots.map(s => s.service);
  if (!svcs.includes(id)) {
    mismatch.push(`${id}：键存在但 spot.service=${JSON.stringify(svcs)}，点开不会走 ${id} 分支`);
    console.log(`  ✗ ${id.padEnd(13)} 键存在，spot.service=${JSON.stringify(svcs)} → 会 fallback`);
  } else {
    console.log(`  ✓ ${id.padEnd(13)} spot.service=${svcs.join(',')} stand=${JSON.stringify(spots[0].stand)}`);
  }
}

console.log('\n=== CITY_INFO 覆盖 ===');
const infoStart = source.indexOf('var CITY_INFO =');
const infoBlk = source.slice(infoStart, source.indexOf('\n};', infoStart));
for (const id of WANT) {
  const has = new RegExp('^  ' + id + ':', 'm').test(infoBlk);
  console.log(`  ${has ? '✓' : '✗'} CITY_INFO.${id}`);
  if (!has) mismatch.push(`CITY_INFO 缺 ${id}`);
}

console.log('\n=== 结论 ===');
if (mismatch.length) { console.log('发现 ' + mismatch.length + ' 处不一致：'); mismatch.forEach(m => console.log('  · ' + m)); }
else console.log('全部一致');