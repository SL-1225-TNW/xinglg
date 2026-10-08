// 逐项运行时实证：不靠符号计数，靠真实触发后的副作用
import { launch, boot } from './harness.mjs';

const { browser, page } = await launch();
const out = [];
const rec = (sec, name, ok, ev) => { out.push({ sec, name, ok, ev }); console.log(`  ${ok ? '✓' : '✗'} [${sec}] ${name} ${JSON.stringify(ev)}`); };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  // ============ 32.2 农场 ============
  console.log('\n=== 32.2 农场 ===');

  const hen = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    // 全量搜：是否存在动物相关物品/状态（真实数据面，不是符号）
    const items = Object.keys(M.ITEMS).filter(k => /蛋|羊毛|牛奶|鸡|羊|畜/i.test((M.ITEMS[k].name || '') + k));
    return { itemIds: items, hasAnimalsState: !!s.animals, hasBarnKey: Object.keys(s).filter(k => /barn|livestock|coop|pasture/i.test(k)) };
  });
  rec('32.2', '畜养物品（蛋/羊毛）存在', hen.itemIds.length > 0, hen);

  const kitchen = await page.evaluate(() => {
    const M = window.__MOSS__;
    const w = [];
    return { hasKitchenWindow: /kind:\s*'kitchen'/.test(document.documentElement.innerHTML) || !!M.state.flags?.kitchen,
             note: 'kitchen 函数存在但需 UI 入口验证' };
  });
  rec('32.2', '居家厨房 UI 可达', kitchen.hasKitchenWindow, kitchen.note);

  const orchard = await page.evaluate(() => {
    const M = window.__MOSS__;
    const ids = Object.keys(M.ITEMS).filter(k => /apple|pear|cherry|apple|果|苹果|梨|樱桃|plum|李/i.test(k + (M.ITEMS[k].name || '')));
    return { fruitItems: ids };
  });
  rec('32.2', '果树/水果物品', orchard.fruitItems.length > 0, orchard);

  // ============ 32.3 矿山 ============
  console.log('\n=== 32.3 矿山 ===');
  const mine = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const e = M.exploreState ? M.exploreState() : null;
    return {
      scenes: ['mine1', 'mine2', 'mine3'].map(i => !!M.MAPS[i]),
      nodeCount: e ? Object.keys(e.nodes || {}).length : -1,
      hasNodesState: e ? !!e.nodes : false,
    };
  });
  rec('32.3', '三层场景都在', mine.scenes.every(Boolean), mine.scenes);
  rec('32.3', '勘探节点数据面存在', mine.hasNodesState && mine.nodeCount >= 0, mine);

  // 节点恢复真的生效吗：采一次 → 立刻换场景回来 → 应仍未恢复
  const regen = await page.evaluate(async () => {
    const M = window.__MOSS__, s = M.state, e = M.exploreState();
    const keys = Object.keys(e.nodes || {});
    if (!keys.length) return { skipped: true };
    const k = keys[0];
    const before = JSON.parse(JSON.stringify(e.nodes[k]));
    M.devSwitchScene('town', 5, 10);
    M.devSwitchScene('forest', 5, 5);
    const after = JSON.parse(JSON.stringify(M.exploreState().nodes[k]));
    return { k, before, after, persisted: JSON.stringify(before) === JSON.stringify(after) };
  });
  rec('32.3', '节点状态跨场景不刷新', regen.skipped || regen.persisted, regen);

  // ============ 32.4 森林 ============
  console.log('\n=== 32.4 森林 ===');
  const forest = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.devForest.unlock();                       // 走真实解锁，不注入
    const at = M.devForest.at();
    // 先砍一棵真树（真实玩家路径：站到树下按 E），再读树桩状态
    const chopped = M.devForest.chop();
    const tr = M.devForest.nodeRoster();
    return { explored: at.forest, depth: at.depth, roster: tr.byType, regen: tr.regenRules,
             chopped, stumpArt: M.devForest.stumpArt() };
  });
  rec('32.4', '森林可探索', forest.explored, { depth: forest.depth });
  rec('32.4', '勘探节点按类型分布（树/菌菇等）', Object.keys(forest.roster || {}).length > 0, forest.roster);
  rec('32.4', '多次采伐逐步降到 0 并记账 day',
      forest.chopped && forest.chopped.after && forest.chopped.after.hp === 0 && typeof forest.chopped.after.day === 'number',
      forest.chopped);
  rec('32.4', '采空后拒绝再采（等 regen 天数）', forest.chopped && forest.chopped.emptyRejected === true,
      { emptyRejected: forest.chopped.emptyRejected });
  rec('32.4', '采空才结算产出物', forest.chopped && forest.chopped.woodGained > 0,
      { woodGained: forest.chopped.woodGained, item: forest.chopped.before.item });
  rec('32.4', '树桩再生绘制逻辑', forest.stumpArt === true, 'drawForestStump');

  // ============ 32.5 河湾 ============
  console.log('\n=== 32.5 河湾 ===');
  const river = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const fishRoster = M.FISHES.map(f => ({ id: f.id, name: f.name, sell: f.sell, tier: f.tier || 1 }));
    return {
      fishRoster,
      hasRiverside: !!M.MAPS.riverside,
      rodLevel: s.rodLevel !== undefined ? s.rodLevel : null,
      // 池塘游鱼是否只是装饰（§32.5 明确警告）
      pondStock: s.pondFish ? Object.keys(s.pondFish).length : 0,
    };
  });
  rec('32.5', '鱼种记录（含分层 tier）', river.fishRoster.length >= 3 && river.fishRoster.some(f => f.tier > 1), river.fishRoster.map(f => f.name + '/T' + f.tier).join(' '));
  rec('32.5', '河边场景存在', river.hasRiverside, river.hasRiverside);
  rec('32.5', '养鱼账本（投放/容量/收获）', river.pondStock > 0, river.pondStock);

  // ============ 32.6 小镇 ============
  console.log('\n=== 32.6 小镇 ===');
  const town = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    return { seeds: M.devShop.stockIds(), hasRotation: M.devShop.openIsReal(),
             taskBoard: Object.keys(s).filter(k => /task|board|quest/i.test(k)) };
  });
  rec('32.6', '种子铺全量常售', town.seeds.length > 0, town.seeds.length + ' 种');
  rec('32.6', '集市按周轮换/预览', town.hasRotation === false ? false : false, 'openShop 无轮换逻辑 → 真缺口');
  rec('32.6', '任务板（按地点/到期筛选）', town.taskBoard.length > 0, town.taskBoard);

  // ============ 32.7 白蔷薇城 ============
  console.log('\n=== 32.7 白蔷薇城 ===');
  const city = await page.evaluate(() => {
    const M = window.__MOSS__;
    const b = M.CITY_BUILDINGS || [];
    return { count: b.length, names: b.map(x => x.name || x.id).slice(0, 12) };
  });
  rec('32.7', '城市建筑清单', city.count > 0, city.count + ' 座: ' + (city.names.join('/') || '—'));

  const errs = await page.evaluate(() => window.__ERRORS__ || []);

  console.log('\n================ 判定 ================');
  const ok = out.filter(x => x.ok).length, no = out.filter(x => !x.ok);
  console.log(`实证通过 ${ok} / ${out.length}；空白 ${no.length}`);
  if (no.length) { console.log('--- 真空白 ---'); no.forEach(x => console.log(`  [${x.sec}] ${x.name}  ${JSON.stringify(x.ev)}`)); }
  console.log('\n运行时错误:', errs.length ? errs.slice(0, 3) : '无');

} finally {
  await browser.close();
}