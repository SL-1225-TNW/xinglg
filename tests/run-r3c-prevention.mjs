/* R3-C1：风险预警只读、现场预防可执行、停工仅持续到下一游戏日。 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, interactWith, clickWin } from './harness.mjs';

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

  /* 夹具只把玩家带到已有方案；风险读数和预防选择仍走正式状态与界面。 */
  await v(() => {
    const M = __MOSS__;
    M.engFixtureToScheme('balanced');
    M.state.weather.today = 'sun';
  });
  check('晴天且新鲜勘测低于预警线', await v(() => __MOSS__.engProjectInfo().warning), null);
  await v(() => { __MOSS__.engAdvanceDay(); __MOSS__.engAdvanceDay(); __MOSS__.engAdvanceDay(); });
  let warning = await v(() => __MOSS__.engProjectInfo().warning);
  check('勘测满三天后触发确定性预警', [warning.level, warning.reasons.includes('现场读数已超过两天')], [3, true]);

  const beforeReport = await v(() => ({
    project: JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate),
    random: __MOSS__.state.randomState,
    day: __MOSS__.state.totalDay
  }));
  await v(() => __MOSS__.openEngineeringProjectLog());
  check('N 项目记录显示预警', (await p.locator('.win').innerText()).includes('风险预警 3/5'), true);
  const afterReport = await v(() => ({
    project: JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate),
    random: __MOSS__.state.randomState,
    day: __MOSS__.state.totalDay
  }));
  check('打开项目记录不改项目、随机数或日期', afterReport, beforeReport);
  await closeWin(p);
  await p.waitForTimeout(250);
  check('今日安排提示风险预警', (await p.locator('#todayPlan').innerText()).includes('预警'), true);

  await v(() => {
    const M = __MOSS__, pj = M.state.professionalLife.projects.riverbay_gate;
    M.state.weather.today = 'rain';
    pj.phase = 'build'; pj.stone = true; pj.kit = 1; pj.build = 0; pj.mode = 'self';
    M.state.inventory.stone = 2;
    M.devSwitchScene('waterworks', 22, 13);
  });
  await interactWith(p, 22, 14);
  warning = await v(() => __MOSS__.engProjectInfo().warning);
  check('雨天现场预警保留当前风险', warning.level >= 3, true);
  check('现场提供复核、暂停与加固', [
    await btnCount(p, '现场复核并登记'),
    await btnCount(p, '暂停施工到明天'),
    await btnCount(p, '加固坡体')
  ], [1, 1, 1]);

  await clickWin(p, '现场复核并登记');
  let info = await v(() => __MOSS__.engProjectInfo());
  check('复核日期写入项目记录', info.reviewDay, await v(() => __MOSS__.state.totalDay));
  check('当天复核不能重复登记', await btnCount(p, '现场复核并登记'), 0);

  await clickWin(p, '暂停施工到明天');
  info = await v(() => __MOSS__.engProjectInfo());
  check('暂停只标记当前游戏日', [info.holdDay, info.heldToday, info.build], [await v(() => __MOSS__.state.totalDay), true, 0]);
  check('暂停时不显示施工或封闸操作', [
    await btnCount(p, '亲自完成：'),
    await btnCount(p, '封闸并启动试运行')
  ], [0, 0]);

  await v(() => __MOSS__.engAdvanceDay());
  info = await v(() => __MOSS__.engProjectInfo());
  check('跨日后自动恢复且已有工序保留', [info.heldToday, info.build], [false, 0]);
  await clickWin(p, '加固坡体');
  info = await v(() => __MOSS__.engProjectInfo());
  check('加固消耗两块石头并消除本次预警', [
    info.reinforced, info.warning, await v(() => __MOSS__.state.inventory.stone)
  ], [true, null, 0]);
  const saved = await v(() => {
    const pj = __MOSS__.normalizeProfessionalLife(__MOSS__.state.professionalLife).projects.riverbay_gate;
    return [pj.reviewDay, pj.holdDay, pj.reinforced];
  });
  check('读档规范化保留复核、停工与加固状态', saved, [info.reviewDay, info.holdDay, true]);

  console.log('R3-C1 风险预防检查通过：' + checks + ' 项。');
} finally {
  await run.close();
}
