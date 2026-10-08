import { launch, boot } from './harness.mjs';

/* 核对待开放节点是否真的可传送 —— 总规 32.1 称葡萄园/磨坊「待开放」，
   但 M 地图把它们列为可传送按钮。逐个试，确认是否与规划矛盾。 */
const { browser, page, errors } = await launch();
let fails = 0;
const t = (n, ok, note = '') => { console.log(`  ${ok ? '✓' : '✗'} ${n}${note ? '  → ' + note : ''}`); if (!ok) fails++; };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  await page.keyboard.press('m');
  await page.waitForTimeout(600);

  const nodes = await page.evaluate(() => {
    const M = window.__MOSS__;
    const N = M.travelNodes || [];
    return N.map(n => ({
      id: n.id, name: n.name, sceneId: n.sceneId,
      region: n.region, kind: n.kind,
      safeN: (n.safe || []).length,
      desc: (n.desc || '').slice(0, 40),
      // 解锁判定
      unlocked: (() => { try { return M.travelStateInfo ? JSON.stringify(M.travelStateInfo(n.id)).slice(0, 80) : 'n/a'; } catch (e) { return 'ERR'; } })(),
    }));
  });

  console.log('=== TRAVEL_NODES 全量（' + nodes.length + '）===');
  nodes.forEach(n => {
    console.log(`  ${n.id.padEnd(18)} ${n.name.padEnd(8)} scene=${String(n.sceneId).padEnd(9)} region=${String(n.region).padEnd(10)} safe=${n.safeN}`);
  });

  console.log('\n=== 逐个实跑传送 ===');
  for (const n of nodes) {
    if (n.id === 'farm.home') continue;   // 起点跳过
    const r = await page.evaluate(async (id) => {
      const M = window.__MOSS__;
      try {
        const prev = M.travelPreview(id);
        const res = M.travelCommit(id);
        return { ok: true, prev: JSON.stringify(prev).slice(0, 200), res: JSON.stringify(res).slice(0, 200) };
      } catch (e) { return { ok: false, err: e.message }; }
    }, n.id);
    // 关键：r.ok 只是调用没抛异常，不代表传送可行
    const pv = (() => { try { return JSON.parse(r.prev); } catch (e) { return {}; } })();
    const canGo = pv.ok === true;
    const comm = r.res === 'true';
    console.log(`  ${canGo && comm ? '✓' : '✗'} ${n.name}  ${canGo ? '可用' : '锁定: ' + pv.reason}`);
    if (r.ok) {
      console.log(`      preview: ${r.prev}`);
      console.log(`      commit : ${r.res}`);
    } else {
      console.log(`      ✗ 调用异常: ${r.err}`);
      fails++;
    }
  }

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错: ' + e2.slice(0, 5).join(' | ') : '\n零报错');
  console.log(fails ? `\n不可传送/失败 ${fails} 项` : '\n全部节点均可传送');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }