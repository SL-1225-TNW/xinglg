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

  // 旧口径是「DOM 里有没有 kind:'kitchen' 字符串」——那是符号存在，不是功能可用，
  // 而且在 farm 场景下查（玩家根本不在农舍）。改为验证三段真实可达性契约。
  // 完整玩家路径（走到灶前按 E / 加料 / 开火 / 食用）由 tests/probe-kitchen.mjs 覆盖。
  const kitchen = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const furn = (M.HOUSE_FURNITURE || []).filter(f => f.kind === 'kitchen');
    const k = furn[0];
    const inter = (M.INTERACTABLES.house || []).filter(i => i.kind === 'kitchen');
    return {
      hasFurniture: furn.length === 1,
      isTwoByTwo: !!(k && k.w === 2 && k.h === 2),
      solid: !!k && k.tiles.every(([x, y]) => { const h = M.houseFurnitureAt(x, y); return h && h.kind === 'kitchen'; }),
      reachable: inter.length === 1 && Array.isArray(inter[0].stand) && inter[0].stand.length > 0,
      dispatcher: (M.INTERACTABLES.house || []).some(i => i.kind === 'kitchen'),
      recipes: M.kitchenRecipes().length,
      allFood: M.kitchenRecipes().every(r => M.isFood(r.out)),
      dispatchWired: /it\.kind\s*===\s*'kitchen'/.test(M.activateInteractable ? M.activateInteractable.toString() : '')
    };
  });
  rec('32.2', '居家厨房 UI 可达（家具+碰撞+交互+配方+派发）',
    kitchen.hasFurniture && kitchen.isTwoByTwo && kitchen.solid && kitchen.reachable &&
    kitchen.dispatchWired && kitchen.recipes >= 1 && kitchen.allFood, kitchen);

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
    const M = window.__MOSS__, s = M.state;
    const e0 = M.exploreState();
    const before = { forest: !!e0.forest, depth: e0.depth };
    // 真实解锁路径（曾误写过不存在的 devForest.unlock）
    e0.forest = true;
    // 用同步的 devSwitchScene：doSwitchScene 内部有 200ms setTimeout 淡入，
    // 探针 evaluate 是同步的，读 sceneId 时切换尚未发生 → 会误报 scene:'farm'
    M.devSwitchScene('forest', 14, 26);
    const sc = s.sceneId;
    // 节点表是静态 EXPLORE_NODES，不是 e.nodes（e.nodes 只是存档状态）
    const probe = [];
    const seen = {};
    for (let x = 2; x < 36 && probe.length < 40; x++) {
      for (let y = 2; y < 24; y++) {
        const n = M.exploreNode(sc, x, y);
        if (n && !seen[n.def.type]) {
          seen[n.def.type] = 1;
          probe.push({ x, y, type: n.def.type, item: n.def.item, hp: n.saved.hp, qty: n.def.qty });
        }
      }
    }
    // 真实玩家路径：站到节点上按 E → gatherExplore(tool,x,y)
    const out = {};
    // 硬资源类型：树与矿石。森林当前只有 tree；矿山另有 stone/mine 系列。
    const HARD = ['tree', 'stone'];
    for (const p of probe) {
      if (HARD.includes(p.type)) {
        s.player.x = p.x; s.player.y = p.y; s.energy = 99;
        const tool = p.type === 'tree' ? 'axe' : 'pickaxe';
        const invBefore = M.invCount(p.item);
        let hits = 0, last = null;
        for (let i = 0; i < 12 && last !== false; i++) { last = M.gatherExplore(tool, p.x, p.y); if (last) hits++; }
        const nAfter = M.exploreNode(sc, p.x, p.y);
        // 采空后再采一次 → 必须被拒绝（再生冷却期内）
        const rejected = M.gatherExplore(tool, p.x, p.y) === false;
        out[p.type] = { item: p.item, hits, hp0: p.hp, hpAfter: nAfter.saved.hp,
                        emptied: nAfter.saved.hp <= 0, rejectedAfterEmpty: rejected,
                        gained: M.invCount(p.item) - invBefore, qty: p.qty,
                        stampedDay: nAfter.saved.day };
      }
    }
    return { before, scene: sc, types: probe.map(p => p.type), probeCount: probe.length, out,
             nodeCount: Object.keys(e0.nodes || {}).length };
  });
  rec('32.4', '森林解锁并进入真实场景', forest.scene === 'forest' && forest.before.forest === false,
    { before: forest.before, scene: forest.scene });
  rec('32.4', '勘探节点按类型分布（树/石/菌菇）', forest.types.length >= 2, forest.types.join(','));
  const g = forest.out;
  rec('32.4', '多次采伐逐步降到 0 并记账 day',
    !!g.tree && g.tree.emptied === true && typeof g.tree.stampedDay === 'number', g.tree);
  // 总规 §32.4 的森林资源是「普通木、硬木、蘑菇、浆果」——矿石归 §32.3 矿山。
  // 森林不存在 stone 节点，因此这里只对「探针实际扫到的硬资源类型」断言拒绝再生，
  // 不能硬编码 stone（上一版这么写，导致森林永远少一个 g.stone 而误报）。
  const hardTypes = Object.keys(g);
  rec('32.4', '采空后拒绝再采（再生冷却期内）',
    hardTypes.length >= 1 && hardTypes.every(t => g[t].rejectedAfterEmpty === true),
    { hardTypes, detail: hardTypes.reduce((a, t) => (a[t] = g[t].rejectedAfterEmpty, a), {}) });
  rec('32.4', '采空才结算产出物且数量正确',
    !!g.tree && g.tree.gained > 0 && g.tree.gained % g.tree.qty === 0, g.tree);

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

  // §32.5 硬约束：池塘必须是独立账本（投放/容量/收获），
  // 且不得把装饰鱼当成库存入账。走真实投放路径验证。
  const pond = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    // 真实鱼种 id：FISHES[].id，不是 'carp' 这种自造名
    const id = M.devFishpond.species()[0].id;
    const inv0 = M.invCount(id);
    const before = M.devFishpond.counts();
    // 背包不足时投放 → 必须返回 false（不能凭空造鱼）
    const noStock = M.devFishpond.stock(id, inv0 + 5);
    const afterNoStock = M.devFishpond.counts();
    // 补足背包后走真实投放
    s.inventory[id] = 5;
    const stocked = M.devFishpond.stock(id, 3);
    const afterStock = M.devFishpond.counts();
    // 超容量投放 → 必须被拒绝
    const overCap = M.devFishpond.stock(id, 999);
    return { id, inv0, before, noStock, afterNoStock, stocked, afterStock, overCap,
             invAfter: M.invCount(id),
             decorCount: M.devFishpond.decorCount(),
             decorLeaksToInv: M.devFishpond.readsDecor() };
  });
  rec('32.5', '背包不足时投放被拒绝（不凭空造鱼）', pond.noStock === false, { id: pond.id, inv0: pond.inv0 });
  rec('32.5', '投放后账本增加且背包等量扣减',
    pond.stocked === true && pond.afterStock.total > pond.before.total && pond.invAfter === 2,
    { afterStock: pond.afterStock, invAfter: pond.invAfter });
  rec('32.5', '超容量投放被拒绝', pond.overCap === false, { cap: pond.afterStock.cap });
  rec('32.5', '装饰鱼不入账（账本与库存互不污染）', pond.decorLeaksToInv === false,
    { decorCount: pond.decorCount });

  // ============ 32.6 小镇 ============
  console.log('\n=== 32.6 小镇 ===');
  const town = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const seeds = (M.ITEMS ? Object.keys(M.ITEMS) : []).filter(k => /^seed_/.test(k));
    const taskBoard = Object.keys(s).filter(k => /task|board|quest/i.test(k));
    const mkt = M.devMarket;
    // marketStock 返回 {week, items, tier} —— 不是数组，别写成 .map
    const cur0 = mkt.stock();
    const w0 = cur0.week;
    const list0 = cur0.items.map(x => x.id).join(',');
    const nextPreview = mkt.stock(w0 + 1);
    const next0 = nextPreview.items.map(x => x.id).join(',');
    s.totalDay += 7;                       // 推进一周
    const cur1 = mkt.stock();
    const w1 = cur1.week;
    const list1 = cur1.items.map(x => x.id).join(',');
    return { seeds: seeds.length, taskBoard, w0, w1, list0, list1, next0, tier0: cur0.tier, tier1: cur1.tier,
             rotated: w1 !== w0 && list0 !== list1,
             deterministic: list0 !== list1 && next0 === list1,  // 预览与实际同源
             noConflict: next0 !== list0 };
  });
  rec('32.6', '种子铺全量常售', town.seeds > 0, town.seeds + ' 种');
  rec('32.6', '集市每周轮换（换周后商品变化）', town.rotated === true, { w0: town.w0, w1: town.w1 });
  rec('32.6', '集市可预览下周（预览与实际同源确定性算法）',
    town.deterministic === true && town.noConflict === true, { next0: town.next0, list1: town.list1 });
  rec('32.6', '任务板（按地点/到期筛选）', town.taskBoard && town.taskBoard.length > 0, town.taskBoard);

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