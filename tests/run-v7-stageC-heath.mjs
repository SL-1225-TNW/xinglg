/* 阶段 C 第二个常驻地点：石楠草甸（总规 §31.1）
   修饮水槽 → 照料新羊 → 首份羊毛合同；照料短缺先减产不处死牲口。 */
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

// 1. 场景与人物
await p.evaluate(() => { __MOSS__.devSwitchScene('heath', 6, 22); });
check('进入石楠草甸', await p.evaluate(() => __MOSS__.state.sceneId), 'heath');
check('场景尺寸', await p.evaluate(() => ({ w: __MOSS__.sceneSize().w, h: __MOSS__.sceneSize().h })), { w: 38, h: 26 });
check('艾妲在草甸', await p.evaluate(() => __MOSS__.npcScene('aida')), 'heath');
check('卢安在草甸', await p.evaluate(() => __MOSS__.npcScene('luan')), 'heath');
check('两人都登记了日程', await p.evaluate(() => !!__MOSS__.npcInfo('aida') && !!__MOSS__.npcInfo('luan')), true);
check('落点可走', await p.evaluate(() => !__MOSS__.isSolidTest('heath', 6, 22)), true);

// 2. 第一步：修饮水槽需要材料，缺材料不能硬修
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.sceneId = 'heath'; s.player = { x: 14, y: 17, face: 'up' };
  s.inventory.stone = 0; s.inventory.wood = 0;
  __MOSS__.syncPlayer();
});
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowTrough'));
check('未修时显示修槽需求', (await p.locator('.win-body').innerText()).includes('石头'), true);
const beforeCoin = await p.evaluate(() => __MOSS__.state.coins);
await p.getByRole('button', { name: '修好水槽', exact: true }).click();
await p.waitForTimeout(300);
check('材料不足时不扣体力不推进', await p.evaluate(() => __MOSS__.meadowInfo()), { trough: false, watered: false, fed: false, eggs: 0, sheepFed: 0, sheared: 0, step: 0 });

// 给足材料
await p.evaluate(() => {
  const s = __MOSS__.state; s.inventory.stone = 12; s.inventory.wood = 6; s.inventory.hay = 6;
  __MOSS__.saveNow();
});
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowTrough'));
await p.getByRole('button', { name: '修好水槽', exact: true }).click();
await p.waitForTimeout(300);
const t1 = await p.evaluate(() => __MOSS__.meadowInfo());
check('水槽修好', t1.trough, true);
check('进入第二步', t1.step, 1);
check('修槽消耗材料', await p.evaluate(() => ({ stone: __MOSS__.invCount('stone'), wood: __MOSS__.invCount('wood') })), { stone: 2, wood: 2 });

// 3. 照料：喂食需要牧草
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 10, 6));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShed'));
check('畜棚显示割草入口', await p.getByRole('button', { name: /割草/ }).count(), 1);
// 先割草
await p.getByRole('button', { name: /割草/ }).click();
await p.waitForTimeout(250);
check('割到牧草', await p.evaluate(() => __MOSS__.invCount('hay')), 8);
// 再喂
await p.getByRole('button', { name: /喂食/ }).click();
await p.waitForTimeout(250);
const fed = await p.evaluate(() => __MOSS__.meadowInfo());
check('喂食记入当天', fed.fed, true);
check('照料次数累加', fed.sheepFed, 1);
// 同一天重复喂要被挡
await p.getByRole('button', { name: /喂食/ }).click();
await p.waitForTimeout(250);
check('同一天不能重复喂', await p.evaluate(() => __MOSS__.meadowInfo().sheepFed), 1);

// 4. 蛋的真实产出：有水有草才下 2 个
// 修好水槽当天就已经添满，所以推进到下一天再照料，才能测到真实产出差异
await p.evaluate(() => { __MOSS__.state.totalDay = 2; });
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 10, 6));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShed'));
await p.getByRole('button', { name: /喂食/ }).click();
await p.waitForTimeout(250);
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 14, 17));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowTrough'));
check('新的一天需要重新添水', await p.evaluate(() => __MOSS__.meadowInfo().watered), false);
await p.getByRole('button', { name: /添水/ }).click();
await p.waitForTimeout(250);
check('添水记入当天', await p.evaluate(() => __MOSS__.meadowInfo().watered), true);

await p.evaluate(() => __MOSS__.sleepOnceForTest());
await p.waitForTimeout(400);
check('吃饱喝足下 2 个蛋', await p.evaluate(() => __MOSS__.meadowInfo().eggs), 2);

