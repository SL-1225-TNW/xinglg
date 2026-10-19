/* R4 收口 · 旧档兼容：把 R4 之前的老存档原样塞回 localStorage，
   重新载入后不仅不报错，还要能真实继续玩：照料、计划、季节备货、安置援助。 */
import assert from 'node:assert/strict';
import { launch, boot, isolatedPage } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

/* ---------- 造一份 R4 之前的老存档 ---------- */
const legacy = await p.evaluate(() => {
  const M = __MOSS__;
  const raw = JSON.parse(JSON.stringify(M.serialize()));
  /* 这些字段在 R4 之前都不存在，逐个删掉才是真老档而不是「新档少一个键」。 */
  ['farmCare', 'farmPlan', 'seasonStock', 'settlementAid',
    'millLife', 'meadowLife', 'militaryLife', 'professionalLife', 'travel', 'soil',
    'palace', 'university', 'southGate', 'industry', 'construction', 'char'].forEach(k => { delete raw[k]; });
  raw.totalDay = 5;
  raw.coins = 777;
  raw.sceneId = 'farm';
  raw.player = { x: 9, y: 10, face: 'down' };
  raw.inventory.radish = 5;
  raw.shipping = {};
  return { raw: raw, keys: Object.keys(raw).length };
});
ok(legacy.keys > 10, '老存档仍有主体字段');

/* 用独立上下文写入：当前这个页面已经在玩了，卸载时的自动保存会覆盖预置的存档 */
await p.close();
const rawJson = JSON.stringify(legacy.raw);
const iso = await isolatedPage(r.browser, eval(`() => { localStorage.clear(); localStorage.setItem('moss-farm-v2', ${JSON.stringify(rawJson)}); }`));
const isoP = iso.page;
await isoP.waitForFunction(() => !!window.__MOSS__);
await isoP.locator('.boot-actions button', { hasText: '继续' }).first().click();
await isoP.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden, null, { timeout: 15000 });

/* ---------- 1. 老档能正常开局，原有事实没丢 ---------- */
let s = await isoP.evaluate(() => {
  const M = __MOSS__;
  return {
    day: M.state.totalDay, coins: M.state.coins,
    radish: M.state.inventory.radish || 0,
    hud: (document.querySelector('#hudDate .hud-value') || {}).textContent || '',
  };
});
eq(s.day, 5, '老档的天数原样保留');
eq(s.coins, 777, '老档的金币原样保留');
eq(s.radish, 5, '老档背包里的萝卜没丢');
ok(/第?\s*5/.test(s.hud) || s.hud !== '', 'HUD 正常渲染日期');

/* ---------- 2. R4 缺的四份账都被补成合法默认值 ---------- */
const defaults = await isoP.evaluate(() => {
  const M = __MOSS__;
  return {
    care: JSON.parse(JSON.stringify(M.farmCareState())),
    plan: JSON.parse(JSON.stringify(M.farmPlanState())),
    stock: JSON.parse(JSON.stringify(M.seasonStockState())),
    aid: JSON.parse(JSON.stringify(M.settlementAidState())),
  };
});
eq(defaults.care.booked, false, '老档没有照料委托');
eq(defaults.care.deliveredDays, 0, '照料账从零开始');
eq(defaults.plan.kind, '', '老档没有进行中的外出工作');
eq(defaults.plan.wagePerDay, 0, '老档日薪为零，不会凭空发钱');
eq(defaults.stock, { year: 0, seasonIdx: -1, count: 0 }, '老档的季度备货是未交付状态');
eq(defaults.aid, { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 }, '老档的安置援助从零开始');

/* ---------- 3. 老档上可以真实继续玩：照料委托 ---------- */
const care = await isoP.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 900;
  M.state.inventory.radish = 20;
  M.state.structures.push({ id: 'legacy-coop', device: 'coop', x: 12, y: 8,
    livestock: { fedDay: -1, wateredDay: -1, pending: 1, lastProductDay: 1, mood: 0, fedQty: 0, stock: 0 } });
  return M.bookFarmCare(3);
});
ok(care, '老档上可以直接预约农场照料');
ok(await isoP.evaluate(() => __MOSS__.farmPlanCareGap(3).ok), '补约后照料覆盖达标，可以离农');
ok(await isoP.evaluate(() => { const M = __MOSS__; return M.bookFarmPlan(3, 'harvest_help'); }), '老档上可以直接登记外出工作');

/* ---------- 4. 老档上季节与援助照常工作 ---------- */
await isoP.evaluate(() => { __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
s = await isoP.evaluate(() => {
  const M = __MOSS__, y = M.yearSeasonOfDay(M.state.totalDay);
  return { day: M.state.totalDay, season: y.seasonName,
    aid: M.settlementAidState().days, skipped: M.settlementAidState().skippedAway,
    careDelivered: M.farmCareState().deliveredDays, planDays: M.farmPlanState().deliveredDays };
});
eq(s.day, 6, '老档上睡觉正常推进日期');
eq(s.season, '春', '老档的日期按四季年历解释（第 6 天是春季）');
eq(s.aid, 0, '离农日不发安置援助');
eq(s.skipped, 1, '离农日被单独记账');
eq(s.careDelivered, 1, '老档上的照料委托照常结算');
eq(s.planDays, 1, '老档上的外出工作照常发薪');

const stock = await isoP.evaluate(() => {
  const M = __MOSS__;
  M.state.inventory.radish = 3;
  return M.completeSeasonStock();
});
ok(stock, '老档上可以交付芽芽的季度备货');

/* ---------- 5. 界面在老档上照常打开 ---------- */
await isoP.evaluate(() => __MOSS__.openShop());
ok(await isoP.locator('.win').getByText('距本季结束还有', { exact: false }).count(), '老档上种子铺显示季节信息');
ok(await isoP.locator('.win').getByText('季备货', { exact: false }).count(), '老档上种子铺显示季度备货');
await isoP.evaluate(() => __MOSS__.closeWindow());
await isoP.evaluate(() => __MOSS__.openFarmSchedulePanel());
ok(await isoP.locator('.win').getByText('麦田秋收帮工', { exact: false }).count(), '老档上长期安排面板显示当前这段外出工作');

/* ---------- 6. 再存一次盘：R4 的四份账都真的写进去了 ---------- */
const persisted = await isoP.evaluate(() => {
  const M = __MOSS__;
  M.saveNow();
  const raw = JSON.parse(localStorage.getItem('moss-farm-v2'));
  return {
    has: ['farmCare', 'farmPlan', 'seasonStock', 'settlementAid'].every(k => raw[k] && typeof raw[k] === 'object'),
    careDays: raw.farmCare.deliveredDays, planKind: raw.farmPlan.kind,
    stockSeason: raw.seasonStock.seasonIdx, aidDays: raw.settlementAid.days,
  };
});
ok(persisted.has, '老档玩过一轮后，R4 的四份账都写进了新存档');
ok(persisted.careDays >= 1 && persisted.planKind === 'harvest_help', '照料与外出工作的进度被存下来');
ok(persisted.stockSeason >= 0, '季节备货的进度被存下来');
eq(persisted.aidDays, 0, '离农那天的援助仍是零，被存下来');

eq(r.errors, [], '旧档载入与继续游玩全程无浏览器异常');
await r.browser.close();
console.log(`R4 旧档兼容 ${checks} 项通过${single ? '（单文件）' : ''}`);
