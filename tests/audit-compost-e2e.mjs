// 堆肥系统端到端审计（§32.2 堆肥闭环）
import { launch, boot, sleepViaMenu, dismissSettlement, closeWin } from './harness.mjs';

const { browser, page } = await launch();
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : `→ ${JSON.stringify(extra)}`); }
};

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  // ---- 1. 物品与配方存在 ----
  console.log('\n=== 1. 定义与配方 ===');
  const defs = await page.evaluate(() => {
    const M = window.__MOSS__;
    return {
      devCompost: !!M.ITEMS.dev_compost,
      hooks: { load: typeof M.compostLoad, claim: typeof M.compostClaim, tool: typeof M.toolCompost,
               craft: typeof M.craft, place: typeof M.toolPlace },
      devDevice: M.ITEMS.dev_compost.device,
      compostSell: M.ITEMS.compost.sell,
      compostKind: M.ITEMS.compost.kind,
      recipe: M.devCompost.recipe(),
      bonus: M.devCompost.bonus(),
      toolSlot: M.devCompost.slot(),
      icon: M.devCompost.hasIcon(),
    };
  });
  t('堆肥箱物品已定义且为 device', defs.devCompost && defs.devDevice === 'compost', defs);
  t('熟肥为 material 且有售价', defs.compostKind === 'material' && defs.compostSell > 0, defs);
  t('堆肥配方入 RECIPES', !!defs.recipe && defs.recipe.out === 'dev_compost', defs.recipe);
  t('熟肥补肥力常量为正', defs.bonus > 0, defs.bonus);
  t('快捷栏第 10 格为施肥', defs.toolSlot && defs.toolSlot.slot === 10, defs.toolSlot);
  t('熟肥有独立图标', defs.icon);

  // ---- 2. 配方可实际制造 ----
  console.log('\n=== 2. 配方制造堆肥箱 ===');
  const crafted = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.wood = 30; s.inventory.stone = 30;
    const locked = s.npcFriendship.yaya < 25;
    const before = M.invCount('dev_compost');
    const okLocked = M.devCompost.craft();          // 未解锁时应失败且不扣料
    const woodAfterFail = s.inventory.wood;
    s.npcFriendship.yaya = 30;
    const ok = M.devCompost.craft();
    return { ok, okLocked, locked, noSpendOnFail: woodAfterFail === 30,
             before, after: M.invCount('dev_compost'), wood: s.inventory.wood, stone: s.inventory.stone };
  });
  t('未解锁时不造也不扣材料', crafted.okLocked === false && crafted.noSpendOnFail === true, crafted);
  t('好感达标后可造出堆肥箱', crafted.ok && crafted.after === crafted.before + 1, crafted);
  t('材料已扣除', crafted.wood < 30 && crafted.stone < 30, crafted);

  // ---- 3. 放置设备 ----
  console.log('\n=== 3. 放置堆肥箱 ===');
  const placed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.selectedDevice = 'dev_compost';
    M.invCount('dev_compost') || M.invAdd('dev_compost', 1);
    const ok = M.devCompost.place(12, 5);
    
    var a = M.devCompost.at(12,5);
    return { ok, exists: !!a, device: a && a.device, input: a && a.input, ready: a && a.ready };
  });
  t('堆肥箱可放置到田里', placed.ok && placed.exists && placed.device === 'compost', placed);
  t('新设备初始为空闲', placed.input === 0 && placed.ready === false, placed);

  // ---- 4. 投入材料 ----
  console.log('\n=== 4. 投入材料沤肥 ===');
  const loaded = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, st = M.devCompost.at(12, 5);
    s.inventory.radish = 2; s.inventory.potato = 2;
    const before = { r: s.inventory.radish, p: s.inventory.potato };
    const ok = M.devCompost.load(12, 5);
    return { ok, input: M.devCompost.at(12,5).input, startDay: M.devCompost.at(12,5).startDay, today: s.totalDay,
             spent: { r: before.r - (s.inventory.radish || 0), p: before.p - (s.inventory.potato || 0) } };
  });
  t('投入成功并记账 3 份', loaded.ok && loaded.input === 3, loaded);
  t('材料确实被扣除', loaded.spent.r + loaded.spent.p === 3, loaded.spent);
  t('记录起始日用于隔天计算', typeof loaded.startDay === 'number', loaded);

  const busy = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, st = M.devCompost.at(12, 5);
    s.inventory.radish = 5;
    const again = M.devCompost.load(12, 5);
    return { again, input: M.devCompost.at(12,5).input, radishKept: s.inventory.radish };
  });
  t('沤肥中不可重复投入', busy.again === false && busy.input === 3, busy);

  // ---- 5. 每日结算成熟 ----
  console.log('\n=== 5. 隔天成熟 ===');
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const matured = await page.evaluate(() => {
    return window.__MOSS__.devCompost.at(12, 5);
    return M.devCompost.at(12,5);
  });
  t('过一天后标记为可领取', matured.ready === true, matured);
  t('成熟后仍保留投入记录', matured.input === 3, matured);

  // ---- 6. 领取熟肥 ----
  console.log('\n=== 6. 领取熟肥 ===');
  const claimed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const before = M.invCount('compost');
    const ok = M.devCompost.claim(12, 5);
    var a = M.devCompost.at(12,5);
    return { ok, gained: M.invCount('compost') - before, ready: a.ready, input: a.input };
  });
  t('领取得到 1 份熟肥', claimed.ok && claimed.gained === 1, claimed);
  t('领取后设备复位空闲', claimed.ready === false && claimed.input === 0, claimed);

  // ---- 7. 撒肥补回肥力（肥力闭环）----
  console.log('\n=== 7. 撒肥补回肥力 ===');
  const fertilized = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.devFarm.hoe(8, 5);
    const p = s.plots['8,5'];
    p.fertility = 20;
    const before = p.fertility;
    s.energy = 99;
    const cBefore = M.invCount('compost');
    const ok = M.devCompost.apply(8, 5);
    return { ok, before, after: p.fertility, delta: p.fertility - before,
             used: cBefore - M.invCount('compost'), energy: s.energy };
  });
  t('撒肥成功且肥力上升', fertilized.ok && fertilized.after > fertilized.before, fertilized);
  t('肥力增量 = 堆肥常量', fertilized.delta === 8, fertilized);
  t('消耗 1 份熟肥', fertilized.used === 1, fertilized);
  t('消耗体力', fertilized.energy < 99, fertilized);

  const capped = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const p = s.plots['8,5'];
    p.fertility = 100;
    M.invAdd('compost', 2);
    const before = M.invCount('compost');
    const ok = M.devCompost.apply(8, 5);
    return { ok, fert: p.fertility, kept: M.invCount('compost'), before };
  });
  t('肥力已满时拒绝浪费（不扣熟肥）',
    capped.ok === false && capped.fert === 100 && capped.kept === capped.before, capped);

  const clampToMax = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const p = s.plots['8,5'];
    p.fertility = 96;                      // +8 会溢出，必须夹到 100
    const before = M.invCount('compost');
    const ok = M.devCompost.apply(8, 5);
    return { ok, fert: p.fertility, used: before - M.invCount('compost') };
  });
  t('接近上限时夹紧在 100 而非溢出', clampToMax.ok && clampToMax.fert === 100, clampToMax);

  const noMat = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const p = s.plots['8,5'];
    p.fertility = 30;
    M.invRemove('compost', M.invCount('compost'));
    const ok = M.devCompost.apply(8, 5);
    return { ok, fert: p.fertility };
  });
  t('无熟肥时拒绝施肥', noMat.ok === false && noMat.fert === 30, noMat);

  // ---- 8. 存档往返 ----
  console.log('\n=== 8. 存档往返 ===');
  const roundtrip = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    
    M.devCompost.load(12, 5);
    const json = JSON.stringify({ sceneId: s.sceneId, structures: s.structures, inv: s.inventory, plots: s.plots, totalDay: s.totalDay });
    const parsed = JSON.parse(json);
    return { dev: parsed.structures && parsed.structures.some(x => x.device === 'compost'),
             input: parsed.structures.filter(x => x.device === 'compost')[0].input };
  });
  t('堆肥箱状态可序列化往返', roundtrip.dev && roundtrip.input === 3, roundtrip);

  const errs = await page.evaluate(() => window.__ERRORS__ || []);
  t('无浏览器运行时错误', errs.length === 0, errs.slice(0, 3));

} finally {
  await browser.close();
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);