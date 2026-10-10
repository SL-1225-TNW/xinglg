/* 阶段 E：云峰关口与边境营地（§21.4、§29.4 第 5 步）
   从无资格到训练、委任、受命、走完七日，验证战斗真的由裁判结算。 */
import { launch, boot } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync('output/playwright', { recursive: true });
let passed = 0; const fails = [];
const check = (n, a, e) => {
  const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { console.log('PASS', n); passed++; }
  else { console.log('FAIL', n, '\n  实际', x, '\n  期望', y); fails.push(n); }
};
const d = await launch();
const p = d.page;
await boot(p);

// 1. 关口场景与解锁条件
check('未到山区时关口未解锁', await p.evaluate(() => __MOSS__.travelPreview('cloud.pass').ok), false);
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.exploration.forest = true; s.exploration.mine = true;
  __MOSS__.startGame(s);
});
check('到山区后可前往', await p.evaluate(() => __MOSS__.travelPreview('cloud.pass').ok), false); // 还没到访登记
await p.evaluate(() => { __MOSS__.devSwitchScene('cloudpass', 16, 21); });
const info0 = await p.evaluate(() => __MOSS__.milFrontier());
check('关口当前权限为普通居民', [info0.rank, info0.training, info0.commission], ['civilian', 0, null]);
await p.screenshot({ path: 'output/playwright/v7e-cloudpass.png' });

// 2. 普通居民不能受命
await p.evaluate(() => __MOSS__.milDev('cpFrontier'));
check('普通居民接不下七日任务', await p.getByRole('button', { name: /接下七日任务/ }).count(), 1);
await p.getByRole('button', { name: /接下七日任务/ }).click();
await p.waitForTimeout(300);
check('被权限门拦下，未开始', (await p.evaluate(() => __MOSS__.milFrontier().frontier)).started, false);

// 3. 训练两次取得登记队员资格（必须站到演练场旁，且付得起训练费）
await p.evaluate(() => { __MOSS__.state.coins = 500; __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 14, 13); });
await p.evaluate(() => __MOSS__.milDev('cpDrill'));
check('训练前仍是普通居民', (await p.evaluate(() => __MOSS__.milFrontier())).rank, 'civilian');
await p.getByRole('button', { name: /参加训练/ }).click();
await p.waitForTimeout(300);
check('第一次训练后取得受训资格', (await p.evaluate(() => __MOSS__.milFrontier())).rank, 'trainee');
await p.getByRole('button', { name: /参加训练/ }).click();
await p.waitForTimeout(300);
const info2 = await p.evaluate(() => __MOSS__.milFrontier());
check('第二次训练后取得登记队员', [info2.rank, info2.training], ['member', 2]);
await p.keyboard.press('Escape');

// 4. 军需库申请委任
await p.evaluate(() => { __MOSS__.state.coins = 500; __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 25, 14); });
await p.evaluate(() => __MOSS__.milDev('cpSupply'));
await p.getByRole('button', { name: /查看编制/ }).click();
await p.waitForTimeout(200);
check('可查看权限分级表', (await p.locator('.win-body').innerText()).includes('指挥上限'), true);
await p.getByRole('button', { name: '返回', exact: true }).click();
await p.waitForTimeout(200);
await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 25, 14); });
await p.evaluate(() => __MOSS__.milDev('cpSupply'));
check('委任前权限门正确拦下', (await p.locator('.win-body').innerText()).includes('还没有正式委任'), true);
await p.getByRole('button', { name: /申请受命/ }).click();
await p.waitForTimeout(300);
const info3 = await p.evaluate(() => __MOSS__.milFrontier());
check('取得临时委任', info3.commission && info3.commission.role.includes('巡防'), true);
console.log('DBG 委任后军需库:', JSON.stringify(await p.locator('.win-body').innerText().catch(()=>'closed')), 'frontier=', JSON.stringify(await p.evaluate(()=>__MOSS__.milFrontier().frontier)));
check('委任后权限门打开', (await p.locator('.win-body').innerText().catch(()=>'')).includes('均已具备'), true);
await p.keyboard.press('Escape');

