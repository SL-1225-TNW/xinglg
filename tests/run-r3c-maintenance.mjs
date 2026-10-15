/* R3-C3：养护以周期日期为准；离开与读档不会自动结案，今日安排与 N 记录显示节点。 */
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
    M.engAdvanceDay();
    M.resetCareerForTest();
    if (!M.engFixtureAccepted('balanced')) throw new Error('工程验收夹具未能完成');
    M.state.energy = 80;
    M.state.timeMinutes = 600;
    M.devSwitchScene('waterworks_control', 9, 10);
  });
  const accepted = await v(() => ({
    day: __MOSS__.state.totalDay,
    project: __MOSS__.engProjectInfo()
  }));
  check('验收日建立三日养护周期', [
    accepted.project.phase, accepted.project.maintDay,
    accepted.project.maintenanceNextDay, accepted.project.maintenanceDue
  ], ['accepted', accepted.day, accepted.day + 3, false]);

  await interactWith(p, 8, 6);
  check('验收日不要求马上做养护', await btnCount(p, '闸门养护检查'), 0);
  await closeWin(p);
  await v(() => __MOSS__.openEngineeringProjectLog());
  check('验收日 N 记录显示下次周期', (await p.locator('.win').innerText()).includes('下次从第 ' + (accepted.day + 3) + ' 天起到期'), true);
  await closeWin(p);

  await v(() => {
    const M = __MOSS__;
    M.engAdvanceDay();
    M.state.energy = 80; M.state.timeMinutes = 600;
    M.devSwitchScene('waterworks_control', 9, 10);
  });
  await interactWith(p, 8, 6);
  check('离开一天后仍未到期', await btnCount(p, '闸门养护检查'), 0);
  await closeWin(p);

  await v(() => {
    const M = __MOSS__;
    M.engAdvanceDay();
    M.devSwitchScene('farm', 5, 5);
  });
  const away = await v(() => {
    const M = __MOSS__, pj = M.normalizeProfessionalLife(M.state.professionalLife).projects.riverbay_gate;
    return [M.state.totalDay, pj.phase, pj.maintDay, pj.maintCount, M.engProjectInfo().maintenanceDue];
  });
  check('离开并归一化存档不会自动完成维护', away, [accepted.day + 2, 'accepted', accepted.day, 0, false]);

  await v(() => {
    const M = __MOSS__;
    M.engAdvanceDay();
    M.state.energy = 80; M.state.timeMinutes = 600;
    M.devSwitchScene('waterworks_control', 9, 10);
  });
  await interactWith(p, 8, 6);
  let info = await v(() => __MOSS__.engProjectInfo());
  check('第三天到期并显示水利站养护入口', [
    info.maintenanceDue, info.maintenanceNextDay, await btnCount(p, '闸门养护检查')
  ], [true, accepted.day + 3, 1]);
  await p.waitForTimeout(250);
  check('今日安排突出已到期的维护节点', (await p.locator('#todayPlan').innerText()).includes('养护到期'), true);
  await closeWin(p);
  await v(() => __MOSS__.openEngineeringProjectLog());
  check('N 记录保留本次待办与下次日期',
    (await p.locator('.win').innerText()).includes('下次从第 ' + (accepted.day + 3) + ' 天起到期'), true);
  await closeWin(p);

  await interactWith(p, 8, 6);
  const before = await v(() => __MOSS__.engProjectInfo());
  await clickWin(p, '闸门养护检查');
  info = await v(() => __MOSS__.engProjectInfo());
  check('实际检查推进周期并累加一次', [
    info.maintDay, info.maintCount, info.maintenanceNextDay, info.maintenanceDue
  ], [await v(() => __MOSS__.state.totalDay), before.maintCount + 1,
    await v(() => __MOSS__.state.totalDay) + 3, false]);
  await closeWin(p);

  await v(() => {
    const M = __MOSS__;
    M.engAdvanceDay();
    M.state.energy = 80; M.state.timeMinutes = 600;
    M.devSwitchScene('waterworks_control', 9, 10);
  });
  await interactWith(p, 8, 6);
  check('维护次日不要求重复签到', await btnCount(p, '闸门养护检查'), 0);
  const saved = await v(() => {
    const pj = __MOSS__.normalizeProfessionalLife(__MOSS__.state.professionalLife).projects.riverbay_gate;
    return [pj.phase, pj.maintDay, pj.maintCount];
  });
  check('下一周期状态可在存档读回', saved, ['accepted', info.maintDay, info.maintCount]);

  console.log('R3-C3 周期养护检查通过：' + checks + ' 项。');
} finally {
  await run.browser.close();
}
