/* R4 安置援助：新档前七个经营日、离农日不发、结束有提示、重载不能重领。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function snap() {
  return p.evaluate(() => {
    const M = __MOSS__;
    const h = (M.state.settleHistory || []).at(-1) || {};
    return {
      day: M.state.totalDay, coins: M.state.coins,
      aid: JSON.parse(JSON.stringify(M.settlementAidState())),
      left: M.settlementAidLeft(),
      allowance: h.dailyAllowance || 0,
      income: h.income || 0,
      skipped: (M.state.settleHistory || []).filter(x => !x.dailyAllowance).length,
    };
  });
}
async function sleep() {
  await p.evaluate(() => { __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
}

/* ---------- 1. 前七个经营日每天都有 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 0; M.state.totalDay = 1;
  M.state.weather = { today: 'sun', tomorrow: 'sun' };
});
eq((await snap()).aid, { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 }, '新档援助账从零开始');
for (let i = 1; i <= 7; i++) {
  const s = await snap();
  await sleep();
  const a = await snap();
  eq(a.aid.days, i, '第 ' + i + ' 个经营日发一次援助');
  eq(a.allowance, 50, '第 ' + i + ' 天账上记着 50 金');
  eq(a.coins, s.coins + 50, '第 ' + i + ' 天钱包只多 50 金');
}
eq((await snap()).aid.endedDay, 8, '第七天当天就写明援助结束日');

/* ---------- 2. 结束之后不再发放 ---------- */
let s = await snap();
await sleep();
eq((await snap()).allowance, 0, '第八个经营日起不再发援助');
eq((await snap()).coins, s.coins, '钱包不再凭空多钱');
const hist = await p.evaluate(() => __MOSS__.state.settleHistory.map(x => x.day));
eq(hist, [2, 3, 4, 5, 6, 7, 8], '结算记录保留最近 7 天并按天正序，而不是冻在最早 7 天');
await sleep();
eq((await snap()).aid.days, 7, '重复睡觉不会把计数往前推');
eq((await snap()).allowance, 0, '再多睡几天也没有援助');

/* ---------- 3. 离农日不算经营日、也不发钱 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 300; M.state.totalDay = 1;
  M.state.settlementAid = { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 };
  M.state.inventory.seed_radish = 4;
  M.bookFarmPlan(3, '');          // 自理行程：只扣委托金，不发日薪
});
s = await snap();
ok(await p.evaluate(() => __MOSS__.farmPlanState().booked), '先真的登记一段自理行程');
await sleep();
eq((await snap()).aid.days, 0, '离农计划生效的当天不消耗经营日');
eq((await snap()).aid.skippedAway, 1, '离农日单独计数');
eq((await snap()).allowance, 0, '离农当天不发安置援助');
eq((await snap()).aid.endedDay, 0, '离农不会把援助提前判为结束');

/* ---------- 4. 长期快进不能无限领取 ---------- */
await p.evaluate(() => { __MOSS__.farmPlanState().booked = false; });
const longRun = await p.evaluate(() => {
  const M = __MOSS__;
  M.state.settlementAid = { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 };
  const startDay = M.state.totalDay;
  let paid = 0;
  for (let i = 0; i < 60; i++) {
    M.state.weather.tomorrow = 'sun';
    M.performSettlement(true);
    paid += M.state.settleHistory.at(-1).dailyAllowance || 0;
  }
  return { paid: paid, aid: M.settlementAidState(), day: M.state.totalDay, startDay: startDay };
});
eq(longRun.paid, 350, '连续快进 60 天只拿到 7 × 50 金');
eq(longRun.aid.days, 7, '经营日计数停在 7');
eq(longRun.aid.endedDay, longRun.startDay + 7, '援助在第 7 个经营日当天收口');
ok(longRun.day - longRun.startDay >= 60, '快进确实推进了日期，不是停在原地');

/* ---------- 5. 重载存档不能重领 ---------- */
const reloaded = await p.evaluate(() => {
  const M = __MOSS__;
  const before = JSON.parse(JSON.stringify(M.settlementAidState()));
  const raw = M.serialize();
  M.normalizeSaveForTest(raw);
  return { before: before, after: JSON.parse(JSON.stringify(M.normalizeSaveForTest(raw).settlementAid)) };
});
eq(reloaded.after, reloaded.before, '往返存档后援助账不变');

/* ---------- 6. 旧档缺字段：补满七天，不追溯 ---------- */
const legacy = await p.evaluate(() => {
  const M = __MOSS__;
  const a = M.normalizeSettlementAid(undefined);
  const b = M.normalizeSettlementAid({ days: 99, endedDay: 3, skippedAway: -5 });
  const raw = M.serialize();
  raw.settlementAid = { startDay: 2, days: 3, endedDay: 0, skippedAway: 1 };
  const x = M.normalizeSaveForTest(raw), y = M.normalizeSaveForTest(x);
  const noAid = M.serialize();
  delete noAid.settlementAid;
  return { a: a, b: b, x: x.settlementAid, y: y.settlementAid, old: M.normalizeSaveForTest(noAid).settlementAid };
});
eq(legacy.a, { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 }, '旧档缺字段从零开始');
eq(legacy.b, { startDay: 1, days: 99, endedDay: 3, skippedAway: 0 }, '越界天数原样保留、负数归零');
eq(legacy.y, legacy.x, '安置援助存档归一化往返幂等');
eq(legacy.old, { startDay: 1, days: 0, endedDay: 0, skippedAway: 0 }, '旧档整段缺这个键时补一份新的');

/* ---------- 7. 界面上看得见 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.totalDay = 3;
  M.state.settlementAid = { startDay: 1, days: 2, endedDay: 0, skippedAway: 0 };
  M.requestSleep();
});
ok(await p.locator('.win').getByText('安置援助还剩 5 / 7 个经营日', { exact: false }).count(), '睡觉确认框写明援助还剩几天');
await p.evaluate(() => {
  const M = __MOSS__;
  M.closeWindow();
  M.state.settlementAid = { startDay: 1, days: 7, endedDay: 8, skippedAway: 0 };
  M.requestSleep();
});
ok(await p.locator('.win').getByText('安置援助已经发完了', { exact: false }).count(), '援助用完后换一句明确告知');

eq(r.errors, [], '安置援助流程无浏览器异常');
await r.browser.close();
console.log(`R4 安置援助 ${checks} 项通过${single ? '（单文件）' : ''}`);
