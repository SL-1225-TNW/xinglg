/* R3 手机端：河湾闸门工程的施工、停工与验收在触屏上都能走完
   竖屏 390 与横屏 844 各跑一遍；所有操作都用真实点按，不用键盘。 */
import assert from 'node:assert/strict';
import { launch, boot, winOpen } from './harness.mjs';

let checks = 0;
function eq(a, b, n) { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); }
const tapWin = async (p, text) => { const b = p.locator('.win button', { hasText: text }).first(); await b.waitFor({ state: 'visible', timeout: 5000 }); await b.tap(); await p.waitForTimeout(160); };

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  const run = await launch({ viewport, touch: true });
  try {
    const p = run.page;
    await boot(p);
    await p.locator('#tutorialSkip').tap();
    const v = fn => p.evaluate(fn);

    // 场景与进度用夹具带到现场；输入与界面全部走真实触屏按钮
    await v(() => {
      __MOSS__.resetCareerForTest();
      __MOSS__.mineWorks().inspected = true;
      __MOSS__.engFixtureToScheme('conservative');
      const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
      q.kit = 1; q.phase = 'materials';
      __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600;
      __MOSS__.devSwitchScene('waterworks', 21, 20);
    });

    // 触屏动作面板直接打开最近交互点：站在闸基工作面与坝顶水尺旁边各试一次
    const gotoPit = async () => {
      await v(() => { __MOSS__.devSwitchScene('waterworks', 21, 14); });
      await p.waitForTimeout(300);
      await p.locator('#touchAct').tap();
      await p.waitForTimeout(280);
    };
    const gotoGauge = async () => {
      await v(() => { __MOSS__.devSwitchScene('waterworks', 20, 19); });
      await p.waitForTimeout(300);
      await p.locator('#touchAct').tap();
      await p.waitForTimeout(280);
    };

    // 1. 触屏打开闸基工作面
    await gotoPit();
    eq(await p.evaluate(() => { const n = document.querySelector('.win-title'); return n ? n.textContent : ''; }), '省域职业服务 · riverbay_pit', '触屏能打开闸基工作面 ' + viewport.width);
    eq(await p.locator('.win button', { hasText: '亲自施工' }).count() > 0, true, '触屏面板给出施工方式 ' + viewport.width);

    // 2. 触屏施工三道工序
    await tapWin(p, '亲自施工');
    for (let i = 0; i < 3; i++) {
      await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
      await tapWin(p, '亲自完成');
    }
    eq(await v(() => __MOSS__.engProjectInfo().build), 3, '触屏完成三道工序 ' + viewport.width);
    const noOverflow = await v(() => { const b = document.querySelector('.win-body'); return b.scrollWidth <= b.clientWidth + 1; });
    eq(noOverflow, true, '施工面板无横向溢出 ' + viewport.width);

    // 3. 触屏封闸并跨日
    await tapWin(p, '封闸并启动试运行');
    eq(await v(() => __MOSS__.engProjectInfo().phase), 'trial', '触屏封闸进入试运行 ' + viewport.width);
    await p.locator('.win-close').tap();

    await v(() => { __MOSS__.engAdvanceDay(); __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
    await gotoGauge();
    await tapWin(p, '复核试运行并签署验收');
    const pj = await v(() => __MOSS__.engProjectInfo());
    eq(pj.phase, 'accepted', '触屏完成验收 ' + viewport.width);
    eq(pj.scope, 'works', '触屏验收后认证范围升级 ' + viewport.width);
    eq(pj.policy, 'irrigation', '触屏验收后地区口径按方案生效 ' + viewport.width);
    await p.screenshot({ path: 'output/playwright/r3-mobile-' + viewport.width + '.png' });
    await p.locator('.win-close').tap();

    // 4. 触屏项目记录页可读且不溢出
    await p.evaluate(() => __MOSS__.openEngineeringProjectLog());
    await p.waitForTimeout(250);
    const recText = await p.locator('.win-body').innerText();
    eq(recText.includes('河湾闸门'), true, '触屏项目记录页可打开 ' + viewport.width);
    eq(await v(() => { const b = document.querySelector('.win-body'); return b.scrollWidth <= b.clientWidth + 1; }), true, '项目记录页无横向溢出 ' + viewport.width);
    await p.locator('.win-close').tap();

    // 5. 触屏停工与恢复：经费不足会停工，并能改为自己施工接手
    await v(() => {
      __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('balanced');
      const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
      q.kit = 1; q.phase = 'build'; q.mode = 'commission'; q.build = 3;
      q.funds.spent = 24 + 120; q.crew = { day: 0, paid: 120 };
      __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600;
      __MOSS__.devSwitchScene('waterworks', 21, 14);
    });
    await p.waitForTimeout(300);
    await p.locator('#touchAct').tap();
    await p.waitForTimeout(280);
    const stopText = await p.locator('.win-body').innerText();
    eq(stopText.includes('因经费停工'), true, '触屏能看到停工原因 ' + viewport.width);
    eq(await p.locator('.win button', { hasText: '改为亲自施工' }).count(), 1, '触屏给出接手工序的保底选项 ' + viewport.width);
    await tapWin(p, '改为亲自施工');
    eq(await v(() => __MOSS__.engProjectInfo().mode), 'self', '触屏可以接手剩余工序 ' + viewport.width);
    await p.screenshot({ path: 'output/playwright/r3-mobile-stop-' + viewport.width + '.png' });

    eq(run.errors, [], '触屏控制台无错误 ' + viewport.width);
  } finally {
    await run.browser.close();
  }
}
console.log('R3 手机界面 ' + checks + ' 项通过');
