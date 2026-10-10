/* E 阶段剩余四块：§28 袭扰、§26.5 招募与装备合同、
   §31.1 古道遗址、邻领边城。 */
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
const S = (fn, a) => p.evaluate(fn, a);

async function qualify() {
  await p.evaluate(() => {
    const s = __MOSS__.state;
    s.coins = 800; s.energy = 100;
    s.exploration.forest = true; s.exploration.mine = true;
    s.exploration.military = { rank: 'captain', training: 3, commission: { role: '巡防联络官', sinceDay: 1, expiresDay: 200 } };
    __MOSS__.startGame(s);
  });
}
await qualify();

// ── §28 袭扰：频率上限、实例固化、恢复窗口 ──
const r0 = await S(() => __MOSS__.milRaid());
check('开局没有袭扰', r0.active, null);
const rolled = await S(() => __MOSS__.milRaidRoll());
check('可以抽到袭扰事件', !!rolled, true);
check('事件带家族与种子', [typeof rolled.familyId, typeof rolled.seed], ['string', 'number']);
const again = await S(() => __MOSS__.milRaidRoll());
check('同一天不重复抽新事件', again, null);
const same = await S(() => __MOSS__.milRaid());
check('重载后仍是同一个实例（不换事实）', same.active.id, rolled.id);
// 关键预警普通玩家也看得到，不靠感知藏
check('预警对普通玩家可见', rolled.report.length > 0, true);
const pen = await S(() => __MOSS__.milRaid().penalty);
check('道路类事件影响交通耗时', pen > 0, true);

// 参与处置走同一套裁判
await p.evaluate(() => { __MOSS__.devSwitchScene('cloudpass', 14, 16); });
await p.evaluate(() => __MOSS__.milRaidOpen());
check('公开情报窗口可开', (await p.locator('.win-body').innerText()).includes('公开消息'), true);
await p.getByRole('button', { name: /参与处置/ }).click();
await p.waitForSelector('.win-body');
const rpt = await p.locator('.win-body').innerText();
check('处置后给出规则版本战报', rpt.includes('v7-1'), true);
await p.keyboard.press('Escape');
const afterRaid = await S(() => __MOSS__.milRaid());
check('处置后事件结束', afterRaid.active, null);
check('交通恢复', afterRaid.penalty, 0);
check('进入恢复窗口', afterRaid.lastDay >= 1, true);
const inCooldown = await S((last) => { __MOSS__.state.totalDay = last + 1; return __MOSS__.milRaidRoll(); }, afterRaid.lastDay);
check('恢复窗口内不再抽同类事件', inCooldown, null);

// 冷却结束后可以再抽
const after7 = await S(() => { __MOSS__.state.totalDay += 7; return __MOSS__.milRaidRoll(); });
check('七天后可再次发生', !!after7, true);

// 到期未处置：NPC 机构按方案自行收场，不要求玩家拯救
const expired = await S(() => {
  const r = __MOSS__.milRaid();
  __MOSS__.state.totalDay = r.active.expiresDay;
  return __MOSS__.milRaidTick();
});
check('逾期未处置会自行收场', expired && expired.resolved.length > 0, true);
check('收场后不再有活动事件', (await S(() => __MOSS__.milRaid())).active, null);

