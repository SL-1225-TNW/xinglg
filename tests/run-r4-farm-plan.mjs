/* R4 3／7 天计划：次日生效、真实睡觉、天气暂停、当日恢复与存档。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function fp() {
  return p.evaluate(() => {
    const c = __MOSS__.farmPlanState();
    return JSON.parse(JSON.stringify(Object.assign({}, c, { __day: __MOSS__.state.totalDay, __coins: __MOSS__.state.coins })));
  });
}

await p.evaluate(() => { __MOSS__.state.coins = 100; __MOSS__.state.weather = { today: 'sun', tomorrow: 'sun' }; __MOSS__.openFarmSchedulePanel(); });
await p.getByRole('button', { name: '安排 3 天 · 18 金', exact: true }).click();
ok((await fp()).booked, '玩家点击面板预约 3 天成功');
let s = await fp();
eq(s.startDay, 2, '当天登记，次日开始');
eq(s.endDay, 4, '三天原定覆盖第 2—4 天');
eq(s.__coins, 82, '一次扣除 18 金');
ok(!await p.evaluate(() => __MOSS__.bookFarmPlan(7)), '有效计划期间不能重复预约');

/* 第一次真实睡觉：应在第 2 天结算，而不是漏掉预约首日。 */
await p.evaluate(() => __MOSS__.performSettlement(true));
s = await fp();
eq(s.__day, 2, '正常睡觉进入第 2 天');
eq(s.deliveredDays, 1, '第 2 天计划已结算');
eq(s.lastDeliveryDay, 2, '结算日记录为新的一天');

/* 下一天天气为雨；天气先滚动，再暂停第 3 天。 */
await p.evaluate(() => { __MOSS__.state.weather.tomorrow = 'rain'; __MOSS__.performSettlement(true); });
s = await fp();
eq(s.__day, 3, '第二次睡觉进入第 3 天');
eq(s.deliveredDays, 1, '雨天不冒充已完成');
eq(s.pausedDays, 1, '雨天产生一次暂停');
eq(s.pauseDay, 3, '暂停绑定第 3 天');
eq(s.endDay, 5, '暂停一天会顺延预计结束日');
ok(/雨/.test(s.pausedReasons.at(-1).reason), '暂停原因记录雨天');

/* 玩家接受当前条件后，同一天立即补结算；不会被雨再次打回暂停。 */
ok(await p.evaluate(() => __MOSS__.resumePlanToday()), '玩家可以恢复当天计划');
s = await fp();
eq(s.deliveredDays, 2, '恢复后当天立即计入进度');
eq(s.pausedDays, 0, '当前暂停解除');
eq(s.pauseDay, 0, '当前暂停日清空');
eq(s.endDay, 4, '同日恢复撤销此前顺延');
await p.evaluate(() => __MOSS__.applyFarmPlanTick());
eq((await fp()).deliveredDays, 2, '同日重复 tick 不重复推进');

await p.evaluate(() => { __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
s = await fp();
eq(s.__day, 4, '第三次睡觉进入第 4 天');
eq(s.deliveredDays, 3, '三天计划完整结算');
ok(!s.booked, '完成后计划自动收口');
eq(s.completedDay, 4, '记录完成日');

/* UI 真实可见，不只暴露测试函数。 */
await p.evaluate(() => __MOSS__.openFarmSchedulePanel());
ok(await p.locator('.win').getByText('3／7 天离农计划', { exact: false }).count(), '长期安排面板显示计划区');
ok(await p.locator('.win').getByText('上一段计划已于第 4 天完成', { exact: false }).count(), '完成事实在 UI 可读');

/* 新计划取消只退未完成天数。 */
await p.evaluate(() => { __MOSS__.state.coins = 100; __MOSS__.bookFarmPlan(7); __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
s = await fp();
eq(s.deliveredDays, 1, '七天计划先完成一天');
eq(await p.evaluate(() => __MOSS__.farmPlanDaysLeft()), 6, '还剩六天');
eq(await p.evaluate(() => __MOSS__.cancelFarmPlan()), 36, '取消退回六天费用');
ok(!(await fp()).booked, '取消后计划结束');

/* 在途计划经过正式序列化仍保持幂等。 */
await p.evaluate(() => { __MOSS__.state.coins = 100; __MOSS__.bookFarmPlan(3); });
const round = await p.evaluate(() => {
  const a = __MOSS__.normalizeSaveForTest(__MOSS__.serialize());
  const b = __MOSS__.normalizeSaveForTest(a);
  return { a: a.farmPlan, b: b.farmPlan };
});
eq(round.b, round.a, '计划存档归一化往返幂等');
eq(round.a.startDay, (await fp()).__day + 1, '重约仍从次日开始');

eq(r.errors, [], '计划流程无浏览器异常');
await r.browser.close();
console.log(`R4 3/7 天农场计划 ${checks} 项通过${single ? '（单文件）' : ''}`);
