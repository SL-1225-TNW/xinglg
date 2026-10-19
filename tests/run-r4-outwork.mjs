/* R4 外出工作：3／7 天离农计划里的真实日薪、资历、合同期限与照料联动。
   全部用真实睡觉（performSettlement）和真实照料账本推进，不直接写结果。 */
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
    const c = __MOSS__.farmPlanState();
    const pr = __MOSS__.professionalLifeState();
    return {
      plan: JSON.parse(JSON.stringify(c)),
      day: __MOSS__.state.totalDay,
      coins: __MOSS__.state.coins,
      horticulture: pr.careers.horticulture,
      patrol: pr.routes.patrol,
    };
  });
}

/* ---------- 1. 面板上真的列出三项外出工作与解锁条件 ---------- */
await p.evaluate(() => { __MOSS__.state.coins = 300; __MOSS__.state.totalDay = 1; __MOSS__.state.weather = { today: 'sun', tomorrow: 'sun' }; __MOSS__.openFarmSchedulePanel(); });
ok(await p.locator('.win').getByText('麦田秋收帮工', { exact: false }).count(), '面板列出麦田秋收帮工');
ok(await p.locator('.win').getByText('镇际货车押运', { exact: false }).count(), '面板列出镇际货车押运');
ok(await p.locator('.win').getByText('林缘测距记录', { exact: false }).count(), '面板列出林缘测距记录');
ok(await p.locator('.win').getByText('先完成小镇商旅入门。', { exact: false }).count(), '押运未解锁时写清前置条件');
ok(await p.locator('.win').getByText('先完成小镇巡林入门。', { exact: false }).count(), '测距未解锁时写清前置条件');
ok(!(await p.evaluate(() => __MOSS__.farmOutworkUnlocked(__MOSS__.OUTWORK_ASSIGNMENTS.caravan_courier))), '新档不认商运引荐');

/* ---------- 2. 有作物／牲畜时，没有照料覆盖就不给离农 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.inventory.radish = 20;
  M.state.plots['6,4'] = { tilled: true, water: false, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0, fertility: 70, lastGroup: 'root', prevGroup: null };
  M.state.structures.push({ id: 'outwork-coop', device: 'coop', x: 12, y: 8,
    livestock: { fedDay: -1, wateredDay: -1, pending: 0, lastProductDay: 1, mood: 0, fedQty: 0, stock: 0 } });
});
eq(await p.evaluate(() => __MOSS__.farmCareFeedNeed()), 2, '鸡舍让「家里有事」成为真条件');
eq(await p.evaluate(() => __MOSS__.farmCareFeedCoverage(14).days), 10, '口粮按真实可食组合可完整覆盖 10 天');
await p.evaluate(() => __MOSS__.openFarmSchedulePanel());
ok(await p.locator('.win').getByText('现有库存按当前喂法可完整覆盖 7 天', { exact: false }).count(), '长期安排在离农前显示剩余口粮覆盖');
const gap = await p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.farmPlanCareGap(3))));
ok(!gap.ok, '有未熟作物又没委托时照料不达标');
eq(gap.gap, 4, '三天计划需要覆盖到第 4 天，当前缺 4 天');
ok(!(await p.evaluate(() => __MOSS__.bookFarmPlan(3, 'harvest_help'))), '照料不达标时外出工作预约被拒');
ok(!(await p.evaluate(() => __MOSS__.bookFarmPlan(3, ''))), '自理行程同样不能绕过照料门禁');
ok(await p.evaluate(() => { const M = __MOSS__; M.state.coins = 300; M.bookFarmCare(3); return M.bookFarmPlan(3, 'harvest_help'); }), '补约覆盖后可以登记外出工作');
let s = await snap();
eq(s.plan.kind, 'harvest_help', '记录外出工作种类');
eq(s.plan.wagePerDay, 22, '快照日薪，不随以后调表改写');
eq(s.plan.careerKey, 'horticulture', '记录对应职业资历');
eq(s.plan.dueDay, 6, '三天计划原定第 2—4 天，合同期限为 +2 天');
eq(s.coins, 300 - 18 - 24, '只扣委托金 18 金与照料 24 金，签约当天不预付工资');

/* 睡一夜，并断言钱包增量里「除补助以外」正好是这一天挣到的日薪。
   补助每天都会发，直接比余额会把两笔钱混在一起。 */
async function sleepDay(expectedWage, label) {
  const before = await snap();
  await p.evaluate(() => __MOSS__.performSettlement(true));
  const after = await snap();
  const allowance = await p.evaluate(() => ((__MOSS__.state.settleHistory.at(-1) || {}).dailyAllowance || 0));
  eq(after.coins - before.coins - allowance, expectedWage, label);
  return after;
}

/* ---------- 3. 真实睡觉按天发薪 ---------- */
s = await sleepDay(22, '第 2 天：钱包增量正好是一日日薪');
eq(s.day, 2, '正常睡觉进入第 2 天');
eq(s.plan.deliveredDays, 1, '第 2 天计一天外出');
eq(s.plan.earnedCoins, 22, '第 2 天挣到一日日薪');
eq(s.plan.deliveryLog[0], { day: 2, pay: 22, late: false, reason: '' }, '结算日志逐日可查');

await p.evaluate(() => __MOSS__.applyFarmPlanTick());
eq((await snap()).plan.earnedCoins, 22, '同日重复 tick 不重复发薪');

