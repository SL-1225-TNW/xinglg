// B 阶段基线盘点：只做「已实现 vs 真的可用」定性，不改任何逻辑
import { launch, boot } from './harness.mjs';

const { browser, page } = await launch();
const rows = [];
const t = (sec, name, verdict, evidence) => rows.push({ sec, name, verdict, evidence });

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  const r = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, e = M.exploreState ? M.exploreState() : null;
    const out = {};

    // ---- 32.2 农场 ----
    out.fertGroups = Object.keys(M.devFert.groups());
    out.fertBonus = M.devFert.bonus ? M.devFert.bonus() : null;
    out.hasCompost = !!(M.devCompost && M.devCompost.recipe());
    out.kitchenUsable = !!(M.devFarm && M.devFarm.kitchen);
    out.toolSlot10 = M.devCompost.slot();
    // 果树 / 畜养
    out.animals = (M.state.animals && M.state.animals.length) || 0;
    out.orchard = (M.state.orchards && M.state.orchards.length) || 0;
    out.itemsAnimal = Object.keys(M.ITEMS).filter(k => /egg|wool|milk|honey|bread|jam/i.test(M.ITEMS[k].name || ''));

    // ---- 32.3 矿山 ----
    out.mineScenes = ['mine1', 'mine2', 'mine3'].map(id => {
      const m = M.MAPS ? M.MAPS[id] : null;
      return { id, exists: !!m, name: m && m.name };
    });
    out.exploreDepth = e && e.depth;
    out.exploreMine = e && !!e.mine;
    out.nodeKinds = Object.keys((e && e.nodes) || {});
    // 节点恢复是否真的生效（不跨场景刷新）
    const nodeKeys = Object.keys((e && e.nodes) || {}).slice(0, 3);
    out.nodesSample = nodeKeys.map(k => ({ k, v: e.nodes[k] }));

    // ---- 32.4 森林 ----
    out.forestEx = !!(e && e.forest);
    out.stumps = Object.keys((e && e.treasures) || {});

    // ---- 32.5 河湾 ----
    out.fishCount = (M.devFarm && M.devFarm.fishRoster) ? M.devFarm.fishRoster() : null;

    // ---- 32.6 小镇 ----
    out.marketRotates = !!(M.devFarm && M.devFarm.marketRotation);

    // ---- 32.7 白蔷薇城 ----
    out.cityScenes = Object.keys(M.MAPS || {}).filter(k => k.indexOf('city') === 0);
    out.cityIndoor = !!(M.MAPS && M.MAPS.city);

    return out;
  });

  const push = (sec, name, ok, ev) => t(sec, name, ok ? '已实现' : '空白', ev);

  console.log('\n=== 32.2 农场 ===');
  push('32.2', '土壤肥力 0-100 + 三类轮作组', r.fertGroups.length >= 3, r.fertGroups);
  push('32.2', '轮作提示（种下前告知下季）', !!r.toolSlot10, r.toolSlot10);
  push('32.2', '堆肥闭环（设备+配方+施肥）', r.hasCompost, 'devCompost.recipe()');
  push('32.2', '果树（1-2 种）', r.orchard > 0, r.orchard);
  push('32.2', '畜养：蛋 / 羊毛', r.itemsAnimal.length > 0, r.itemsAnimal);
  push('32.2', '居家厨房可用', !!r.kitchenUsable, 'devFarm.kitchen?');

  console.log('\n=== 32.3 矿山 ===');
  push('32.3', '三层场景 mine1/2/3', r.mineScenes.every(m => m.exists), r.mineScenes);
  push('32.3', '勘探节点与恢复周期', r.nodeKinds.length > 0, r.nodeKinds);
  push('32.3', '升降轨道 / 层站捷径', !!r.exploreDepth, 'depth=' + r.exploreDepth);

  console.log('\n=== 32.4 森林 ===');
  push('32.4', '森林可探索 + 节点恢复', !!r.forestEx, 'exploreState');

  console.log('\n=== 32.5 河湾 ===');
  push('32.5', '鱼种记录', Array.isArray(r.fishCount) ? r.fishCount.length >= 3 : false, r.fishCount);
  push('32.5', '渡口 / 湿地 / 养鱼', r.pondfish === true, r.pondfish);

  console.log('\n=== 32.6 小镇 ===');
  push('32.6', '集市每周轮换可预览', r.marketRotates, 'MARKET_ROTATION');

  console.log('\n=== 32.7 白蔷薇城 ===');
  push('32.7', '城市街区场景数', r.cityScenes.length > 0, r.cityScenes.length + ' 个');

  console.log('\n================ 汇总 ================');
  const byVerdict = { 已实现: [], 空白: [] };
  rows.forEach(x => { if (x.verdict === '已实现') byVerdict.已实现.push(x); else if (x.verdict === '空白') byVerdict.空白.push(x); });
  console.log(`已实现 ${byVerdict.已实现.length} 项 / 空白 ${byVerdict.空白.length} 项`);
  console.log('\n--- 空白（= B 阶段真正剩余）---');
  byVerdict.空白.forEach(x => console.log(`  [${x.sec}] ${x.name}  ${JSON.stringify(x.evidence)}`));

  const errs = await page.evaluate(() => window.__ERRORS__ || []);
  console.log('\n运行时错误:', errs.length ? errs.slice(0, 3) : '无');

} finally {
  await browser.close();
}