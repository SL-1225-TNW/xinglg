import { launch, boot } from './harness.mjs';

/* 像素取证法：不猜颜色，直接比对「该 prop 覆盖的格子里，渲染前后像素是否变化」。
   家具画出来必然改写像素；若整片区域完全一致，说明这个 prop 没被画（静默跳过）。 */
const CHECK = [
  // [房间, prop类型, 期望出现次数]
  ['bank', 'desk', 1], ['bank', 'table', 1], ['bank', 'banner', 1], ['bank', 'statue', 1],
  ['exchange', 'genericShelf', 1], ['exchange', 'bench', 1],
  ['gold', 'vaultDoor', 3], ['gold', 'ingotRack', 1], ['gold', 'vaultCage', 1],
  ['market_hall', 'basket', 4], ['market_hall', 'sign', 1],
  ['townhall', 'throne', 1], ['townhall', 'statue', 2],
  ['uni_main', 'desk', 1], ['uni_main', 'statue', 1],
  ['quay_store', 'genericShelf', 5],
];

const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

/* 把某房间的某类 prop 摘掉，重画一次；再放回去，重画一次。
   两次画布像素的差异面积 > 0 即证明该 prop 真的在渲染。 */
const probe = (room, type) => page.evaluate(([r, t]) => {
  const M = window.__MOSS__;
  const def = M.CITY_ROOMS[r];
  if (!def) return { err: 'no room' };
  const hit = (def.props || []).filter(p => p.t === t);
  if (!hit.length) return { err: 'no prop' };

  // 1) 画带该 prop 的整间房
  const c1 = M.cityRoomCanvasProbe ? M.cityRoomCanvasProbe(r) : null;
  const grab = () => {
    const cv = document.createElement('canvas');
    cv.width = def.w * 16; cv.height = def.h * 16;
    const g = cv.getContext('2d');
    M.__drawRoomTo(g, def);
    return g.getImageData(0, 0, cv.width, cv.height);
  };
  const withProp = grab();
  // 2) 摘掉该类 prop 再画
  const saved = def.props;
  def.props = saved.filter(p => p.t !== t);
  const without = grab();
  def.props = saved;
  // 3) 差异像素数
  let diff = 0;
  for (let i = 0; i < withProp.data.length; i += 4) {
    if (Math.abs(withProp.data[i] - without.data[i]) > 4 ||
      Math.abs(withProp.data[i + 1] - without.data[i + 1]) > 4 ||
      Math.abs(withProp.data[i + 2] - without.data[i + 2]) > 4) diff++;
  }
  return { diff, count: hit.length, area: def.w * def.h * 256 };
}, [room, type]);

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】新增 10 类 prop 真的产生像素（差异面积 > 0）');
  for (const [room, type, want] of CHECK) {
    const r = await probe(room, type);
    if (r.err) { T(`${room}/${type}`, false, r.err); continue; }
    const pct = r.diff / r.area * 100;
    T(`${room.padEnd(11)} ${type.padEnd(13)}`, r.diff > 200,
      `${r.count} 处，覆盖 ${r.diff}px (${pct.toFixed(1)}%)`);
  }

  console.log('\n【2】各栋陈设不再雷同（prop 类型集合差异度）');
  const sig = await page.evaluate(rooms => {
    const out = {};
    for (const r of rooms) {
      const def = window.__MOSS__.CITY_ROOMS[r];
      out[r] = [...new Set((def.props || []).map(p => p.t))].sort().join('|');
    }
    return out;
  }, ['bank', 'exchange', 'gold', 'market_hall', 'townhall']);
  const vals = Object.values(sig);
  const uniq = new Set(vals);
  console.log('  金融/市政 5 栋陈设签名：');
  for (const [k, v] of Object.entries(sig)) console.log(`    ${k.padEnd(11)} ${v}`);
  T('5 栋签名互不相同', uniq.size === vals.length, `${uniq.size}/${vals.length} 种`);

  console.log('\n【3】控制台无报错');
  const e2 = [...new Set(errors)];
  T('无报错', e2.length === 0, e2.slice(0, 5).join(' | ') || '');

  console.log('\n======== 汇总 ========');
  console.log(fails.length ? `失败 ${fails.length} 项` : '全部通过');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally { await browser.close(); }