/* 照料在第 2 天正常照料，第 3 天故意断料 —— 外出当天家里没人管。 */
await p.evaluate(() => { __MOSS__.state.inventory.radish = 0; __MOSS__.state.inventory.potato = 0; __MOSS__.state.inventory.strawberry = 0; __MOSS__.state.weather.tomorrow = 'sun'; });
s = await sleepDay(11, '第 3 天：家里断料，只拿半薪');
eq(s.day, 3, '第二次睡觉进入第 3 天');
eq(s.plan.deliveredDays, 2, '缺料当天计划仍推进一天');
eq(s.plan.careGapDays, 1, '家中断档留下记录');
eq(s.plan.earnedCoins, 33, '断档当天只拿半薪（22→11）');
eq(s.plan.deliveryLog[1].reason, '农场缺料中断', '结算日志写明断档原因');

await p.evaluate(() => { __MOSS__.state.inventory.radish = 20; __MOSS__.state.weather.tomorrow = 'sun'; });
s = await sleepDay(22, '第 4 天：恢复全额日薪');
eq(s.day, 4, '第三次睡觉进入第 4 天');
eq(s.plan.deliveredDays, 3, '三天外出全部结算');
eq(s.plan.earnedCoins, 55, '三天合计 22+11+22');
eq(s.horticulture, 1, '整段做完记一次园艺资历');
ok(!s.plan.booked, '完成后计划自动收口');
eq(s.plan.completedDay, 4, '记录完成日');

await p.evaluate(() => __MOSS__.openFarmSchedulePanel());
ok(await p.locator('.win').getByText('上一段外出：麦田秋收帮工', { exact: false }).count(), '完成事实写回长期安排面板');
ok(await p.locator('.win').getByText('挣得 55 金', { exact: false }).count(), '面板写明这一趟实际挣了多少');
/* ---------- 4. 超过合同期限按半薪 ---------- */
ok(!(await p.evaluate(() => { const M = __MOSS__; M.state.coins = 300; return M.bookFarmPlan(3, 'harvest_help'); })),
  '上一份照料已结束，家里的鸡舍还需要人：没有新委托就不再放行离农');
await p.evaluate(() => {
  const M = __MOSS__;
  M.bookFarmCare(5);
  M.bookFarmPlan(3, 'harvest_help');
  M.farmPlanState().dueDay = 3;   // 合同期限被压到过去
});
await p.evaluate(() => { __MOSS__.state.weather.tomorrow = 'sun'; });
s = await sleepDay(11, '逾期当天：钱包增量是半薪');
eq(s.day, 5, '逾期计划的第一天');
eq(s.plan.earnedCoins, 11, '新一趟从零记账，超过合同期限当天按半薪结算');
eq(s.plan.lateDays, 1, '逾期天数单独记账');
eq(s.plan.deliveryLog[0].reason, '超过合同期限', '结算日志写明逾期');

/* ---------- 5. 取消只退剩余委托金，已挣到的钱留在上一趟成绩里 ---------- */
const beforeCancel = await snap();
const refund = await p.evaluate(() => __MOSS__.cancelFarmPlan());
eq(refund, 12, '取消退回剩余两天委托金');
s = await snap();
eq(s.coins, beforeCancel.coins + 12, '退款只回到钱包一次');
ok(!s.plan.kind && s.plan.wagePerDay === 0, '取消后清掉进行中的工作引用');
eq(s.plan.lastOutwork, { kind: 'harvest_help', days: 1, earned: 11, late: 1, careGapDays: 0, endDay: 5, reason: '已取消剩余天数' },
  '取消也留下这一趟的完整成绩，不因为取消就抹掉');

/* ---------- 6. 门禁：完成真实巡林入门后，林缘测距才解锁 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 300;
  for (let i = 0; i < 5; i++) {
    const job = M.ROOKIE_JOBS.patrol, step = job.steps[M.rookieState().patrol];
    if (!step) break;
    const site = M.INTERACTABLES.town.find(x => x.id === step[0]);
    M.state.sceneId = 'town';
    M.state.player.x = site.x; M.state.player.y = site.y + 1; M.state.face = 'up';
    M.rookieStep('patrol', M.rookieState().patrol);
  }
});
eq((await snap()).patrol, 2, '真实走完巡林入门，路线记录 +2');
ok(await p.evaluate(() => __MOSS__.farmOutworkUnlocked(__MOSS__.OUTWORK_ASSIGNMENTS.ridge_survey)), '拿到引荐后林缘测距解锁');
ok(await p.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 300;
  M.bookFarmCare(7);
  return M.bookFarmPlan(3, 'ridge_survey');
}), '解锁且有照料时可以登记测距');
eq((await snap()).plan.wagePerDay, 26, '测距日薪与表一致');

/* ---------- 7. 存档往返幂等 + 死引用归一化 ---------- */
const round = await p.evaluate(() => {
  const a = __MOSS__.normalizeSaveForTest(__MOSS__.serialize());
  const b = __MOSS__.normalizeSaveForTest(a);
  const dead = __MOSS__.normalizeFarmPlan({ booked: false, kind: 'gone_job', wagePerDay: 999, dueDay: 5, earnedCoins: 7, deliveryLog: [{ day: 3, pay: 22 }] });
  return { a: a.farmPlan, b: b.farmPlan, dead: dead };
});
eq(round.b, round.a, '外出计划存档归一化往返幂等');
eq(round.a.kind, 'ridge_survey', '工作种类随存档保留');
eq(round.dead.kind, '', '工作表里已不存在的 kind 归一化成自理行程');
eq(round.dead.wagePerDay, 0, '死引用不发工资');
eq(round.dead.earnedCoins, 7, '历史收入证据仍保留');
eq(round.dead.deliveryLog, [{ day: 3, pay: 22, late: false, reason: '' }], '残缺日志补齐为合法记录');

eq(r.errors, [], '外出工作流程无浏览器异常');
await r.browser.close();
console.log(`R4 外出工作 ${checks} 项通过${single ? '（单文件）' : ''}`);
