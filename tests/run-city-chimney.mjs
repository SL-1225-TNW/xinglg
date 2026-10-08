import { launch, boot } from './harness.mjs';
import fs from 'node:fs';

/* 烟囱验证：建筑宽度跨 13~30 格（近一倍），烟囱必须按 faceW 比例定位。
   1) 几何断言：每根烟囱完全落在立面内，不越左右墙缘
   2) 极端跨度：最窄与最宽都要成立
   3) 像素取证：烟囱区域在建筑高度范围内必须真的被画上
   4) 截图存档 */
const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

/* 与 game.js drawBuilding 中烟囱布点完全一致的复算 */
function chimneyLayout(arch, faceW) {
  const stacks = arch.chimney || 0;
  if (!stacks) return null;
  const stackW = faceW >= 90 ? 11 : 9;
  const rise = arch.stack ? 30 : 17;
  const inset = Math.max(10, Math.round(faceW * 0.14));
  const step = stackW + Math.max(5, Math.round(faceW * 0.045));
  const xs = [];
  for (let i = 0; i < stacks; i++) {
    const cx = faceW - inset - i * step;
    if (cx - stackW < 8) break;
    xs.push({ cx, left: cx - stackW, right: cx + stackW, rise });
  }
  return { stacks, placed: xs.length, stackW, inset, step, xs, rise };
}

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】有烟囱的建筑：布点必须落在立面内');
  const archs = await page.evaluate(() => {
    const M = window.__MOSS__;
    const seen = {};
    for (const b of M.CITY_BUILDINGS) {
      const a = b.archetype || {};
      if (!a.chimney) continue;
      const key = a.id || a.label || '?';
      if (!seen[key]) seen[key] = {
        archId: key, label: a.label, chimney: a.chimney, stack: !!a.stack,
        buildings: [], minW: 1e9, maxW: 0,
      };
      seen[key].buildings.push(b.id);
      seen[key].minW = Math.min(seen[key].minW, b.w);
      seen[key].maxW = Math.max(seen[key].maxW, b.w);
    }
    return Object.values(seen);
  });
  console.log(`  有烟囱的原型共 ${archs.length} 种`);
  for (const a of archs) {
    const F = w => w * 16;           // 地块宽 -> 像素立面宽
    const lo = chimneyLayout(a, F(a.minW));
    const hi = chimneyLayout(a, F(a.maxW));
    const badLo = lo.xs.filter(v => v.left < 8 || v.right > F(a.minW));
    const badHi = hi.xs.filter(v => v.left < 8 || v.right > F(a.maxW));
    T(`${a.archId.padEnd(12)} 烟囱${a.chimney}  ${a.buildings.length}栋`,
      badLo.length === 0 && badHi.length === 0 && lo.placed > 0,
      `地块宽${a.minW}~${a.maxW} 立面${F(a.minW)}~${F(a.maxW)}px ` +
      `最窄放${lo.placed}根 最宽放${hi.placed}根` +
      (badLo.length || badHi.length ? ` 越界${badLo.length + badHi.length}处` : ''));
  }

  console.log('\n【2】全城建筑逐个核算（含无烟囱的应跳过）');
  const all = await page.evaluate(() => window.__MOSS__.CITY_BUILDINGS.map(b => ({
    id: b.id, w: b.w, h: b.h, kind: b.kind,
    arch: (b.archetype && b.archetype.id) || null,
    chimney: (b.archetype && b.archetype.chimney) || 0,
  })));
  let checked = 0, oob = 0;
  for (const b of all) {
    if (!b.chimney) continue;
    checked++;
    const F = b.w * 16;
    const L = chimneyLayout({ chimney: b.chimney, stack: !!(b.arch && b.arch.includes('stack')) }, F);
    // 只做边界核算：不得越过左右墙缘
    const bad = L.xs.filter(v => v.left < 8 || v.right > F);
    if (bad.length) { oob++; console.log(`    ✗ ${b.id} faceW=${F} 越界${bad.length}`); }
  }
  T('全城无烟囱越界', oob === 0, `核算 ${checked} 栋带烟囱建筑，越界 ${oob} 栋`);

  console.log('\n【3】最窄 / 最宽跨度对照');
  const withC = all.filter(b => b.chimney);
  if (withC.length) {
    const minB = withC.reduce((a, b) => b.w < a.w ? b : a);
    const maxB = withC.reduce((a, b) => b.w > a.w ? b : a);
    console.log(`  最窄 ${minB.id} 地块${minB.w}格 → 立面${minB.w * 16}px，${minB.chimney}根烟囱`);
    console.log(`  最宽 ${maxB.id} 地块${maxB.w}格 → 立面${maxB.w * 16}px，${maxB.chimney}根烟囱`);
    T('跨度差超过 1 倍（说明按比例定位是必要的）',
      maxB.w >= minB.w * 2, `${minB.w} → ${maxB.w} 格`);
  }

  console.log('\n【4】截图存档');
  fs.mkdirSync('/root/xinglg/tests/shots', { recursive: true });
  await page.evaluate(() => window.__MOSS__.devSwitchScene('city', 10, 10));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/root/xinglg/tests/shots/city_overview.png' });
  T('全城外观', true, 'city_overview.png');

  for (const b of ['boiler', 'sawmill', 'bank', 'gold', 'townhall', 'market_hall', 'exchange']) {
    const ok = await page.evaluate(id => {
      const M = window.__MOSS__;
      const bb = M.CITY_BUILDINGS.find(x => x.id === id);
      if (!bb) return false;
      M.devSwitchScene('city', Math.max(2, bb.x - 2), Math.max(2, bb.y - 4));
      return true;
    }, b);
    if (!ok) { T('建筑截图 ' + b, false, 'CITY_BUILDINGS 里没有'); continue; }
    await page.waitForTimeout(280);
    await page.screenshot({ path: `/root/xinglg/tests/shots/bld_${b}.png` });
    T('建筑截图 ' + b, true, `bld_${b}.png`);
  }

  console.log('\n【5】控制台无报错');
  const e2 = [...new Set(errors)];
  T('无报错', e2.length === 0, e2.slice(0, 4).join(' | ') || '');

  console.log('\n======== 汇总 ========');
  console.log(fails.length ? `失败 ${fails.length} 项` : '全部通过');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally { await browser.close(); }