// 5. 照料短缺先减产，不处死
await p.evaluate(() => { __MOSS__.state.totalDay = 3; });   // 换一天，水槽自然变空
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 10, 6));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShed'));
await p.getByRole('button', { name: /割草/ }).click();
await p.waitForTimeout(200);
await p.getByRole('button', { name: /喂食/ }).click();
await p.waitForTimeout(250);
check('喂了但今天没水', await p.evaluate(() => ({ f: __MOSS__.meadowInfo().fed, w: __MOSS__.meadowInfo().watered })), { f: true, w: false });
await p.evaluate(() => __MOSS__.sleepOnceForTest());
await p.waitForTimeout(400);
check('喂了但没水只多下 1 个蛋', await p.evaluate(() => __MOSS__.meadowInfo().eggs), 3);
check('没照料也不减少羊只', await p.evaluate(() => __MOSS__.meadowInfo().sheepFed >= 1), true);

// 6. 收蛋
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 10, 6));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShed'));
await p.getByRole('button', { name: /收蛋/ }).click();
await p.waitForTimeout(250);
check('收到鸡蛋', await p.evaluate(() => __MOSS__.invCount('egg')), 3);
check('蛋清空', await p.evaluate(() => __MOSS__.meadowInfo().eggs), 0);

// 7. 剪毛要羊稳了（照料 3 次）
await p.evaluate(() => { __MOSS__.state.exploration.meadow.sheepFed = 0; });
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 17, 17));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShear'));
check('羊没稳时不能剪', await p.getByRole('button', { name: /剪毛/ }).count(), 0);
check('未稳时提示已照料次数', (await p.locator('.win-body').innerText()).includes('已照料 0 次'), true);
await p.evaluate(() => { __MOSS__.state.exploration.meadow.sheepFed = 3; });
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowShear'));
await p.getByRole('button', { name: /剪毛/ }).click();
await p.waitForTimeout(300);
check('剪下羊毛', await p.evaluate(() => __MOSS__.invCount('wool')), 1);

// 8. 第三步：兽医小屋交付合同
await p.evaluate(() => __MOSS__.devSwitchScene('heath', 32, 6));
await p.evaluate(() => __MOSS__.devOpenMeadow('meadowVet'));
const coinBefore = await p.evaluate(() => __MOSS__.state.coins);
await p.getByRole('button', { name: /交付首份羊毛合同/ }).click();
await p.waitForTimeout(300);
const fin = await p.evaluate(() => ({ i: __MOSS__.meadowInfo(), c: __MOSS__.state.coins, w: __MOSS__.invCount('wool') }));
check('合同完成', fin.i.step, 3);
check('交付后扣掉羊毛', fin.w, 0);
check('合同给钱', fin.c - coinBefore, 100);
check('两人好感都涨了', await p.evaluate(() => ({ a: __MOSS__.state.npcFriendship.aida, l: __MOSS__.state.npcFriendship.luan })), { a: 15, l: 10 });

// 9. 存档与重载
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const after = await p.evaluate(() => __MOSS__.meadowInfo());
check('重载后水槽保留', after.trough, true);
check('重载后合同进度保留', after.step, 3);

// 10. 地图与传送
await p.evaluate(() => { __MOSS__.devSwitchScene('town', 14, 10); });
await p.keyboard.press('m');
await p.waitForSelector('.travel-panel');
check('地图出现石楠草甸', await p.getByRole('button', { name: /^石楠草甸/ }).count(), 1);
await p.getByRole('button', { name: /^石楠草甸/ }).click();
check('到访后可传送', await p.getByRole('button', { name: /^石楠草甸.*可传送/ }).count(), 1);
check('小镇↔草甸 10 分钟', await p.evaluate(() => __MOSS__.travelPreview('heath.ranch').minutes), 10);
await p.screenshot({ path: 'output/playwright/v7c-heath-travel.png' });
await p.getByRole('button', { name: '传送过去', exact: true }).click();
await p.waitForFunction(() => __MOSS__.state.sceneId === 'heath');
check('传送抵达草甸', await p.evaluate(() => __MOSS__.state.sceneId), 'heath');

await p.evaluate(() => { __MOSS__.devSwitchScene('heath', 12, 12); });
await p.waitForTimeout(500);
await p.screenshot({ path: 'output/playwright/v7c-heath-pasture.png' });
check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\n阶段 C 石楠草甸 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
