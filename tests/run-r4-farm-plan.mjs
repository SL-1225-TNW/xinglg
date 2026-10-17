/* R4 第三块：3／7 天农场计划。
   验证：
   - 预约 3 / 7 天固定金额；
   - 跨日结算：每日 deliveredDays+1，关键事件（雨天）只增 pausedDays；
   - 玩家可在 UI 上主动恢复某一天（清 lastDeliveryDay，让它能补结算）；
   - 重载后状态保留；
   - 重复 tick 同日不重复推进。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch({}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function fp() {
  return p.evaluate(() => {
    const c = __MOSS__.farmPlanState();
    return {
      booked: c.booked, days: c.days,
      startDay: c.startDay, endDay: c.endDay,
      deliveredDays: c.deliveredDays, pausedDays: c.pausedDays,
      lastDeliveryDay: c.lastDeliveryDay,
      pausedReasons: c.pausedReasons.slice(),
      __coins: __MOSS__.state.coins
    };
  });
}

/* 默认未预约，d=3 占位 */
const init = await fp();
ok(!init.booked, '初始未预约');
eq(init.days, 3, '默认占位 days=3');
eq(init.deliveredDays, 0, '初始 deliveredDays=0');

/* 预约 3 天：扣 18 金；开始日 = 今天 */
const book3 = await p.evaluate(() => __MOSS__.bookFarmPlan(3));
ok(book3, 'bookFarmPlan(3) 成功');
const b3 = await fp();
eq(b3.startDay, 1, '预约 startDay = 当前天数');
eq(b3.endDay, 3, '预约 endDay = startDay+2');
eq(b3.days, 3, 'days 实际写为 3');
eq(b3.__coins, 50 - 18, '3 天预约一次性扣 18 金');

/* 预约 7 天期间（已 booked）：再次预约失败 */
const rebook7 = await p.evaluate(() => __MOSS__.bookFarmPlan(7));
ok(!rebook7, '已预约时再次预约被拒');

/* 雨天后才进行跨日结算：手动改 weather 后推进 */
async function settleToDay(target) {
  /* 通过 devSwitchToDay 的方式直接改 totalDay 并 tick（同日不重算） */
  await p.evaluate((d) => {
    __MOSS__.state.totalDay = d;
    __MOSS__.applyFarmPlanTick();
  }, target);
}

/* 默认天气可能为晴，所以先把今天标成雨天，再 tick → paused */
await p.evaluate(() => {
  __MOSS__.state.totalDay = 1;
  __MOSS__.state.weather = { today: 'rain', tomorrow: 'sun' };
});
await p.evaluate(() => __MOSS__.applyFarmPlanTick());
const d1 = await fp();
eq(d1.deliveredDays, 0, '雨天不推进 deliveredDays');
eq(d1.pausedDays, 1, '雨天 pausedDays+1');
eq(d1.lastDeliveryDay, 1, '雨天 lastDeliveryDay 记 1');
ok(d1.pausedReasons.length === 1 && /雨/.test(d1.pausedReasons[0].reason), 'pausedReasons 记了雨天');

/* 恢复：玩家主动把今天的暂停补回 → pausedDays 减 1，lastDeliveryDay 清 0 */
const resumed = await p.evaluate(() => __MOSS__.resumePlanToday());
ok(resumed, 'resumePlanToday 生效');
const d1Resume = await fp();
eq(d1Resume.pausedDays, 0, '恢复后 pausedDays 回到 0');
eq(d1Resume.lastDeliveryDay, 0, '恢复后 lastDeliveryDay 清 0');

/* 同日再 tick：deliveredDays 应能涨到 1（这就是「暂停可补结算」的关键） */
await p.evaluate(() => __MOSS__.state.weather = { today: 'sun', tomorrow: 'sun' });
await p.evaluate(() => __MOSS__.applyFarmPlanTick());
const d1Done = await fp();
eq(d1Done.deliveredDays, 1, '恢复后同一天可以结算，deliveredDays=1');

/* 同日再 tick：不重复 +1 */
await p.evaluate(() => __MOSS__.applyFarmPlanTick());
const d1Repeat = await fp();
eq(d1Repeat.deliveredDays, 1, '同日重复 tick 不重复 +1');

