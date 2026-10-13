/* 工程师真实界面：职业阶梯与说明会定案都走真实按钮。
   说明会就是方案确认，须三方意见与机构拨付同时到位；确认后不可反悔。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';
const run = await launch();
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; console.log('PASS', label); };
try {
  const p = run.page; await boot(p); await p.locator('#tutorialSkip').click();
  const v = (fn, arg) => p.evaluate(fn, arg);
  const click = name => p.getByRole('button', { name, exact: true }).click();
  const info = () => v(() => __MOSS__.engInfo());
  const proj = () => v(() => __MOSS__.engProjectInfo());
  const costs = () => v(() => { const s = __MOSS__.state; return [s.coins, s.energy, s.timeMinutes, __MOSS__.engProjectInfo()]; });

  for (const branch of ['field', 'channel']) {
    const scheme = branch === 'field' ? '保守排水' : '兼顾通航';
    const alloc = branch === 'field' ? 'irrigation' : 'navigation';
    // 按钮全名带工序数与金费，界面承诺「确认前显示成本、工日与风险」
    const steps = branch === 'field' ? 3 : 4;
    const cost = 24 + 40 * steps;
    const schemeBtn = '定案：' + scheme + ' · ' + steps + '道工序 · ' + cost + '金';
    await v(() => {
      const m = __MOSS__;
      m.closeWindow(); m.resetCareerForTest(); m.grantWaterworksCertificate();
      m.state.millLife.inspected = true;
      m.state.professionalLife.quarry.surveyed = true;
      m.state.professionalLife.port.manifestChecked = true;
      m.devSwitchScene('waterworks_control', 8, 6);
      m.state.energy = 100; m.state.timeMinutes = 450;
      m.openProfessionSite('water');
    });

    await click('签署第一份独立工程报告 · 40分钟');
    eq((await info()).stage, 1, branch + ' 签署按钮推进职业');

    await click(branch === 'field' ? '先堵缺口保麦田 · 记牺牲通航' : '先泄水保船闸 · 记麦田延灌');
    eq([(await info()).stage, (await info()).post], [2, ''], branch + ' 事故不偷偷任职');

    await click('接受正式工程岗位 · 60分钟');
    eq((await info()).stage, 4, branch + ' 可正式任职');

    // 缺三方意见与拨付时，说明会开不了，面板只写清还缺什么
    let before = await costs();
    eq(await p.getByRole('button', { name: schemeBtn, exact: true }).count(), 0, '缺三方意见时开不了说明会');
    eq((await p.locator('.win-body').innerText()).includes('开会前还缺'), true, '说明会写清还缺哪几项');
    eq(await costs(), before, '开不了说明会时不扣时间体力钱');

    await v(() => { const o = __MOSS__.state.professionalLife.projects.riverbay_gate.opinions; o.mill = true; o.meadow = true; o.port = true; });
    await v(() => { __MOSS__.openProfessionSite('water'); });
    before = await costs();
    eq(await p.getByRole('button', { name: schemeBtn, exact: true }).count(), 0, '只有意见没有拨付时仍开不了说明会');
    eq(await costs(), before, '拨付未到账时不扣时间体力钱');

    await click('申请机构工程拨付 · 150金');
    eq((await info()).budget, 150, '只发放项目预算');
    before = await costs();
    eq(await p.getByRole('button', { name: '申请机构工程拨付 · 150金', exact: true }).count(), 0, '拨付后按钮消失');
    eq(await costs(), before, '重复申请不发钱不扣时间');

    // 拨付到账后定案成立，且方案不可反悔
    const coinsPre = (await info()).playerCoins;
    before = await costs(); await click(schemeBtn);
    const after = await costs();
    eq([(await proj()).scheme, (await proj()).phase], [branch === 'field' ? 'conservative' : 'balanced', 'scheme'], '定案进入等材料交接');
    eq(after[0], coinsPre, '定案不动个人金币');
    eq(after[3].funds.spent, 24, '定案只结算闸件代购');
    eq((await info()).hearing, alloc, '说明会记录了方案口径');
    eq(after[3].build, 0, '定案不预先推进工序');

    await v(() => { __MOSS__.openProfessionSite('water'); });
    before = await costs();
    eq(await p.getByRole('button', { name: schemeBtn, exact: true }).count(), 0, '定案后按钮消失');
    eq(await costs(), before, '定案后无法反悔改方案');

    await v(() => __MOSS__.saveNow()); await p.reload(); await click('继续游戏');
    eq([(await proj()).scheme, (await info()).hearing, (await info()).budget], [branch === 'field' ? 'conservative' : 'balanced', alloc, 150], '方案与拨付重载保留');
    eq((await info()).playerCoins, coinsPre, '重载后公共工程仍不动个人金币');

    await v(() => { __MOSS__.devSwitchScene('waterworks_control', 8, 6); __MOSS__.state.timeMinutes = 750; __MOSS__.openProfessionSite('water'); });
    before = await costs();
    eq(await p.getByRole('button', { name: '申请机构工程拨付 · 150金', exact: true }).count(), 0, '重载后仍不能再申请拨付');
    eq(await costs(), before, '重载后重复申请不扣时间体力钱');
  }
  eq(run.errors, [], '浏览器无未捕获错误');
} finally { await run.browser.close(); }
console.log(`工程师真实界面 ${checks} 项通过`);
