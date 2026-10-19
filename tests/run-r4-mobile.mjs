/* R4 新界面在手机触屏上的可达性：长期安排（外出工作）、农场照料、种子铺季节区。
   真实触屏点按 + 横向溢出检查；不代替 P0-4 的实体设备验收。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const r = await launch({ viewport, touch: true });
  try {
    const p = r.page;
    await boot(p);
    await p.locator('#tutorialSkip').tap();
    await p.evaluate(() => {
      const M = __MOSS__;
      M.state.coins = 900;
      M.state.totalDay = 26;                       // 春季倒数第三天，会出季末提示
      M.state.inventory.radish = 6;
      M.state.weather = { today: 'sun', tomorrow: 'sun' };
      M.state.structures.push({ id: 'm-coop', device: 'coop', x: 12, y: 8,
        livestock: { fedDay: -1, wateredDay: -1, pending: 1, lastProductDay: 1, mood: 0, fedQty: 0, stock: 0 } });
    });
    const w = viewport.width;
    const noOverflow = () => p.evaluate(() => {
      const b = document.querySelector('.win-body');
      return !!b && b.scrollWidth <= b.clientWidth + 1;
    });

    /* 1. 长期安排：先照料、再外出工作，都是真实点按 */
    await p.evaluate(() => __MOSS__.openFarmSchedulePanel());
    await p.waitForTimeout(150);
    ok(await p.locator('.win').getByText('暂时不能离农', { exact: false }).count(), w + ' 手机先告诉玩家家里没人管');
    eq(await noOverflow(), true, w + ' 照料闸门提示不撑破面板');

    await p.locator('.win button', { hasText: '安排照料委托' }).first().tap();
    await p.waitForTimeout(200);
    await p.locator('.win button', { hasText: /预约 5 天/ }).first().tap();
    eq(await p.evaluate(() => __MOSS__.farmCareState().booked), true, w + ' 手机可预约农场照料');

    await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.openFarmSchedulePanel(); });
    await p.waitForTimeout(200);
    eq(await p.evaluate(() => __MOSS__.farmPlanCareGap(3).ok), true, w + ' 手机上补约后照料覆盖达标');
    await p.locator('.win button', { hasText: '安排 3 天 · 麦田秋收帮工' }).first().tap();
    await p.waitForTimeout(250);
    eq(await p.evaluate(() => __MOSS__.farmPlanState().kind), 'harvest_help', w + ' 手机可登记外出工作');
    ok(await p.locator('.win').getByText('合同期限', { exact: false }).count(), w + ' 手机上写明合同期限');
    eq(await noOverflow(), true, w + ' 外出工作卡片不撑破面板');

    /* 2. 种子铺：季节信息与季度备货 */
    await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.openShop(); });
    await p.waitForTimeout(200);
    ok(await p.locator('.win').getByText('距本季结束还有', { exact: false }).count(), w + ' 手机上种子铺显示距季末天数');
    ok(await p.locator('.win').getByText('春播备货', { exact: false }).count(), w + ' 手机上显示本季备货单');
    eq(await noOverflow(), true, w + ' 种子铺季节区不横向溢出');
    await p.locator('.win button', { hasText: '交付春播备货' }).first().tap();
    await p.waitForTimeout(250);
    eq(await p.evaluate(() => __MOSS__.seasonStockState().count), 1, w + ' 手机可交付季度备货');

    /* 3. 季末播种提示在手机上真的出现 */
    const sowToast = await p.evaluate(() => {
      const M = __MOSS__;
      M.closeWindow();
      M.state.inventory.seed_potato = 3;
      M.state.plots['6,4'] = { tilled: true, water: true, crop: null, age: 0, mature: false, harvested: false, regrow: 0, fertility: 70 };
      M.state.selectedSeed = 'potato';
      M.toolSeed(6, 4);
      const t = M.toasts;
      return t.length ? t[t.length - 1].m : '';
    });
    ok(/跨季继续生长/.test(sowToast) && /不会枯掉/.test(sowToast), w + ' 手机上季末播种同样带跨季提示');

    await p.screenshot({ path: 'output/playwright/r4-mobile-' + w + '.png' });
    eq(r.errors, [], w + ' R4 界面触屏无异常');
  } finally {
    await r.browser.close();
  }
}
console.log(`R4 手机触屏 ${checks} 项通过`);
