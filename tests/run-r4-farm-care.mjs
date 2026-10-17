/* R4 第二块：农场照料委托。
   验证五大要点：
   - 预约一次性扣款、可预览材料与费用；
   - 取消时按剩余天数退款，已结算的不退；
   - 缺料日子只增加 shortageDays，不偷偷扣材料、不重复发奖；
   - 跨日由 applyFarmCareTick 推进，重复调用同一日不重复扣；
   - 没有任何按钮在重复打开、刷新、重载时改变已结算/已扣料数值。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch({}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function readFC() {
  return p.evaluate(() => {
    var c = __MOSS__.farmCareState();
    var o = Object.assign({}, c);
    o.__today = __MOSS__.state.totalDay;
    o.__coins = __MOSS__.state.coins;
    o.__seed = (__MOSS__.state.inventory && __MOSS__.state.inventory.seed_radish) || 0;
    return o;
  });
}

/* 默认未预约 */
const init = await readFC();
ok(!init.booked, '初始未预约');
eq(init.deliveredDays, 0, '初始 deliveredDays=0');
eq(init.shortageDays, 0, '初始 shortageDays=0');
eq(init.__seed, 8, '初始有 8 颗萝卜种子');

/* 预览与扣款：5 天 · 5×8=40 金 */
const preview = await p.evaluate(() => __MOSS__.farmCareTotalFee({ startDay: 1, endDay: 5, costPerDay: __MOSS__.farmCareState().costPerDay }));
eq(preview, 40, '5 天预览 = 40 金');
const previewMat = await p.evaluate(() => __MOSS__.farmCareTotalMaterials({ startDay: 1, endDay: 5, materialPerDay: __MOSS__.farmCareState().materialPerDay }));
eq(previewMat, { seed_radish: 5 }, '5 天预览材料 = seed_radish ×5');

const coinsBefore = init.__coins;

/* 预约 5 天 */
const book = await p.evaluate(() => __MOSS__.bookFarmCare(5));
ok(book, 'bookFarmCare(5) 成功');
const booked = await readFC();
eq(booked.startDay, 1, '预约 startDay = 今天');
eq(booked.endDay, 5, '预约 endDay = 今天+4');
eq(booked.bookedDays, 5, '预约 bookedDays = 5');
eq(booked.deliveredDays, 0, '预约后 deliveredDays 仍未结算 = 0');
eq(booked.shortageDays, 0, '预约后 shortageDays 仍未缺料 = 0');
eq(booked.__coins, coinsBefore - 40, '预约一次扣 40 金');

/* 预约期间金币低于 costPerDay.coins 不能补预约 */
const rebook = await p.evaluate(() => __MOSS__.bookFarmCare(2));
ok(!rebook, '已预约时再次 bookFarmCare 失败');

/* 跨过 1 天：applyFarmCareTick 立即结算今天（day=1）→ deliveredDays=1，材料减 1 */
await p.evaluate(() => { __MOSS__.state.totalDay = 1; __MOSS__.applyFarmCareTick(); });
const d1 = await readFC();
eq(d1.deliveredDays, 1, '跨到 day=1 后 deliveredDays=1');
eq(d1.shortageDays, 0, '跨到 day=1 后 shortageDays=0');
eq(d1.__seed, 7, 'day=1 结算消耗 1 颗种子');

/* 重复 tick 同一日：不重复扣 */
await p.evaluate(() => __MOSS__.applyFarmCareTick());
const d1Rep = await readFC();
eq(d1Rep.deliveredDays, 1, '同日重复 tick 不再累加 deliveredDays');
eq(d1Rep.__seed, 7, '同日重复 tick 不再扣材料');

/* day=2：库存还有 7 颗，仍然够 */
await p.evaluate(() => { __MOSS__.state.totalDay = 2; __MOSS__.applyFarmCareTick(); });
const d2 = await readFC();
eq(d2.deliveredDays, 2, 'day=2 deliveredDays=2');
eq(d2.shortageDays, 0, 'day=2 shortageDays 仍是 0');
eq(d2.__seed, 6, 'day=2 又减 1 颗');

/* day=3：把种子清到 0，再 tick → shortageDays+1，材料不变 */
await p.evaluate(() => { __MOSS__.state.totalDay = 3; __MOSS__.state.inventory.seed_radish = 0; __MOSS__.applyFarmCareTick(); });
const d3 = await readFC();
eq(d3.deliveredDays, 2, 'day=3 缺料，deliveredDays 不再增长');
eq(d3.shortageDays, 1, 'day=3 缺料，shortageDays+1');
eq(d3.__seed, 0, 'day=3 缺料不扣');

