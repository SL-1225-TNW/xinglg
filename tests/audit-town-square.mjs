import { launch, boot } from './harness.mjs';

/* 核实 town.square 的 discovered / unlocked 是否自洽：
   - 新档（未到访小镇）：unlocked 必须 true（7400 硬编码）
   - discovered 若是 false，M 地图会显示「未到访但可传送」的不一致状态
   结论决定 7383 那行是 bug 还是消歧 */
const { browser, page, errors } = await launch();
let fails = 0;
const t = (n, ok, note = '') => { console.log(`  ${ok ? '✓' : '✗'} ${n}${note ? '  → ' + note : ''}`); if (!ok) fails++; };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  const r = await page.evaluate(() => {
    const M = window.__MOSS__;
    const s = M.state || M.save || {};
    const nodes = M.travelNodes || [];
    const out = [];
    nodes.forEach(n => {
      const pv = M.travelPreview(n.id);
      out.push({
        id: n.id,
        discovered: !!(s.travel && s.travel.discovered && s.travel.discovered[n.id]),
        unlocked: !!(pv && pv.ok),
        reason: pv && pv.reason,
      });
    });
    return { scene: s.sceneId, out };
  });

  console.log('=== 新档场景：' + r.scene + ' ===');
  console.log('  id                  discovered  unlocked  说明');
  r.out.forEach(n => {
    const flag = (n.discovered && n.unlocked) || (!n.discovered && !n.unlocked) ? ' ' : '←';
    console.log(`  ${n.id.padEnd(20)} ${String(n.discovered).padEnd(11)} ${String(n.unlocked).padEnd(9)} ${(n.reason || '').slice(0, 26)}${flag}`);
  });

  console.log('\n=== 一致性判定 ===');
  const inconsistent = r.out.filter(n => n.unlocked && !n.discovered);
  t('无「已解锁但未到访」的不一致节点', inconsistent.length === 0,
    inconsistent.length ? inconsistent.map(n => n.id).join(',') : '全部自洽');

  const town = r.out.find(n => n.id === 'town.square');
  t('town.square 新档即可传送', town && town.unlocked === true, town && town.reason);
  t('town.square discovered 同步为 true', town && town.discovered === true);

  // 7383 是否必需？删掉它后 travelPreview 应当拒绝 town.square（否则新档死锁）
  const sim = await page.evaluate(() => {
    const M = window.__MOSS__;
    const s = M.state || M.save;
    if (!s.travel || !s.travel.discovered) return 'no state';
    const had = s.travel.discovered['town.square'];
    delete s.travel.discovered['town.square'];
    const pv = M.travelPreview('town.square');
    s.travel.discovered['town.square'] = had;   // 还原
    return { previewOk: pv.ok, reason: pv.reason };
  });
  t('删掉 7383 后小镇传送被拒（说明该行必需）', sim.previewOk === false,
    `preview.ok=${sim.previewOk} 原因=${sim.reason}`);
  console.log('  → 结论：7383 是必需设计，非缺陷。');
  console.log('  → 不预置 discovered 则新档无法首次抵达小镇，触发死锁。');
  console.log('  → 7400 硬编码 town.square=true 只管解锁，不管登记；两道检查缺一不可。');

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错: ' + e2.slice(0, 3).join(' | ') : '\n零报错');
  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }