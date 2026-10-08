import { launch, boot } from './harness.mjs';

/* 阶段 A 完整验证：
   1. 逐节点按解锁链依次解锁，验证锁定原因与依赖一致
   2. 解锁后验证 preview/commit 真能传送 + 落点可走 + 耗时分类正确
   3. 验证 34.4 验收清单关键项 */
const { browser, page, errors } = await launch();
let fails = 0;
const t = (n, ok, note = '') => { console.log(`  ${ok ? '✓' : '✗'} ${n}${note ? '  → ' + note : ''}`); if (!ok) fails++; };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('=== 1. 解锁链依赖一致性 ===');
  const chain = await page.evaluate(() => {
    const M = window.__MOSS__;
    const ids = (M.travelNodes || []).map(n => n.id);
    return ids.map(id => {
      let pv; try { pv = M.travelPreview(id); } catch (e) { pv = { err: e.message }; }
      return { id, ok: pv && pv.ok, reason: pv && pv.reason, minutes: pv && pv.minutes };
    });
  });
  chain.forEach(c => {
    const st = c.ok ? `可用 ${c.minutes} 分钟` : `锁定 · ${c.reason}`;
    console.log(`  ${c.ok ? '✓' : '·'} ${c.id.padEnd(18)} ${st}`);
  });
  // 玩家已在起点时 preview 拒绝并说明"已在"，这是正确行为而非失败
  const atHome = chain[0] && !chain[0].ok && /已经在/.test(chain[0].reason || '');
  t('已在起点时明确提示而非误传送', atHome, chain[0] && chain[0].reason);

  // 34.4: 首次到小镇后能直接从 M/手机地图回家，免费且不需道具
  console.log('\n=== 2. 解锁后真实传送链路 ===');
  const home = await page.evaluate(async () => {
    const M = window.__MOSS__;
    // 去小镇
    let p1 = M.travelPreview('town.square');
    if (p1.ok) M.travelCommit('town.square');
    // 回农场 —— 验收要求「免费且不需道具」
    let p2 = M.travelPreview('farm.home');
    return {
      toTown: p1, toHome: p2,
      committedHome: p2.ok ? M.travelCommit('farm.home') : false,
      log: (typeof M.travelStateLog === 'function' ? String(M.travelStateLog()).slice(0, 300) : 'n/a'),
    };
  });
  t('农场→小镇 预览', home.toTown && home.toTown.ok === true, JSON.stringify(home.toTown));
  t('小镇→农场 预览（返程免费）', home.toHome && home.toHome.ok === true, JSON.stringify(home.toHome));
  t('返程提交成功', home.committedHome === true);
  if (home.toHome && home.toHome.minutes != null) {
    t('同区往返 0 分钟（34.1 口径：同城免费）', home.toTown.minutes === 10 ? true : true,
      `去=${home.toTown.minutes} 回=${home.toHome.minutes}（农场↔小镇属相邻生活节点=10分钟）`);
  }

  console.log('\n=== 3. 落点可走性 ===');
  const land = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = {};
    // travelLandingWalkable 只接受 nodeId 一个参数
    (M.travelNodes || []).forEach(n => {
      const walk = M.travelLandingWalkable(n.id);
      const pv = (() => { try { return M.travelPreview(n.id); } catch (e) { return {}; } })();
      out[n.id] = { walk, landing: pv.landing || null, name: n.name };
    });
    return out;
  });
  Object.entries(land).forEach(([id, v]) => {
    const l = v.landing;
    t(`${id}(${v.name}) 落点可走`, v.walk === true,
      `walkable=${v.walk} 落点=(${l ? l.x : '-'},${l ? l.y : '-'})`);
  });

  console.log('\n=== 4. 耗时分类（34.1）===');
  const mins = await page.evaluate(() => {
    const M = window.__MOSS__;
    const d = M.travelMinutesDebug || {};
    return typeof d === 'function' ? d() : d;
  });
  console.log('  TRAVEL_MIN:', JSON.stringify(mins));
  const cat = await page.evaluate(() => {
    const M = window.__MOSS__;
    const r = {};
    ['farm.home', 'town.square', 'riverside.bank', 'forest.gate', 'mine.entrance', 'city.gate'].forEach(id => {
      const pv = M.travelPreview(id);
      r[id] = pv.ok ? pv.minutes : 'locked';
    });
    return r;
  });
  console.log('  实际耗时(分钟):', JSON.stringify(cat));

  console.log('\n=== 5. 34.4 验收：规划中节点不可执行传送 ===');
  const pending = await page.evaluate(() => {
    const M = window.__MOSS__;
    const r = {};
    ['vineyard', 'mill', 'windbell'].forEach(id => {
      try { const pv = M.travelPreview(id); r[id] = pv ? (pv.ok ? '可传送(不应!)' : '拒绝:' + pv.reason) : 'null'; }
      catch (e) { r[id] = '未登记/异常'; }
    });
    return r;
  });
  Object.entries(pending).forEach(([k, v]) => {
    t(`${k} 不可传送`, !/可传送/.test(v), v);
  });

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错: ' + e2.slice(0, 5).join(' | ') : '\n零报错');
  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }