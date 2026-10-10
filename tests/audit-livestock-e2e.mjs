// 畜养系统端到端审计（§32.2「先做鸡与羊，提供蛋、羊毛、饮水、喂养与有限动物互动」）
// 断言纪律（见 spec-vs-implementation-audit 铁律）：
//   先回答「正确行为是什么」再写断言 —— 例如「未喂食照样产蛋」是 bug，不是设计。
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

  // ---- 1. 定义与配方 ----
  console.log('\n=== 1. 定义与配方 ===');
  const defs = await page.evaluate(() => {
    const M = window.__MOSS__;
    return {
      coopItem: !!M.ITEMS.dev_coop, coopDevice: M.ITEMS.dev_coop && M.ITEMS.dev_coop.device,
      pastureItem: !!M.ITEMS.dev_pasture, pastureDevice: M.ITEMS.dev_pasture && M.ITEMS.dev_pasture.device,
      eggKind: M.ITEMS.egg && M.ITEMS.egg.kind, eggSell: M.ITEMS.egg && M.ITEMS.egg.sell,
      woolKind: M.ITEMS.wool && M.ITEMS.wool.kind, woolSell: M.ITEMS.wool && M.ITEMS.wool.sell,
      coopRecipe: M.devLivestock.recipe('coop'), pastureRecipe: M.devLivestock.recipe('pasture'),
      coopCfg: M.devLivestock.cfg('coop'), pastureCfg: M.devLivestock.cfg('pasture'),
      icons: { coop: M.devLivestock.hasIcon('dev_coop'), pasture: M.devLivestock.hasIcon('dev_pasture'),
               egg: M.devLivestock.hasIcon('egg'), wool: M.devLivestock.hasIcon('wool') }
    };
  });
  t('鸡舍/羊圈均为 device 物品', defs.coopDevice === 'coop' && defs.pastureDevice === 'pasture', defs);
  t('鸡蛋为可食用且有售价', defs.eggKind === 'food' && defs.eggSell > 0, defs);
  t('羊毛为 material 且有售价', defs.woolKind === 'material' && defs.woolSell > 0, defs);
  t('两条配方已入 RECIPES', !!defs.coopRecipe && !!defs.pastureRecipe, defs);
  t('四个新图标均可绘制', Object.values(defs.icons).every(Boolean), defs.icons);
  t('羊周期 3 天长于鸡周期 1 天', defs.pastureCfg.everyDays === 3 && defs.coopCfg.everyDays === 1, defs);

  // ---- 2. 制造（未解锁不扣料）----
  console.log('\n=== 2. 制造鸡舍与羊圈 ===');
  const crafted = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.wood = 40; s.inventory.stone = 20;
    s.npcFriendship.yaya = 0;
    const lockedOk = M.devLivestock.craft('coop');
    const woodAfterFail = s.inventory.wood;
    s.npcFriendship.yaya = 30;
    const coopOk = M.devLivestock.craft('coop');
    const pastureOk = M.devLivestock.craft('pasture');
    return { lockedOk, noSpendOnFail: woodAfterFail === 40, coopOk, pastureOk,
             coop: M.invCount('dev_coop'), pasture: M.invCount('dev_pasture') };
  });
  t('未解锁时不造也不扣材料', crafted.lockedOk === false && crafted.noSpendOnFail === true, crafted);
  t('好感达标后可造出鸡舍与羊圈', crafted.coopOk && crafted.pastureOk && crafted.coop === 1 && crafted.pasture === 1, crafted);

  // ---- 3. 放置 ----
  console.log('\n=== 3. 放置设备 ===');
  const placed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const coopOk = M.devLivestock.place('coop', 12, 5);
    const pastureOk = M.devLivestock.place('pasture', 13, 5);
    const a = M.devLivestock.at(12, 5), b = M.devLivestock.at(13, 5);
    return { coopOk, pastureOk, coop: a, pasture: b };
  });
  t('鸡舍可放置', placed.coopOk && placed.coop.device === 'coop', placed);
  t('羊圈可放置', placed.pastureOk && placed.pasture.device === 'pasture', placed);
  t('新设备今日尚未照料', placed.coop.fed === false && placed.coop.watered === false, placed.coop);
  t('照料缺失有明确提示', placed.coop.notes.length === 2, placed.coop.notes);

  // ---- 4. 喂食与饮水 ----
  console.log('\n=== 4. 喂食与饮水 ===');
  const fed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.potato = 6;
    const before = M.invCount('potato');
    const ok = M.devLivestock.feed(12, 5);
    return { ok, used: before - M.invCount('potato'), st: M.devLivestock.at(12, 5) };
  });
  t('喂食消耗 2 份口粮', fed.ok && fed.used === 2, fed);
  t('喂食后今日标记已喂', fed.st.fed === true, fed.st);
  t('喂食后仅剩缺水提示', fed.st.notes.length === 1 && fed.st.notes[0] === '水盆空了', fed.st.notes);

  const refed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const before = M.invCount('potato');
    const ok = M.devLivestock.feed(12, 5);
    return { ok, used: before - M.invCount('potato') };
  });
  t('同日重复喂食被拒且不再扣料', refed.ok === false && refed.used === 0, refed);

  const watered = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.energy = 99;
    const ok = M.devLivestock.water(12, 5);
    return { ok, energy: s.energy, st: M.devLivestock.at(12, 5) };
  });
  t('添水消耗体力并标记', watered.ok && watered.energy < 99 && watered.st.watered === true, watered);
  t('照料齐全后无任何提示', watered.st.notes.length === 0, watered.st.notes);

  const rewater = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.energy = 99;
    const ok = M.devLivestock.water(12, 5);
    return { ok, energy: s.energy };
  });
  t('同日重复添水被拒且不再扣体力', rewater.ok === false && rewater.energy === 99, rewater);

  // ---- 5. 互动 ----
  console.log('\n=== 5. 有限动物互动 ===');
  const pet = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.energy = 99;
    const invBefore = JSON.stringify(M.state.inventory);
    const ok = M.devLivestock.pet(12, 5);
    return { ok, invChanged: JSON.stringify(M.state.inventory) !== invBefore };
  });
  t('照料齐全时可互动且不叠加数值奖励', pet.ok && pet.invChanged === false, pet);

  // ---- 6. 无饲料时的拒绝路径 ----
  console.log('\n=== 6. 无饲料拒绝 ===');
  const noFeed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.potato = 0; s.inventory.radish = 0; s.inventory.strawberry = 0;
    const ok = M.devLivestock.feed(13, 5);
    return { ok, st: M.devLivestock.at(13, 5) };
  });
  t('无任何饲料时喂食失败且不算已喂', noFeed.ok === false && noFeed.st.fed === false, noFeed);

  // ---- 6b. 喂了一半要打折 ----
  console.log('\n=== 6b. 半份口粮打折 ===');
  const halfFeed = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.invAdd('dev_coop', 1);
    M.devLivestock.place('coop', 14, 6);      // 干净位置
    s.inventory.potato = 1;                  // 只够喂 1 份（需 2）
    s.inventory.radish = 0; s.inventory.strawberry = 0;
    s.energy = 99;
    const ok = M.devLivestock.feed(14, 6);
    return { ok, st: M.devLivestock.at(14, 6), potato: M.invCount('potato') };
  });
  t('只喂 1 份也算喂了，但记录 fedQty', halfFeed.ok && halfFeed.st.fed === true && halfFeed.st.fedQty === 1, halfFeed);
  t('喂了就把仅有的 1 份土豆用掉', halfFeed.potato === 0, halfFeed);

  // ---- 7. 产蛋：照料齐全 ----
  console.log('\n=== 7. 产蛋周期 ===');
  // 正确契约：安置当天不算，第 2 天睡醒应有 1 枚蛋，此后每天 1 枚。
  // pending 允许 >1，因为漏喂的那天会在下次照料齐全时补齐（不丢产出）。
  await page.evaluate(() => { const s = window.__MOSS__.state; s.energy = 99; });
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const d1 = await page.evaluate(() => window.__MOSS__.devLivestock.at(12, 5));
  t('安置当日结束尚未产出（firstDay=2）', d1.pending === 0, d1);

  await page.evaluate(() => {
    const M = window.__MOSS__; M.state.inventory.potato = 6;
    M.devLivestock.feed(12, 5); M.devLivestock.water(12, 5);
  });
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const d2 = await page.evaluate(() => {
    const M = window.__MOSS__;
    return { st: M.devLivestock.at(12, 5), egg: M.invCount('egg') };
  });
  t('第 2 天起开始产蛋，且累积在栏里不自动进包',
    d2.st.pending >= 1 && d2.egg === 0, d2);

  // ---- 8. 收取 ----
  console.log('\n=== 8. 收取产出 ===');
  const claimed = await page.evaluate(() => {
    const M = window.__MOSS__;
    const before = M.invCount('egg');
    const ok = M.devLivestock.claim(12, 5);
    return { ok, gained: M.invCount('egg') - before, st: M.devLivestock.at(12, 5) };
  });
  t('收取使鸡蛋进包且栏里清空', claimed.ok && claimed.gained === 2 && claimed.st.pending === 0, claimed);

  const reclaim = await page.evaluate(() => window.__MOSS__.devLivestock.claim(12, 5));
  t('空栏重复收取被拒', reclaim === false, { reclaim });

  // ---- 9. 照料短缺只降产出、不死亡（§32.2 明令）----
  console.log('\n=== 9. 照料短缺降产但不死亡 ===');
  const neglect = await page.evaluate(async () => {
    const M = window.__MOSS__, s = M.state;
    // 三天不照料：既不喂也不水
    return { hasDeathField: 'dead' in (M.devLivestock.at(12, 5) || {}) };
  });
  t('数据结构不含死亡字段（不设处死分支）', neglect.hasDeathField === false, neglect);

  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const n1 = await page.evaluate(() => window.__MOSS__.devLivestock.at(12, 5));
  // 正确行为：不照料时 rate=0.25，单日 0.25 份不足 1 枚，所以本轮 pending 不增长，
  // 但小数存量 stock 必须在涨——这才是「降低产出」而非「取消产出」。
  t('未照料时按 0.25 效率缓慢积累而非停产', n1.stock > 0 || n1.pending > 0, n1);
  await page.evaluate(() => {
    const M = window.__MOSS__; M.state.inventory.potato = 6;
    M.devLivestock.feed(12, 5); M.devLivestock.water(12, 5);
  });
  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  const n2 = await page.evaluate(() => {
    const M = window.__MOSS__;
    const st = M.devLivestock.at(12, 5);
    return { pending: st.pending, mood: st.mood, stillThere: !!st };
  });
  t('恢复照料后继续累积产出', n2.pending >= 1, n2);
  t('照料齐全的天数累积进 mood', n2.mood >= 1, n2);

  // ---- 10. 羊 3 天周期：另起一个干净羊圈独立验证，避免受前面天数污染 ----
// 正确契约：安置当天不算；第 1 天后必无产出；第 3 天后产出 1 份羊毛。
  // 计数基准：羊置于 totalDay=D，睡眠使 D→D+1。产出需 since=D3-D+1 >= 3，
  // 即睡到 totalDay = D+2 才满足 firstDay，再过一次结算才真正入栏。
  console.log('\n=== 10. 羊 3 天周期 ===');
  const sheepDay0 = await page.evaluate(() => window.__MOSS__.state.totalDay);
  await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.invAdd('dev_pasture', 1);
    M.devLivestock.place('pasture', 12, 8);     // 全新位置，避免被前面测试污染
    s.inventory.potato = 6; s.energy = 99;
    M.devLivestock.feed(12, 8); M.devLivestock.water(12, 8);
  });
  const shDay0 = await page.evaluate(() => window.__MOSS__.devLivestock.at(12, 8));
  t('羊刚安置好栏里为空', shDay0.pending === 0 && shDay0.fed === true, shDay0);

  for (let i = 1; i <= 2; i++) {
    await sleepViaMenu(page);
    await dismissSettlement(page).catch(() => { });
    await closeWin(page).catch(() => { });
    await page.evaluate(() => {
      const M = window.__MOSS__; M.state.inventory.potato = 6; M.state.energy = 99;
      M.devLivestock.feed(12, 8); M.devLivestock.water(12, 8);
    });
  }
  const shMid = await page.evaluate(() => window.__MOSS__.devLivestock.at(12, 8));
  t('羊前两天均无产出（firstDay=3）', shMid.pending === 0, shMid);

  await sleepViaMenu(page);
  await dismissSettlement(page).catch(() => { });
  await closeWin(page).catch(() => { });
  await page.evaluate(() => {
    const M = window.__MOSS__; M.state.inventory.potato = 6; M.state.energy = 99;
    M.devLivestock.feed(12, 8); M.devLivestock.water(12, 8);
  });
  const shDay3 = await page.evaluate(() => window.__MOSS__.devLivestock.at(12, 8));
  t('羊第 3 天后产出 1 份羊毛', shDay3.pending === 1, shDay3);

  const woolClaimed = await page.evaluate(() => {
    const M = window.__MOSS__;
    const before = M.invCount('wool');
    const ok = M.devLivestock.claim(12, 8);
    return { ok, gained: M.invCount('wool') - before, st: M.devLivestock.at(12, 8) };
  });
  t('收取羊毛入包且栏里清空', woolClaimed.ok && woolClaimed.gained === 1 && woolClaimed.st.pending === 0, woolClaimed);

  // ---- 11. 收起保护（有产出不许收）----
  console.log('\n=== 11. 收起保护 ===');
  const pickup = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const st = M.devLivestock.at(12, 5);
    // 人为把 pending 顶满以测试守卫
    const raw = s.structures.filter(x => x.device === 'coop')[0];
    raw.livestock.pending = 3;
    const before = M.invCount('dev_coop');
    const ok = M.devLivestock.pickup(12, 5);
    return { hadPending: true, ok, inv: M.invCount('dev_coop'), before };
  });
  t('栏里攒着产出时拒绝收起（防丢牲畜状态）', pickup.ok === false && pickup.inv === pickup.before, pickup);

  const pickupEmpty = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const raw = s.structures.filter(x => x.device === 'coop')[0];
    raw.livestock.pending = 0;
    const before = M.invCount('dev_coop');
    const ok = M.devLivestock.pickup(12, 5);
    return { ok, gained: M.invCount('dev_coop') - before };
  });
  t('空栏时可正常收起并拿回设备', pickupEmpty.ok === true && pickupEmpty.gained === 1, pickupEmpty);

  // ---- 12. 存档往返 ----
  console.log('\n=== 12. 存档往返 ===');
  const roundtrip = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.invAdd('dev_pasture', 1);
    M.devLivestock.place('pasture', 12, 6);
    s.inventory.potato = 6;
    M.devLivestock.feed(12, 6);
    const raw = JSON.stringify(s.structures.filter(x => x.device === 'pasture')[0]);
    const parsed = JSON.parse(raw);
    return { hasLivestockField: !!parsed.livestock, fedDay: parsed.livestock && parsed.livestock.fedDay,
             today: s.totalDay, pending: parsed.livestock && parsed.livestock.pending };
  });
  t('畜养状态可序列化往返', roundtrip.hasLivestockField && typeof roundtrip.fedDay === 'number', roundtrip);
  t('已喂食日记录为某一天且不晚于今日',
    typeof roundtrip.fedDay === 'number' && roundtrip.fedDay <= roundtrip.today, roundtrip);

  // ---- 13. 售出路径（物品可卖，非惩罚机制）----
  console.log('\n=== 13. 售出 ===');
  const sold = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.invAdd('egg', 2); M.invAdd('wool', 1);
    return { eggPrice: M.devLivestock.sellPrice('coop'), woolPrice: M.devLivestock.sellPrice('pasture'),
             eggSell: M.ITEMS.egg.sell, woolSell: M.ITEMS.wool.sell };
  });
  t('蛋与羊毛均可定价出售', sold.eggPrice > 0 && sold.woolPrice > 0 && sold.eggSell === sold.eggPrice, sold);

  const errs = await page.evaluate(() => window.__ERRORS__ || []);
  t('无浏览器运行时错误', errs.length === 0, errs.slice(0, 3));

} finally {
  await browser.close();
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);