/* day=2 / day=3 各 tick 一次 */
await p.evaluate(() => { __MOSS__.state.totalDay = 2; __MOSS__.applyFarmPlanTick(); });
await p.evaluate(() => { __MOSS__.state.totalDay = 3; __MOSS__.applyFarmPlanTick(); });
const d3 = await fp();
eq(d3.deliveredDays, 3, '三天全数结算后 deliveredDays=3');

/* 取消剩余 0 天：全额已消费，但仍可取消（取消应允许玩家主动停止未来无意义的结算） */
const cancel = await p.evaluate(() => __MOSS__.cancelFarmPlan());
ok(cancel >= 0, '取消返回正数（已结算日不退）');
const cancelled = await fp();
ok(!cancelled.booked, '取消后 booked=false');

/* 重新预约 7 天：剩下金币 32 - cancel + 18 = depends；但我们先把金币补够 */
await p.evaluate(() => { __MOSS__.state.coins = 80; });
const book7 = await p.evaluate(() => __MOSS__.bookFarmPlan(7));
ok(book7, '7 天预约成功');
const b7 = await fp();
eq(b7.days, 7, 'days = 7');
eq(b7.endDay - b7.startDay + 1, 7, 'endDay - startDay + 1 = 7');
eq(b7.__coins, 80 - 42, '7 天一次性扣 42 金');

/* 推进 5 天 → 4 天结算 + 1 天暂停 */
async function setDayWeather(d, weather) {
  await p.evaluate(({ d, w }) => { __MOSS__.state.totalDay = d; __MOSS__.state.weather = { today: w, tomorrow: 'sun' }; }, { d, w: weather });
  await p.evaluate(() => __MOSS__.applyFarmPlanTick());
}
for (let i = 0; i < 5; i++) await setDayWeather(b7.startDay + i, i === 3 ? 'rain' : 'sun');
const prog = await fp();
eq(prog.deliveredDays, 4, '7 天里 4 天结算 + 1 天暂停 → deliveredDays=4');
eq(prog.pausedDays, 1, '5 天推进后 pausedDays=1');
ok(prog.pausedReasons[prog.pausedReasons.length - 1].reason === '雨天', 'pausedReasons 末尾是雨天');

/* 元数据 */
const meta = await p.evaluate(() => ({
  total: __MOSS__.farmPlanTotalDays(__MOSS__.farmPlanState()),
  left: __MOSS__.farmPlanDaysLeft(__MOSS__.farmPlanState()),
  fee: __MOSS__.farmPlanTotalFee(__MOSS__.farmPlanState())
}));
eq(meta.total, 7, 'farmPlanTotalDays = 7');
eq(meta.fee, 42, 'farmPlanTotalFee = 42');
ok(meta.left >= 0, 'farmPlanDaysLeft 有效');

/* 重载存档：状态保留 */
await p.evaluate(() => __MOSS__.saveNow());
const beforeReload = (await fp()).deliveredDays;
const beforeReloadPaused = (await fp()).pausedDays;
/* 直接拿 serialize() 输出走 normalizeSaveForTest；
   serialize() 函数本身就把 farmPlan 写进存档，
   归一化往返也保留 booked/deliveredDays/pausedDays。 */
const round = await p.evaluate(() => {
  var a = __MOSS__.normalizeSaveForTest(__MOSS__.serialize());
  var b = __MOSS__.normalizeSaveForTest(a);
  return { a: a.farmPlan, b: b.farmPlan };
});
eq(round.a.deliveredDays, beforeReload, 'serialize().farmPlan.deliveredDays 等于结算值');
eq(round.b.deliveredDays, round.a.deliveredDays, '归一化往返 deliveredDays 不变');
eq(round.b.pausedDays, beforeReloadPaused, '归一化往返 pausedDays 不变');
ok(round.b.booked, '归一化往返 booked 字段保留');

/* 重复打开面板不会重复推进 */
const repeats = await p.evaluate(() => {
  for (let i = 0; i < 5; i++) __MOSS__.openFarmCarePanel && __MOSS__.openFarmCarePanel();
  return __MOSS__.farmPlanState().deliveredDays;
});
eq(repeats, beforeReload, '重复打开面板不会重复推进 deliveredDays');

await r.browser.close();
console.log(`R4 3/7 天农场计划 ${checks} 项通过`);