// 5. 接下七日任务并选路线
await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 15, 20); });
await p.evaluate(() => __MOSS__.milDev('cpFrontier'));
await p.getByRole('button', { name: /接下七日任务/ }).click();
await p.waitForTimeout(400);
console.log('DBG 接令后 toast:', JSON.stringify(await p.evaluate(() => __MOSS__.toasts)), 'time=', await p.evaluate(() => Math.round(__MOSS__.state.timeMinutes)), 'frontier=', JSON.stringify(await p.evaluate(() => __MOSS__.milFrontier().frontier)));
check('任务已开始', (await p.evaluate(() => __MOSS__.milFrontier().frontier)).started, true);
await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 15, 20); });
await p.evaluate(() => __MOSS__.milDev('cpFrontier'));
await p.getByRole('button', { name: /选择路线并推进/ }).click();
await p.waitForTimeout(200);
check('提供两条路线', (await p.getByRole('button', { name: /^走/ }).count()), 2);
await p.getByRole('button', { name: /走直接护路/ }).click();
await p.waitForTimeout(300);

// 6. 推进到结束，产生真实战报；时间不够时先结束今天（§29.1 长计划要在阶段前停下）
let blockedOnce = false;
for (let i = 0; i < 12; i++) {
  const dayBeforeClick = await p.evaluate(() => __MOSS__.milFrontier().frontier.day);
  const worldDayBefore = await p.evaluate(() => __MOSS__.state.totalDay);
  await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.state.energy = 100; __MOSS__.devSwitchScene('cloudpass', 15, 20); __MOSS__.milDev('cpFrontier'); });
  if (await p.getByRole('button', { name: /推进一天/ }).count() === 0) break;
  // 必须在点击之前判断：点完时间已经推进了，再判断就晚了
  const needSleep = await p.evaluate(() => __MOSS__.state.timeMinutes + 180 > __MOSS__.dayEndDebug());
  await p.getByRole('button', { name: /推进一天/ }).click();
  await p.waitForTimeout(250);
  const fr0 = await p.evaluate(() => __MOSS__.milFrontier().frontier);
  if (fr0.resolved) break;
  // 时间不够时游戏应提示先结束今天，玩家真的走一次睡眠结算
  if (needSleep) {
    blockedOnce = true;
    // 时间不够时游戏不得推进事件日；必须先结束今天（走真实日结算）
    check('时间不足时事件日不推进', fr0.day, dayBeforeClick);
    await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.sleepOnceForTest(); });
    await p.waitForTimeout(400);
    check('睡觉后世界日真的前进了', await p.evaluate(() => __MOSS__.state.totalDay) > worldDayBefore, true);
  }
}
check('曾经因时间不足停下来让玩家处理', blockedOnce, true);
const fin = await p.evaluate(() => __MOSS__.milFrontier());
check('七日走完', fin.frontier.day >= 7, true);
check('任务有结局', fin.frontier.resolved.length > 0, true);
check('产生了战斗记录', fin.battleCount >= 1, true);

// 7. 战报可查且内容完整
await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene('cloudpass', 15, 20); __MOSS__.milDev('cpFrontier'); });
await p.getByRole('button', { name: /查看战报/ }).click();
await p.waitForSelector('.win-body');
const rpt = await p.locator('.win-body').innerText();
check('战报显示规则版本与种子', rpt.includes('v7-1'), true);
check('战报显示优势比', rpt.includes('优势比'), true);
check('战报区分伤亡失踪', rpt.includes('伤') && rpt.includes('亡') && rpt.includes('失踪'), true);
check('战报说明不是靠杀敌多判胜', rpt.includes('杀敌多不自动等于胜利'), true);
await p.screenshot({ path: 'output/playwright/v7e-battle-report.png' });
await p.keyboard.press('Escape');

// 8. 存档保留战报与进度，重载不重复结算
const before = await p.evaluate(() => ({ b: __MOSS__.milFrontier().battleCount, d: __MOSS__.milFrontier().frontier.day, r: __MOSS__.milFrontier().frontier.resolved }));
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const after = await p.evaluate(() => ({ b: __MOSS__.milFrontier().battleCount, d: __MOSS__.milFrontier().frontier.day, r: __MOSS__.milFrontier().frontier.resolved, rank: __MOSS__.milFrontier().rank, com: !!__MOSS__.milFrontier().commission }));
check('重载后战报数不变（不重复结算）', after.b, before.b);
check('重载后进度不变', after.d, before.d);
check('重载后结局不变', after.r, before.r);
check('重载后资格与委任保留', [after.rank, after.com], ['member', true]);

// 9. 世界地图出现云峰关口
await p.evaluate(() => { __MOSS__.devSwitchScene('town', 14, 10); });
await p.keyboard.press('m');
await p.waitForSelector('.travel-panel');
check('地图出现云峰山口', await p.getByRole('button', { name: /^云峰山口/ }).count(), 1);
await p.keyboard.press('Escape');

check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\n阶段 E 云峰关口 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
