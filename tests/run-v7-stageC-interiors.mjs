/* 阶段 C 退出条件：每个常驻地点要有「真实内部」（§34.1、§32.7）
   磨坊机房与兽医小屋必须能进去、进去有各自不同的陈设与真实状态文案，
   不能是外面挂着名字、进去一个通用柜台。 */
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

// 1. 磨坊机房：可进入
await p.evaluate(() => { __MOSS__.devSwitchScene('millvillage', 12, 16); });
check('村里有进机房的门', await p.evaluate(() => !!(__MOSS__.hasProp('millDoor'))), true);
await p.evaluate(() => __MOSS__.devInteract('millDoor'));
await p.waitForFunction(() => __MOSS__.state.sceneId === 'millroom');
check('进入磨坊机房', await p.evaluate(() => __MOSS__.state.sceneId), 'millroom');
check('机房有名字', await p.evaluate(() => __MOSS__.sceneSize().name), '磨坊机房');
check('机房有五件陈设', await p.evaluate(() => __MOSS__.interiorFurnitureCount('millroom')), 5);
await p.screenshot({ path: 'output/playwright/v7c-millroom.png' });

// 2. 家具参与碰撞，不能走过去
const blocked = await p.evaluate(() => __MOSS__.isSolidTest('millroom', 5, 4));
check('磨盘占格且阻挡', blocked, true);
const walkable = await p.evaluate(() => !__MOSS__.isSolidTest('millroom', 8, 8));
check('空地可走', walkable, true);

// 3. 陈设有各自不同的文案，不是复制品
await p.evaluate(() => __MOSS__.devOpenProp('millstone'));
const stoneTxt = await p.locator('.win-body').innerText();
await p.keyboard.press('Escape');
await p.evaluate(() => __MOSS__.devOpenProp('millshaft'));
const shaftTxt = await p.locator('.win-body').innerText();
check('磨盘与水轮轴文案不同', stoneTxt !== shaftTxt, true);
check('未修时水轮轴描述故障', shaftTxt.includes('裂') || shaftTxt.includes('缠'), true);
await p.keyboard.press('Escape');

// 4. 内部文案随真实状态变化
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.exploration.millWorks = { repaired: true, plan: 'axle', waterTo: 'mill', wheelTurns: 14 };
  __MOSS__.startGame(s);
});
await p.evaluate(() => __MOSS__.devSwitchScene('millroom', 8, 8));
await p.evaluate(() => __MOSS__.devOpenProp('millshaft'));
const shaftFixed = await p.locator('.win-body').innerText();
check('修好后描述不同（换轴方案）', shaftFixed.includes('新轴'), true);
check('换轴仍提醒水压没变', shaftFixed.includes('水压'), true);
await p.keyboard.press('Escape');
await p.evaluate(() => __MOSS__.devOpenProp('floursacks'));
const sackTxt = await p.locator('.win-body').innerText();
check('面粉袋显示真实磨粉计数', sackTxt.includes('14'), true);
await p.keyboard.press('Escape');

// 5. 改渠方案文案不同
await p.evaluate(() => {
  const s = __MOSS__.state;
  s.exploration.millWorks = { repaired: true, plan: 'channel', waterTo: 'field', wheelTurns: 3 };
  __MOSS__.startGame(s);
});
await p.evaluate(() => __MOSS__.devSwitchScene('millroom', 8, 8));
await p.evaluate(() => __MOSS__.devOpenProp('millshaft'));
const shaftChannel = await p.locator('.win-body').innerText();
check('改渠方案文案与换轴不同', shaftChannel !== shaftFixed, true);
check('改渠说明卸掉水压', shaftChannel.includes('水压'), true);
await p.keyboard.press('Escape');

// 6. 机房归属麦田村传送节点
check('机房归属麦田村', await p.evaluate(() => __MOSS__.currentNodeDebug()), 'mill.square');

// 7. 兽医小屋：可进入且陈设不同
await p.evaluate(() => { __MOSS__.devSwitchScene('heath', 32, 6); });
await p.evaluate(() => __MOSS__.devInteract('vetDoor'));
await p.waitForFunction(() => __MOSS__.state.sceneId === 'vetroom');
check('进入兽医小屋', await p.evaluate(() => __MOSS__.state.sceneId), 'vetroom');
check('小屋有名字', await p.evaluate(() => __MOSS__.sceneSize().name), '兽医小屋');
check('小屋有四件陈设', await p.evaluate(() => __MOSS__.interiorFurnitureCount('vetroom')), 4);
check('检查台阻挡', await p.evaluate(() => __MOSS__.isSolidTest('vetroom', 8, 5)), true);
await p.screenshot({ path: 'output/playwright/v7c-vetroom.png' });

// 8. 病历架文案随水槽状态变化
await p.evaluate(() => { __MOSS__.state.exploration.meadow = { trough: false, eggs: 0, sheepFed: 0, wateredDay: -1, fedDay: -1 }; });
await p.evaluate(() => __MOSS__.devOpenProp('records'));
const recBefore = await p.locator('.win-body').innerText();
await p.keyboard.press('Escape');
await p.evaluate(() => { __MOSS__.state.exploration.meadow.trough = true; });
await p.evaluate(() => __MOSS__.devOpenProp('records'));
const recAfter = await p.locator('.win-body').innerText();
check('病历随水槽状态变化', recBefore !== recAfter, true);
check('未修时记录写缺石料', recBefore.includes('石料'), true);
check('修好后记录写供水恢复', recAfter.includes('供水恢复'), true);
await p.keyboard.press('Escape');

// 9. 小屋归属草甸传送节点
check('小屋归属草甸', await p.evaluate(() => __MOSS__.currentNodeDebug()), 'heath.ranch');

// 10. 门能出来
await p.evaluate(() => { __MOSS__.devSwitchScene('vetroom', 8, 10); });
check('小屋出口格可走', await p.evaluate(() => !__MOSS__.isSolidTest('vetroom', 8, 10)), true);
await p.evaluate(() => __MOSS__.checkExitDebug());
await p.waitForFunction(() => __MOSS__.state.sceneId === 'heath', null, { timeout: 8000 });
check('从小屋回到草甸', await p.evaluate(() => __MOSS__.state.sceneId), 'heath');

check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\n阶段 C 真实内部 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
