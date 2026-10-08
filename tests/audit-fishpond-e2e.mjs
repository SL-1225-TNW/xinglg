/* 32.5 养鱼账本验收
   总规原文：「农场池塘的游鱼首先保留装饰定位；若开放养鱼，另设明确的
   投放、容量与收获账本。看见几条装饰鱼，不代表已拥有相同数量可出售鱼，
   不能把既有装饰状态偷偷转换成库存。」

   验收重点：
   - 账本独立于 Game.pondFish，装饰鱼数量变化不改变账本与背包
   - 投放是唯一入口，只能扣背包已有的鱼
   - 容量是硬上限；苗→成鱼要时间，投放当天收不走
*/
import { launch, boot, sleepViaMenu, dismissSettlement, closeWin, Report } from './harness.mjs';

const r = new Report();
const t = (name, cond, detail) => r.ok(name, cond, JSON.stringify(detail));

const { browser, page } = await launch();
try {
  await boot(page, { fresh: true });
  await page.locator('#tutorialSkip').click().catch(() => { });

  // ---------- 1. 鱼种分层 ----------
  console.log('\n=== 1. 鱼种分层 ===');
  const species = await page.evaluate(() => {
    const F = window.__MOSS__.devFishpond.species ? window.__MOSS__.devFishpond.species() : null;
    return F;
  });
  t('鱼种表可从探针读取', species !== null, species);
  t('共 7 种鱼', species && species.length === 7, species && species.map(s => s.id));
  t('T1/T2/T3 三层都有', species && [1, 2, 3].every(tier => species.some(s => s.tier === tier)),
    species && species.map(s => s.tier + ':' + s.id));
  t('每种鱼都能在 ITEMS 里查到售价（无悬空 id）',
    species && species.every(s => s.sell > 0), species && species.map(s => s.id + '=' + s.sell));

  // ---------- 2. 账本初始状态 ----------
  console.log('\n=== 2. 账本初始状态 ===');
  const init = await page.evaluate(() => window.__MOSS__.devFishpond.counts());
  t('新档账本为空', init.total === 0 && init.fry === 0 && init.grown === 0, init);
  t('账本有基础容量', init.cap === 6, init);
  t('账本进入存档（不是临时状态）',
    await page.evaluate(() => window.__MOSS__.devFishpond.saveHasFishpond()), init);

  // ---------- 3. 红线：装饰鱼 ≠ 库存 ----------
  console.log('\n=== 3. 红线：装饰鱼不得当库存 ===');
  const decorBefore = await page.evaluate(() => window.__MOSS__.devFishpond.decorCount());
  const ledgerBefore = await page.evaluate(() => window.__MOSS__.devFishpond.counts());
  const invBefore = await page.evaluate(() => window.__MOSS__.invCount('fish_crucian'));
  t('池塘里确实有装饰鱼（否则这条断言没有意义）', decorBefore > 0, { decorBefore });
  t('装饰鱼存在时账本仍为空', ledgerBefore.total === 0, { decorBefore, ledgerBefore });
  t('装饰鱼存在时背包里没有鱼', invBefore === 0, { decorBefore, invBefore });

  // 清掉装饰鱼，账本和背包必须纹丝不动
  const afterClear = await page.evaluate(() => {
    const M = window.__MOSS__;
    const cleared = M.devFishpond.decorClear();
    return { cleared, decor: M.devFishpond.decorCount(), ledger: M.devFishpond.counts(), inv: M.invCount('fish_crucian') };
  });
  t('清空装饰鱼后账本不变', afterClear.ledger.total === ledgerBefore.total, afterClear);
  t('清空装饰鱼后背包不变', afterClear.inv === invBefore, afterClear);
  t('装饰鱼清空后 ensurePondFish 会重建（说明它确实是独立视觉层）',
    await page.evaluate(() => window.__MOSS__.devFishpond.decorCount() > 0), afterClear);
  // 静态红线：账本核心函数体内一次都不能出现 pondFish
  t('账本核心函数完全不引用装饰鱼（静态取证）',
    await page.evaluate(() => window.__MOSS__.devFishpond.readsDecor() === false), { readsDecor: false });

  // ---------- 4. 投放规则 ----------
  console.log('\n=== 4. 投放规则 ===');
  const noFish = await page.evaluate(() => window.__MOSS__.devFishpond.stock('fish_crucian', 1));
  t('背包没鱼时投放失败', noFish === false, { noFish });

  const giveFish = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.invAdd('fish_crucian', 3);
    return { inv: M.invCount('fish_crucian'), ledger: M.devFishpond.counts() };
  });
  t('投放前鱼只在背包里，不在账本', giveFish.ledger.total === 0 && giveFish.inv === 3, giveFish);

  const stocked = await page.evaluate(() => {
    const M = window.__MOSS__;
    const ok = M.devFishpond.stock('fish_crucian', 2);
    return { ok, inv: M.invCount('fish_crucian'), ledger: M.devFishpond.counts() };
  });
  t('投放 2 条：背包扣 2、账本加 2',
    stocked.ok && stocked.inv === 1 && stocked.ledger.fry === 2 && stocked.ledger.total === 2, stocked);
  t('投放的是鱼苗不是成鱼', stocked.ledger.grown === 0 && stocked.ledger.fry === 2, stocked);

  const badId = await page.evaluate(() => window.__MOSS__.devFishpond.stock('fish_not_a_real_kind', 1));
  t('不存在的鱼种拒绝投放', badId === false, { badId });

  // ---------- 5. 容量硬上限 ----------
  console.log('\n=== 5. 容量硬上限 ===');
  const overCap = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.invAdd('fish_crucian', 20);
    const invBefore = M.invCount('fish_crucian');
    const before = M.devFishpond.counts().total;
    const ok = M.devFishpond.stock('fish_crucian', 10);   // 2+10=12 > cap 6
    return { ok, before, invBefore, after: M.devFishpond.counts(), inv: M.invCount('fish_crucian') };
  });
  t('超出容量拒绝投放', overCap.ok === false, overCap);
  // 正确行为：容量不足时投放被拒且背包一尾不少，而不是「变成 20」
  t('拒绝时不扣背包的鱼', overCap.inv === overCap.invBefore, overCap);
  t('拒绝后账本数量不变', overCap.after.total === overCap.before, overCap);

  const fillToCap = await page.evaluate(() => {
    const M = window.__MOSS__;
    const ok = M.devFishpond.stock('fish_crucian', 4);    // 2+4=6 = cap
    return { ok, ledger: M.devFishpond.counts() };
  });
  t('刚好填满容量可以投放', fillToCap.ok && fillToCap.ledger.total === 6, fillToCap);

  // ---------- 6. 收获：苗当天收不走 ----------
  console.log('\n=== 6. 收获：苗→成鱼 ===');
  const earlyHarvest = await page.evaluate(() => {
    const M = window.__MOSS__;
    const invBefore = M.invCount('fish_crucian');
    const ok = M.devFishpond.release();
    return { ok, invBefore, invAfter: M.invCount('fish_crucian'), ledger: M.devFishpond.counts() };
  });
  t('投放当天收不到鱼（还没长成）', earlyHarvest.ok === false, earlyHarvest);
  t('收获失败不损失鱼苗', earlyHarvest.ledger.fry === 6, earlyHarvest);
  // 正确行为：收获被拒时背包数量完全不变
  t('收获失败不给背包加鱼', earlyHarvest.invAfter === earlyHarvest.invBefore, earlyHarvest);

  // 睡 1 天：还没到 2 天，仍是鱼苗
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const day1 = await page.evaluate(() => window.__MOSS__.devFishpond.counts());
  t('第 1 天后仍是鱼苗（growDays=2）', day1.fry === 6 && day1.grown === 0, day1);

  // 睡第 2 天：鱼苗转成鱼
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const day2 = await page.evaluate(() => window.__MOSS__.devFishpond.counts());
  t('第 2 天后 6 条全部长成成鱼', day2.grown === 6 && day2.fry === 0, day2);
  t('苗转成不改变总占用容量', day2.total === 6, day2);

  // ---------- 7. 收获入包 ----------
  console.log('\n=== 7. 收获入包 ===');
  const harvested = await page.evaluate(() => {
    const M = window.__MOSS__;
    const before = M.invCount('fish_crucian');
    const ok = M.devFishpond.release();
    return { ok, gained: M.invCount('fish_crucian') - before, ledger: M.devFishpond.counts() };
  });
  t('收获 6 条进背包', harvested.ok && harvested.gained === 6, harvested);
  t('收获后账本清空', harvested.ledger.total === 0 && harvested.ledger.grown === 0, harvested);

  const emptyHarvest = await page.evaluate(() => window.__MOSS__.devFishpond.release());
  t('空塘重复收获被拒绝', emptyHarvest === false, { emptyHarvest });

  // ---------- 8. 扩容 ----------
  console.log('\n=== 8. 扩容 ===');
  const upg = await page.evaluate(() => {
    const M = window.__MOSS__;
    const cost = M.devFishpond.upgradeCost();
    const coins = M.state.coins;
    M.state.coins = cost;
    const ok = M.devFishpond.upgrade();
    return { cost, coins, ok, cap: M.devFishpond.counts().cap, left: M.state.coins };
  });
  t('扩容成功且容量 +3', upg.ok && upg.cap === 9, upg);
  t('扩容扣掉对应金币', upg.left === 0, upg);

  const poorUpg = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.coins = 0;
    const before = M.devFishpond.counts().cap;
    const ok = M.devFishpond.upgrade();
    return { ok, before, after: M.devFishpond.counts().cap };
  });
  t('金币不足拒绝扩容', poorUpg.ok === false && poorUpg.after === poorUpg.before, poorUpg);

  // ---------- 9. 换水 ----------
  console.log('\n=== 9. 换水 ===');
  const water = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.energy = 99;
    const raw = M.devFishpond.raw();
    const ok = M.devFishpond.water();
    return { before: raw.watered, ok, after: M.devFishpond.raw().watered, energy: M.state.energy };
  });
  t('换水成功并标记当天已换', water.before === false && water.ok && water.after === true, water);
  t('换水消耗体力', water.energy === 96, water);
  const dupWater = await page.evaluate(() => window.__MOSS__.devFishpond.water());
  t('同一天重复换水被拒绝', dupWater === false, { dupWater });

  // ---------- 10. 存档往返 ----------
  console.log('\n=== 10. 存档往返 ===');
  const round = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.invAdd('fish_crucian', 4);
    // 先把塘清空再投放，避免被前面用例留下的鱼污染断言
    while (M.devFishpond.counts().total > 0) {
      M.devFishpond.daily({}); M.devFishpond.daily({}); M.devFishpond.release();
    }
    const stocked = M.devFishpond.stock('fish_crucian', 2);
    const raw = M.devFishpond.serialize();
    const json = JSON.parse(JSON.stringify(raw));
    return { json, stocked, cap: M.devFishpond.counts().cap, total: M.devFishpond.counts().total };
  });
  t('账本可完整序列化', round.stocked && round.json.fry && round.json.fry.fish_crucian === 2, round.json);
  t('序列化保留容量', typeof round.json.cap === 'number' && round.json.cap > 0, round.json);

  const oldSave = await page.evaluate(() => {
    const M = window.__MOSS__;
    // 老存档：完全没有 fishpond 字段
    const legacy = { totalDay: 5, inventory: {}, structures: [] };
    M.devFishpond.migrate(legacy);
    return legacy.fishpond;
  });
  t('老存档经迁移后得到空账本', oldSave && !!oldSave.cap && !!oldSave.fry && !!oldSave.grown, oldSave);
  t('老存档迁移后不凭空产生鱼',
    oldSave && Object.keys(oldSave.fry).length === 0 && Object.keys(oldSave.grown).length === 0, oldSave);
  // 迁移红线：已有账本的存档再次迁移，鱼不能被清空
  const keepOld = await page.evaluate(() => {
    const M = window.__MOSS__;
    const s = { fishpond: { fry: { fish_crucian: 5 }, grown: {}, cap: 12, growDay: 1, watered: true } };
    M.devFishpond.migrate(s);
    return s.fishpond;
  });
  t('迁移不会清空已有账本的鱼', keepOld.fry.fish_crucian === 5, keepOld);
  t('迁移保留已有容量', keepOld.cap === 12, keepOld);

  // ---------- 11. UI ----------
  console.log('\n=== 11. UI 面板 ===');
  await page.evaluate(() => { window.__MOSS__.state.inventory.fish_crucian = 2; });
  await page.evaluate(() => window.__MOSS__.devFishpond.open());
  await page.waitForTimeout(300);
  const uiOk = await page.locator('.win').count();
  t('池塘账本窗口能打开', uiOk > 0, { uiOk });
  const uiText = uiOk ? await page.locator('.win').first().innerText() : '';
  t('窗口里有容量显示', /容量/.test(uiText), uiText.slice(0, 120));
  t('窗口里写明装饰鱼不是库存', /装饰/.test(uiText), uiText.slice(0, 200));
  const noErr = await page.evaluate(() => window.__consoleErrors || []);
  t('打开窗口无控制台报错', noErr.length === 0, noErr);

  // ---------- 12. 真实入口：走到池塘北岸点击 ----------
  console.log('\n=== 12. 真实玩家入口 ===');
  await closeWin(page).catch(() => { });
  const entry = await page.evaluate(() => {
    const M = window.__MOSS__;
    // 池塘交互点注册在 POND_AREA 正上方一格
    const it = (M.INTERACTABLES.farm || []).find(i => i.kind === 'pond');
    return { found: !!it, it: it || null };
  });
  t('农场池塘已注册为可交互物', entry.found, entry.it);

  const opened = await page.evaluate(() => {
    const M = window.__MOSS__;
    const it = (M.INTERACTABLES.farm || []).find(i => i.kind === 'pond');
    M.state.x = it.x; M.state.y = it.y + 1;          // 站到岸边
    M.activateInteractable(it);
    return { wins: document.querySelectorAll('.win').length };
  });
  t('点击池塘能打开账本窗口（真实入口可用）', opened.wins > 0, opened);

  const e2eText = opened.wins ? await page.locator('.win').first().innerText() : '';
  t('真实入口打开的窗口含投放按钮或容量说明',
    /容量|投放|收获/.test(e2eText), e2eText.slice(0, 160));
  await closeWin(page).catch(() => { });
} catch (e) {
  t('脚本执行异常', false, String(e).slice(0, 300));
} finally {
  r.summary();
  await browser.close();
}