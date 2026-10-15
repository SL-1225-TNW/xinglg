/* R3-C2：严重风险下继续施工会留下可恢复的服务中断；补修、复查后工序可继续。 */
import assert from 'node:assert/strict';
import { launch, boot, interactWith, closeWin, clickWin } from './harness.mjs';

let checks = 0;
const check = (name, actual, expected) => {
  assert.deepStrictEqual(actual, expected, name);
  checks++;
  console.log('PASS', name);
};
const btnCount = (page, text) => page.locator('.win button', { hasText: text }).count();

const run = await launch();
try {
  const p = run.page;
  await boot(p);
  const v = fn => p.evaluate(fn);

  await v(() => {
    const M = __MOSS__;
    M.resetCareerForTest();
    if (!M.engFixtureToScheme('balanced')) throw new Error('工程夹具未能建立方案');
    const pj = M.state.professionalLife.projects.riverbay_gate;
    pj.kit = 1;
    pj.phase = 'build';
    pj.mode = 'self';
    pj.build = 1;
    pj.survey = { level: 3, day: M.state.totalDay, east: 'cracked', silt: 'heavy' };
    M.state.weather.today = 'rain';
    M.state.energy = 60;
    M.state.timeMinutes = 480;
    M.devSwitchScene('waterworks', 22, 13);
  });

  const baseline = await v(() => __MOSS__.engProjectInfo());
  check('高风险施工前有有效航运口径与高风险预警', [
    baseline.allocation, baseline.shipping, baseline.warning.level >= 4
  ], ['navigation', 50, true]);

  await interactWith(p, 22, 14);
  check('闸基现场允许推进当前工序', await btnCount(p, '亲自完成：'), 1);
  check('施工前明确说明忽略风险的服务后果', (await p.locator('.win').innerText()).includes('继续施工，河港货运将暂时中断'), true);
  await clickWin(p, '亲自完成：');

  let info = await v(() => __MOSS__.engProjectInfo());
  check('漏检后留下服务中断但不吞掉失败工序', [
    info.phase, info.build, info.recovery.active, info.recovery.affected,
    info.recovery.step, info.shipping, info.policy
  ], ['build', 1, true, 'navigation', 1, 80, 'navigation']);
  await p.waitForTimeout(250);
  check('今日安排指向事故恢复', (await p.locator('#todayPlan').innerText()).includes('补修'), true);
  const savedActive = await v(() => {
    const pj = __MOSS__.normalizeProfessionalLife(__MOSS__.state.professionalLife).projects.riverbay_gate;
    return [pj.recovery.active, pj.recovery.cause.length > 0, pj.recovery.stepName.length > 0, pj.build];
  });
  check('存档归一化保留未结事故与原工序', savedActive, [true, true, true, 1]);

  await closeWin(p);
  await v(() => __MOSS__.openEngineeringProjectLog());
  check('项目记录写明受影响服务与未完成工序',
    (await p.locator('.win').innerText()).includes('事故待恢复：河港货运暂时中断；第 2 道工序尚未完成'), true);
  await closeWin(p);
  await interactWith(p, 22, 14);
  check('事故期间施工入口被恢复面板取代', await btnCount(p, '亲自完成：'), 0);
  check('提供确定的补修与复查成本', (await p.locator('.win').innerText()).includes('90 分钟／3 点体力；复查另需 30 分钟／1 点体力'), true);

  const wallet = await v(() => __MOSS__.state.coins);
  await clickWin(p, '补修受损闸基');
  info = await v(() => __MOSS__.engProjectInfo());
  check('补修后故障仍记录，服务未提前恢复', [
    info.recovery.active, info.recovery.repaired, info.policy, info.shipping,
    await v(() => __MOSS__.state.coins) === wallet
  ], [true, true, 'navigation', 80, true]);

  await clickWin(p, '复查并结案');
  info = await v(() => __MOSS__.engProjectInfo());
  check('复查结案恢复航运并登记当天复核', [
    info.recovery.active, info.recovery.repaired,
    info.recovery.closedDay, info.reviewDay, info.shipping
  ], [false, true, await v(() => __MOSS__.state.totalDay), await v(() => __MOSS__.state.totalDay), 50]);
  check('恢复后施工入口重新开放', await btnCount(p, '亲自完成：'), 1);

  await clickWin(p, '亲自完成：');
  info = await v(() => __MOSS__.engProjectInfo());
  check('结案后可继续原有工序', [info.build, info.recovery.active], [2, false]);
  const savedClosed = await v(() => {
    const pj = __MOSS__.normalizeProfessionalLife(__MOSS__.state.professionalLife).projects.riverbay_gate;
    return [pj.recovery.active, pj.recovery.repaired, pj.recovery.closedDay,
      pj.recovery.stepName.length > 0, pj.build, pj.reviewDay];
  });
  check('结案与恢复后的进度可写回存档', savedClosed, [
    false, true, info.recovery.closedDay, true, 2, info.reviewDay
  ]);

  console.log('R3-C2 恢复闭环检查通过：' + checks + ' 项。');
} finally {
  await run.browser.close();
}
