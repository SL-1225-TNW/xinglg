import { launch, boot } from './harness.mjs';

/* 按游戏总体规划.md 第七版核对实际落地情况。
   全部走运行时探针，不靠正则猜源码。 */
const { browser, page, errors } = await launch();

let R = {};
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  R = await page.evaluate(() => {
    const M = window.__MOSS__;
    const o = { keys: Object.keys(M), has: {} };

    // ── 阶段 A：快速传送 / 地点登记 ──
    const A_SYMS = ['travelTo', 'travelPreview', 'openTravelAtlas', 'registerLocation',
      'resolveSafeArrival', 'travelTransaction', 'TRAVEL_NODES', 'LOCATIONS',
      'locationId', 'travelNodeId', 'travelMinutes', 'safeArrivalCandidates'];
    o.A_syms = A_SYMS.map(s => [s, typeof M[s] !== 'undefined']);

    // locationId / scene 分离：查全局地点登记表
    const reg = M.TRAVEL_NODES || M.LOCATIONS || M.WORLD_LOCATIONS;
    o.travelRegistry = null;
    if (reg) {
      const arr = Array.isArray(reg) ? reg : Object.values(reg);
      o.travelRegistry = {
        count: arr.length,
        sample: arr.slice(0, 6).map(r => ({
          id: r.locationId || r.id,
          scene: r.scene || r.sceneId,
          minutes: r.travelMinutes != null ? r.travelMinutes : (r.timeCost != null ? r.timeCost : r.minutes),
          safe: (r.safeArrivalCandidates || []).length,
        })),
      };
    }

    // ── 34.2 数据字段存在性 ──
    o.fields = {};
    const F = ['parentRegionId', 'contentState', 'discoveryState', 'accessRules',
      'introductionSource', 'departureRules', 'routeId', 'allowedModes',
      'farmZones', 'soilState', 'mineSurvey', 'resourceRecoveryDates',
      'visitedSafeLevels', 'publicServices', 'localCharacters', 'serviceIds'];
    o.fields = F.map(f => [f, typeof M[f] !== 'undefined']);

    // ── 阶段 B：农场/矿山/森林/河湾 可玩性升级 ──
    o.B = {};
    const src = JSON.stringify(M.RECIPES || []);
    o.B.soilState = !!(M.SOIL || M.soilState || M.farmSoil);
    o.B.mineSurvey = !!(M.mineSurvey || M.MINE_SURVEY || M.surveyedVeins);
    o.B.visitedSafeLevels = !!(M.visitedSafeLevels || M.safeLevels);
    o.B.fishSpecies = !!(M.FISH_SPECIES || M.fishTypes);
    o.B.livestock = !!(M.LIVESTOCK || M.livestock || M.ANIMALS);

    // ── 阶段 C：新生活地点 ──
    o.C = {};
    ['windbell', 'mill', 'wheatfield', 'heath', 'wetland', 'vineyard', 'clinic', 'riverport']
      .forEach(k => { o.C[k] = (JSON.stringify(M).includes(k)); });

    // ── 32.1 声称待开放的节点 ──
    const allKeys = Object.keys(M).join(',');
    o.pendingNodes = {
      vineyard: /vineyard/i.test(allKeys),
      mill: /mill|磨坊/.test(allKeys),
    };

    // ── 32.7 按真实服务绑定配方：serviceIds / publicServices ──
    o.serviceBind = {
      serviceIds_sym: typeof M.serviceIds !== 'undefined',
      publicServices_sym: typeof M.publicServices !== 'undefined',
      RECIPES_with_station: (M.RECIPES || []).filter(r => r && r.station).length,
      RECIPES_total: (M.RECIPES || []).length,
    };

    // ── 世界地图是否有传送 ──
    o.worldTravel = {
      openTravelAtlas: typeof M.openTravelAtlas !== 'undefined',
      travelTo: typeof M.travelTo !== 'undefined',
    };

    return o;
  });

  console.log('=== 阶段 A 符号 ===');
  R.A_syms.forEach(([s, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${s}`));

  console.log('\n=== 地点登记表 ===');
  console.log(' ', R.travelRegistry ? JSON.stringify(R.travelRegistry) : '✗ 未暴露 TRAVEL_NODES/LOCATIONS');

  console.log('\n=== 34.2 数据字段 ===');
  R.fields.forEach(([f, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${f}`));

  console.log('\n=== 阶段 B 可玩性升级 ===');
  Object.entries(R.B).forEach(([k, v]) => console.log(`  ${v ? '✓' : '✗'} ${k}`));

  console.log('\n=== 阶段 C 新地点 ===');
  Object.entries(R.C).forEach(([k, v]) => { if (v) console.log(`  ✓ ${k}`); });
  console.log('  （未列出的均 ✗）');

  console.log('\n=== 32.1 待开放节点 ===');
  console.log(' ', JSON.stringify(R.pendingNodes));

  console.log('\n=== 32.7 按真实服务绑定配方 ===');
  console.log(' ', JSON.stringify(R.serviceBind));

  console.log('\n=== 快速传送入口 ===');
  console.log(' ', JSON.stringify(R.worldTravel));

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错: ' + e2.slice(0, 3).join(' | ') : '\n零报错');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }