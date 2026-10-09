/* 阶段 C 独立复核：真实进村、走完三节点任务、验证取舍与存档 */
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

// 1. 场景存在且可进入
await p.evaluate(() => { __MOSS__.devSwitchScene('millvillage', 16, 18); });
check('进入麦田村', await p.evaluate(() => __MOSS__.state.sceneId), 'millvillage');
check('地图尺寸正确', await p.evaluate(() => ({ w: __MOSS__.sceneSize().w, h: __MOSS__.sceneSize().h })), { w: 40, h: 28 });

// 2. 落点可走
const walkable = await p.evaluate(() => !__MOSS__.isSolidTest('millvillage', 16, 18));
check('广场落点可走', walkable, true);

// 3. 两个 NPC 有名字与日程
check('马丁存在', await p.evaluate(() => !!__MOSS__.npcInfo('martin')), true);
check('柯里存在', await p.evaluate(() => !!__MOSS__.npcInfo('councilor')), true);
check('两人都在麦田村', await p.evaluate(() => __MOSS__.npcScene('martin') + '/' + __MOSS__.npcScene('councilor')), 'millvillage/millvillage');

// 4. 第一步：故障调查（站在机房旁）
await p.evaluate(() => { const s = __MOSS__.state; s.sceneId = 'millvillage'; s.player = { x: 9, y: 14, face: 'up' }; s.inventory.wood = 40; s.inventory.stone = 40; __MOSS__.syncPlayer(); });
await p.evaluate(() => __MOSS__.devOpenMill('millWheel'));
check('水轮未修时不能磨粉', await p.getByRole('button', { name: /磨四袋/ }).count(), 0);
check('提供两条调查方向', await p.getByRole('button', { name: /拆开轴套看看/ }).count(), 1);
await p.getByRole('button', { name: /拆开轴套看看/ }).click();
await p.waitForTimeout(300);
check('调查后进入第二步', await p.evaluate(() => __MOSS__.millInfo().step), 1);
check('记录了原因', await p.evaluate(() => __MOSS__.millInfo().cause), 'axle');

// 5. 第二步：两种修法
await p.evaluate(() => __MOSS__.devOpenMill('millWheel'));
check('出现两条修法', (await p.getByRole('button', { name: /换新橡木轴/ }).count()) + (await p.getByRole('button', { name: /改分水渠降压/ }).count()), 2);
await p.getByRole('button', { name: /改分水渠降压/ }).click();
await p.waitForTimeout(200);
await p.getByRole('button', { name: /就按这条修/ }).click();
await p.waitForTimeout(300);
const w = await p.evaluate(() => __MOSS__.millInfo());
check('选择改渠后记录方案', w.plan, 'channel');
check('水轮修好', w.repaired, true);
check('进入第三步', w.step, 2);
check('修理消耗了材料', await p.evaluate(() => ({ wood: __MOSS__.invCount('wood'), stone: __MOSS__.invCount('stone') })), { wood: 32, stone: 30 });

// 6. 第三步：交货需要真的磨出面粉
await p.evaluate(() => { __MOSS__.state.inventory.flour = 0; __MOSS__.state.inventory.grain = 3; });
await p.evaluate(() => { __MOSS__.devSwitchScene('millvillage', 9, 14); });
await p.evaluate(() => __MOSS__.devOpenMill('millWheel'));
const woodBefore = await p.evaluate(() => __MOSS__.invCount('wood'));
await p.getByRole('button', { name: /磨十二袋/ }).click();
await p.waitForTimeout(300);
const afterMill = await p.evaluate(() => ({ flour: __MOSS__.invCount('flour'), grain: __MOSS__.invCount('grain') }));
check('磨粉消耗麦子', afterMill.grain, 0);
// 默认闸向磨坊 → 满产 12；改成向麦田 → 半产 6
check('水给磨坊时出满粉', afterMill.flour, 12);

// 7. 取舍：水转向麦田后出粉减半
await p.evaluate(() => { __MOSS__.state.inventory.grain = 3; __MOSS__.devSwitchScene('millvillage', 16, 11); });
await p.evaluate(() => __MOSS__.devOpenMill('millGate'));
await p.getByRole('button', { name: /开闸向麦田/ }).click();
await p.waitForTimeout(300);
check('闸已转向麦田', await p.evaluate(() => __MOSS__.millInfo().waterTo), 'field');
await p.evaluate(() => { __MOSS__.devSwitchScene('millvillage', 9, 14); __MOSS__.state.inventory.flour = 0; });
await p.evaluate(() => __MOSS__.devOpenMill('millWheel'));
await p.getByRole('button', { name: /磨十二袋/ }).click();
await p.waitForTimeout(300);
check('水给麦田时出粉减半', await p.evaluate(() => __MOSS__.invCount('flour')), 6);

// 8. 交货
await p.evaluate(() => { __MOSS__.state.inventory.flour = 6; __MOSS__.devSwitchScene('millvillage', 26, 20); });
await p.evaluate(() => __MOSS__.devOpenMill('millDeliver'));
await p.getByRole('button', { name: /交货：面粉/ }).click();
await p.waitForTimeout(300);
const fin = await p.evaluate(() => ({ w: __MOSS__.millInfo(), coins: __MOSS__.state.coins }));
check('交货后验收完成', fin.w.inspected, true);
check('任务完成', fin.w.step, 3);
check('交付后给钱', fin.coins > 0, true);

// 9. 存档与重载
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const after = await p.evaluate(() => __MOSS__.millInfo());
check('重载后工程状态保留', after.repaired && after.inspected, true);
check('重载后任务进度保留', after.step, 3);
check('重载后闸门方向保留', after.waterTo, 'field');

// 9. 麦田按"进水的日子"累积，不会每帧就成熟
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.sceneId = 'millvillage'; s.player = { x: 27, y: 18, face: 'down' };
  s.totalDay = 2;
  s.exploration.millWorks = { repaired: true, waterTo: 'field', wateredDays: 0, wateredLastDay: 2 };
  __MOSS__.syncPlayer();
});
await p.waitForTimeout(700);
check('同一天停留不会让麦子成熟', await p.evaluate(() => __MOSS__.millWaterDays().wateredDays), 0);
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.totalDay = 4;   // 跨过两天
});
await p.waitForTimeout(300);
check('过了两天按天累积两天', await p.evaluate(() => __MOSS__.millWaterDays().wateredDays), 2);

// 10. 地图与传送：先离开麦田村，站在当前位置永远不可传送
await p.evaluate(() => { __MOSS__.devSwitchScene('town', 14, 10); });
await p.keyboard.press('m');
await p.waitForSelector('.travel-panel');
check('地图出现麦田村', await p.getByRole('button', { name: /^风铃磨坊与麦田村/ }).count(), 1);
check('到访后可传送', await p.getByRole('button', { name: /^风铃磨坊与麦田村.*可传送/ }).count(), 1);
await p.getByRole('button', { name: /^风铃磨坊与麦田村/ }).click();
const pv = await p.evaluate(() => __MOSS__.travelPreview('mill.square'));
check('小镇↔麦田村为相邻通勤 10 分钟', pv.minutes, 10);
await p.screenshot({ path: 'output/playwright/v7c-mill-travel.png' });
// 真的传过去
await p.getByRole('button', { name: '传送过去', exact: true }).click();
await p.waitForFunction(() => __MOSS__.state.sceneId === 'millvillage');
check('传送抵达麦田村', await p.evaluate(() => __MOSS__.state.sceneId), 'millvillage');
check('落点可走', await p.evaluate(() => !__MOSS__.isSolidTest('millvillage', __MOSS__.state.player.x, __MOSS__.state.player.y)), true);
await p.keyboard.press('Escape');

await p.screenshot({ path: 'output/playwright/v7c-mill-village.png' });
check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\n阶段 C 麦田村 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