// ── §26.5 招募与装备：机构预算与私账分开 ──
// 先用低资格验证权限门，再给资格验证可用
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.exploration.military = { rank: 'trainee', training: 1 };
  __MOSS__.startGame(s);
});
const lowRank = await S(() => __MOSS__.milInst());
const playerCoins0 = lowRank.playerCoins;
const over = await S(() => __MOSS__.milRecruit('rec_local', 5));
check('无资格时不能招募', over.ok, false);
await qualify();
const budget0 = (await S(() => __MOSS__.milInst())).budget;
const r5 = await S(() => __MOSS__.milRecruit('rec_veteran', 5));
check('有资格后可以招募', r5.ok, true);
const inst1 = await S(() => __MOSS__.milInst());
check('费用走机构预算', budget0 - inst1.budget, 46 * 5);
check('个人钱包没被动过', inst1.playerCoins, playerCoins0);
const pool = await S(() => __MOSS__.milRecruitPool());
check('招募池显示上下级余量', pool[0].room > 0, true);
// 新兵不是满值老兵：退伍乡勇训练 60／装备 55，低于精工装备档 70，确实还需要补装备
const newUnit = await S(() => { const m = __MOSS__.state.exploration.military; return m.units[0].groups[0]; });
check('新兵训练度不是满值', newUnit.train <= 60, true);
check('新兵装备低于精工档，仍需装备合同', newUnit.equip < 70, true);
// 超编被挡
const overCap = await S(() => __MOSS__.milRecruit('rec_local', 40));
check('超过指挥上限被挡', overCap.ok, false);
// 预算不足不挪用私房钱
await S(() => { __MOSS__.state.exploration.institution.budget = 10; });
const poor = await S(() => __MOSS__.milRecruit('rec_local', 5));
check('预算不足被挡', poor.ok, false);
check('预算不足说明不动私房钱', poor.reason.includes('不会动用'), true);
check('私房钱确实没变', (await S(() => __MOSS__.milInst())).playerCoins, playerCoins0);

// 装备合同：签约付钱，交付才生效
await S(() => { __MOSS__.state.exploration.institution.budget = 900; });
// 装备合同：签约付钱，交付才生效。签精工档（70）才能超过新兵现有的 55。
const c = await S(() => __MOSS__.milContract('good', 20));
check('可以签装备合同', c.ok, true);
const beforeDeliver = (await S(() => __MOSS__.state.exploration.military.units[0].groups[0])).equip;
const tooEarly = await S((id) => __MOSS__.milDeliver(id), c.contractId);
check('没到交付日不能交付', tooEarly.ok, false);
await S(() => { __MOSS__.state.totalDay += 2; });
const del = await S((id) => __MOSS__.milDeliver(id), c.contractId);
check('到日子可交付', del.ok, true);
const afterDeliver = (await S(() => __MOSS__.state.exploration.military.units[0].groups[0])).equip;
check('交付后装备度真的提升', afterDeliver > beforeDeliver, true);
const twice = await S((id) => __MOSS__.milDeliver(id), c.contractId);
check('同一合同不重复交付', twice.ok, false);

// ── §31.1 古道遗址：找路 → 核对记录 → 开放支路 ──
await p.evaluate(() => { __MOSS__.state.inventory.wood = 40; __MOSS__.state.inventory.stone = 40; __MOSS__.devSwitchScene('oldroad', 14, 20); });
await p.evaluate(() => __MOSS__.devOpenOldRoad('orRoad'));
check('没找到旧路时不能开工', (await p.getByRole('button', { name: /清理石拱/ }).count()), 1);
await p.getByRole('button', { name: /清理石拱/ }).click();
await p.waitForTimeout(250);
check('被前置条件拦下', (await S(() => __MOSS__.oldRoadInfo())).opened, false);
await p.keyboard.press('Escape');
// 找路
await p.evaluate(() => { __MOSS__.devSwitchScene('oldroad', 7, 9); });
await p.evaluate(() => __MOSS__.devOpenOldRoad('orHut'));
await p.getByRole('button', { name: /翻找/ }).click();
await p.waitForTimeout(250);
check('找到旧邮路草图', (await S(() => __MOSS__.oldRoadInfo())).found, true);
await p.keyboard.press('Escape');
// 核对两份记录
for (const nm of [/核对驿站值日簿/, /核对大学的拓本/]) {
  await p.evaluate(() => { __MOSS__.devSwitchScene('oldroad', 6, 4); });
  await p.evaluate(() => __MOSS__.devOpenOldRoad('orArchive'));
  await p.getByRole('button', { name: nm }).click();
  await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
}
check('两份记录都核对齐', (await S(() => __MOSS__.oldRoadInfo())).records, 2);
// 清理
await p.evaluate(() => { __MOSS__.devSwitchScene('oldroad', 14, 18); });
await p.evaluate(() => __MOSS__.devOpenOldRoad('orRoad'));
await p.getByRole('button', { name: /清理石拱/ }).click();
await p.waitForTimeout(300);
check('条件齐了才能清理', (await S(() => __MOSS__.oldRoadInfo())).opened, true);
await p.screenshot({ path: 'output/playwright/v7e-oldroad.png' });
// 存档保留
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const orAfter = await S(() => __MOSS__.oldRoadInfo());
check('重载后古道进度保留', [orAfter.found, orAfter.records, orAfter.opened], [true, 2, true]);