/* 重复 tick 同一日：依然不重复扣料 */
await p.evaluate(() => __MOSS__.applyFarmCareTick());
const d3Rep = await readFC();
eq(d3Rep.shortageDays, 1, '缺料日重复 tick 不再累加 shortageDays');
eq(d3Rep.__seed, 0, '缺料日重复 tick 不消耗材料');

/* day=4：补 5 颗种子 → 应该恢复成功结算 */
await p.evaluate(() => { __MOSS__.state.totalDay = 4; __MOSS__.state.inventory.seed_radish = 5; __MOSS__.applyFarmCareTick(); });
const d4 = await readFC();
eq(d4.deliveredDays, 3, 'day=4 补料后继续结算 deliveredDays=3');
eq(d4.shortageDays, 1, 'day=4 shortageDays 保持 1');
eq(d4.__seed, 4, 'day=4 减 1 颗');

/* 取消剩余 1 天（day=5 即 endDay 当天还没 tick）：
   我们的 endDay=5，day=4 时还没结算 day=5，所以剩余是 1 天，退 8 金。 */
const refund = await p.evaluate(() => __MOSS__.cancelFarmCare());
eq(refund, 8, '取消当日退回 1 天 = 8 金');
const cancelled = await readFC();
ok(!cancelled.booked, '取消后 booked=false');
eq(cancelled.deliveredDays, 3, '取消不改变 deliveredDays');
eq(cancelled.shortageDays, 1, '取消不改变 shortageDays');
eq(cancelled.__coins, init.__coins - 40 + 8, '金币净支出 40-8=32');

/* 重新预约：从今天（仍然 day=4）再来一份；advance 到 day=5，settle 出第 4 天。
   退 8 金后钱包还剩 18，仅够 1 天预约 8 金 + 已结算 3 天的话剩余 1 天；
   这里补足到 50 金，确保测试不卡在金币断言上。 */
await p.evaluate(() => { __MOSS__.state.coins = 50; });
const rebook2 = await p.evaluate(() => __MOSS__.bookFarmCare(3));
ok(rebook2, '取消后可以再次预约');
await p.evaluate(() => { __MOSS__.state.totalDay = 5; __MOSS__.applyFarmCareTick(); });
const d5 = await readFC();
eq(d5.deliveredDays, 1, '新预约的 day=5 再次结算一次');
eq(d5.bookedDays, 3, '新预约 bookedDays = 3');
eq(d5.endDay, 6, '新预约 endDay = 当前+2');

/* 重载存档 → 不会重复扣料 */
const beforeReload = (await readFC()).__seed;
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.getByRole('button', { name: '继续游戏', exact: true }).click();
const afterReload = await readFC();
eq(afterReload.__seed, beforeReload, '重载后种子数不变');
eq(afterReload.deliveredDays, d5.deliveredDays, '重载后 deliveredDays 不变');
ok(!afterReload.booked || afterReload.endDay === 6, '重载后预约字段一致');

/* 重复打开面板：不应该产生结算 */
const repeats = await p.evaluate(() => {
  for (var i = 0; i < 5; i++) __MOSS__.openFarmCarePanel();
  return __MOSS__.farmCareState().deliveredDays;
});
eq(repeats, d5.deliveredDays, '重复打开面板不重复结算');

/* 元数据校验 */
const meta = await p.evaluate(() => ({
  costPerDay: __MOSS__.farmCareState().costPerDay,
  materialPerDay: __MOSS__.farmCareState().materialPerDay,
  defaultDays: 3,
  totalDays: __MOSS__.farmCareTotalDays(__MOSS__.farmCareState()),
  daysLeft: __MOSS__.farmCareDaysLeft(__MOSS__.farmCareState())
}));
eq(meta.costPerDay, { coins: 8 }, '默认 costPerDay.coins = 8');
eq(meta.materialPerDay, { seed_radish: 1 }, '默认 materialPerDay = {seed_radish:1}');
ok(meta.totalDays >= 0 && meta.daysLeft >= 0, '总数与剩余都是非负数');

await r.browser.close();
console.log(`R4 农场照料委托 ${checks} 项通过`);
