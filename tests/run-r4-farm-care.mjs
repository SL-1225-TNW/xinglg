/* R4 农场照料委托：真实跨日、真实田地/牲畜、暂存产物和存档。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function snapCare() {
  return p.evaluate(() => {
    const c = __MOSS__.farmCareState();
    const coop = __MOSS__.state.structures.find(s => s.device === 'coop');
    return {
      care: JSON.parse(JSON.stringify(c)), day: __MOSS__.state.totalDay,
      coins: __MOSS__.state.coins, radish: __MOSS__.state.inventory.radish || 0,
      plot: JSON.parse(JSON.stringify(__MOSS__.state.plots['6,4'] || null)),
      coop: coop ? JSON.parse(JSON.stringify(coop.livestock || null)) : null
    };
  });
}

await p.evaluate(() => {
  const M = __MOSS__;
  M.state.coins = 100;
  M.state.totalDay = 1;
  M.state.weather = { today: 'sun', tomorrow: 'sun' };
  M.state.inventory.radish = 8;
  M.state.plots['6,4'] = { tilled: true, water: false, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0, fertility: 70, lastGroup: 'root', prevGroup: null };
  M.state.structures.push({ id: 'care-coop', device: 'coop', x: 12, y: 8,
    livestock: { fedDay: -1, wateredDay: -1, pending: 1, lastProductDay: 1, mood: 0, fedQty: 0, stock: 0 } });
});

const init = await snapCare();
ok(!init.care.booked, '初始未预约');
eq(await p.evaluate(() => __MOSS__.farmCareFeedNeed()), 2, '一座鸡舍每日需要 2 份口粮');
eq(await p.evaluate(() => __MOSS__.farmCareTotalMaterials({ startDay: 2, endDay: 4, materialPerDay: {} })), {}, '照料委托不再假装每日播种');

await p.evaluate(() => __MOSS__.openFarmCarePanel());
await p.getByRole('button', { name: /预约 3 天 · 24 金/ }).click();
ok((await snapCare()).care.booked, '玩家点击面板预约 3 天成功');
let s = await snapCare();
eq(s.care.startDay, 2, '当天签约，次日开始');
eq(s.care.endDay, 4, '三天覆盖第 2—4 天');
eq(s.coins, 76, '一次锁定 24 金工钱');

await p.evaluate(() => __MOSS__.performSettlement(true));
s = await snapCare();
eq(s.day, 2, '正常睡觉进入第 2 天');
eq(s.care.deliveredDays, 1, '首个真实清晨结算一次');
eq(s.plot.water, true, '委托真实浇灌已有作物');
eq(s.coop.fedDay, 2, '委托真实喂养鸡舍');
eq(s.coop.wateredDay, 2, '委托真实给鸡舍添水');
eq(s.radish, 6, '鸡舍消耗 2 份允许口粮');
eq(s.care.storedProducts, { egg: 1 }, '已有鸡蛋进入委托暂存箱');

await p.evaluate(() => __MOSS__.applyFarmCareTick());
const same = await snapCare();
eq(same.care.deliveredDays, 1, '同日重复 tick 不重复结算');
eq(same.radish, 6, '同日重复 tick 不重复扣口粮');

await p.evaluate(() => { __MOSS__.state.inventory.radish = 0; __MOSS__.state.inventory.potato = 0; __MOSS__.state.inventory.strawberry = 0; __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
s = await snapCare();
eq(s.day, 3, '第二次睡觉进入第 3 天');
eq(s.care.deliveredDays, 1, '缺料日不冒充已照料');
eq(s.care.shortageDays, 1, '缺料日留下中断记录');
ok(/鸡舍还缺口粮/.test(s.care.lastSummary), '中断记录说明缺什么');
await p.evaluate(() => __MOSS__.applyFarmCareTick());
eq((await snapCare()).care.shortageDays, 1, '缺料日重复 tick 不重复登记');

const refund = await p.evaluate(() => __MOSS__.cancelFarmCare());
eq(refund, 8, '取消只退最后一个未结算日');
ok(!(await snapCare()).care.booked, '取消后预约结束');

ok(await p.evaluate(() => __MOSS__.claimFarmCareProducts()), '可以领取暂存产物');
eq(await p.evaluate(() => __MOSS__.state.inventory.egg), 1, '暂存鸡蛋进入背包');
eq(await p.evaluate(() => __MOSS__.farmCareStoredText()), '暂无', '领取后暂存箱清空');

await p.keyboard.press('Escape');
await p.keyboard.press('j');
await p.getByRole('button', { name: /长期安排 · 农场照料/ }).click();
ok(await p.locator('.win').getByText('统一查看离农计划与农场照料', { exact: false }).count(), '玩家从 J 委托日志进入长期安排');
const beforeOpen = (await snapCare()).care.deliveredDays;
for (let i = 0; i < 3; i++) await p.evaluate(() => __MOSS__.openFarmSchedulePanel());
eq((await snapCare()).care.deliveredDays, beforeOpen, '重复打开面板不推进结算');

const round = await p.evaluate(() => {
  const a = __MOSS__.normalizeSaveForTest(__MOSS__.serialize());
  const b = __MOSS__.normalizeSaveForTest(a);
  return {
    aCare: a.farmCare, bCare: b.farmCare,
    aCoop: a.structures.find(s => s.device === 'coop'),
    bCoop: b.structures.find(s => s.device === 'coop')
  };
});
ok(!!round.aCoop && !!round.bCoop, '鸡舍不会在读档归一化时消失');
eq(round.bCoop, round.aCoop, '鸡舍畜养账本往返幂等');
eq(round.bCare, round.aCare, '照料委托账本往返幂等');

eq(r.errors, [], '照料流程无浏览器异常');
await r.browser.close();
console.log(`R4 农场照料委托 ${checks} 项通过${single ? '（单文件）' : ''}`);