// ── §31.1 邻领边城：跨境要先登记 ──
check('未到过关口时边城不可传送', await S(() => __MOSS__.travelPreview('border.town').ok), false);
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.exploration.forest = true; s.exploration.mine = true; s.coins = 900;
  __MOSS__.startGame(s);
});
await p.evaluate(() => { __MOSS__.devSwitchScene('cloudpass', 16, 21); });
check('到过关口后关口已登记', await S(() => __MOSS__.travelStateInfo().discovered.includes('cloud.pass')), true);
// 跨境地点同样要先真实到访一次才登记，不能从地图直接跳过去（§33.2）
check('未到访边城前不能传送', await S(() => __MOSS__.travelPreview('border.town').ok), false);
await p.evaluate(() => { __MOSS__.devSwitchScene('bordertown', 12, 14); });
check('首次到访后边城登记为公共站', await S(() => __MOSS__.travelStateInfo().discovered.includes('border.town')), true);
await p.evaluate(() => { __MOSS__.devSwitchScene('cloudpass', 16, 21); });
check('之后可从关口直接前往边城', await S(() => __MOSS__.travelPreview('border.town').ok), true);
await p.evaluate(() => __MOSS__.devOpenBorder('btInn'));
check('没登记时接不了跨境合同', (await p.locator('.win-body').innerText()).includes('还没在办事处登记'), true);
await p.keyboard.press('Escape');
await p.evaluate(() => { __MOSS__.devSwitchScene('bordertown', 8, 9); });
await p.evaluate(() => __MOSS__.devOpenBorder('btOffice'));
await p.getByRole('button', { name: /通关登记/ }).click();
await p.waitForTimeout(300);
check('登记完成', (await S(() => __MOSS__.borderInfo())).visited, true);
await p.keyboard.press('Escape');
await p.evaluate(() => { __MOSS__.state.inventory.wood = 20; __MOSS__.devSwitchScene('bordertown', 19, 9); });
const coinsBeforeJob = await S(() => __MOSS__.state.coins);
await p.evaluate(() => __MOSS__.devOpenBorder('btInn'));
await p.getByRole('button', { name: /商旅护送/ }).click();
await p.waitForTimeout(300);
const bd = await S(() => __MOSS__.borderInfo());
check('完成一份跨境合同', bd.contracts, 1);
check('跨境给报酬', (await S(() => __MOSS__.state.coins)) - coinsBeforeJob, 180);
check('交付了合同材料', (await S(() => __MOSS__.invCount('wood'))), 14);
await p.screenshot({ path: 'output/playwright/v7e-bordertown.png' });

// 世界地图出现新地点
await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene('town', 14, 10); });
await p.waitForFunction(() => !__MOSS__.ui.window);
await p.keyboard.press('m');
await p.waitForSelector('.travel-panel');
check('地图出现古道遗址', await p.getByRole('button', { name: /^古道遗址/ }).count(), 1);
check('地图出现邻领边城', await p.getByRole('button', { name: /^邻领边城/ }).count(), 1);
await p.keyboard.press('Escape');

check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\nE 阶段补充（袭扰/招募装备/古道/边城） ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
