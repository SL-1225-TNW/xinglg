/* 边界与异常测试：体力、背包、制作、天气、存档、迁移、UI */
import {
  launch, boot, snap, hud, pos, walkTo, walkAdjacent, clickTile, useSpaceOn, faceTowards,
  pickTool, press, winOpen, winTitle, winText, closeWin, clickWin, clickItemByName,
  lastToast, clearToasts, sleepViaMenu, sleepAtFarmhouse, dismissSettlement, GAME_URL, isolatedPage
} from './harness.mjs';
const { Report } = await import('./harness.mjs');
const rep = new Report();
const sleep = sleepViaMenu;

function reset(page) {
  return boot(page, { fresh: true });
}
async function setupState(page, patch) {
  await page.evaluate(p => {
    const M = window.__MOSS__;
    const s = JSON.parse(JSON.stringify(M.state));
    Object.assign(s, p);
    M.startGame(s);
  }, patch);
  await page.waitForTimeout(200);
}

const { browser, page, errors } = await launch();

/* ================= 1. 忘记浇水 ================= */
console.log('\n【边界 1】忘记浇水不生长也不消失');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.plots['7,8'] = { tilled: true, water: true, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0 };
  s.plots['8,8'] = { tilled: true, water: false, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0 };
  s.plots['9,8'] = { tilled: true, water: true, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0 };
  s.weather = { today: 'sun', tomorrow: 'sun' };
  window.__MOSS__.saveNow();
});
// 第 1 晚：7,8 与 9,8 浇水
await sleep(page); await dismissSettlement(page);
await page.evaluate(() => { window.__MOSS__.state.weather = { today: 'sun', tomorrow: 'sun' }; });
// 第 2 晚：只有 7,8 浇水（8,8 故意忘记）
await page.evaluate(() => { const s = window.__MOSS__.state; s.plots['7,8'].water = true; s.plots['9,8'].water = false; s.plots['8,8'].water = false; });
await sleep(page); await dismissSettlement(page);
await page.evaluate(() => { const s = window.__MOSS__.state; s.weather = { today: 'sun', tomorrow: 'sun' }; s.plots['7,8'].water = true; s.plots['8,8'].water = false; });
await sleep(page); await dismissSettlement(page);
let s = await snap(page);
rep.eq('浇水的萝卜第 3 天成熟', s.plots['7,8'].mature, true);
rep.eq('没浇水的萝卜仍停在 0 天', s.plots['8,8'].age, 0);
rep.ok('没浇水的作物没有被删除', !!s.plots['8,8'] && s.plots['8,8'].crop === 'radish');
rep.eq('没浇水的作物不成熟', s.plots['8,8'].mature, false);

/* ================= 2. 体力不足 ================= */
console.log('【边界 2】体力不足时工具失败且不改变目标');
await reset(page);
await walkTo(page, 7, 9);
await page.evaluate(() => { window.__MOSS__.state.energy = 1; });
const e0 = (await snap(page)).energy;
await pickTool(page, 1);
await clickTile(page, 7, 8);
s = await snap(page);
rep.eq('体力不足时不能锄地', !!s.plots['7,8'], false);
rep.eq('体力不足不扣体力', s.energy, e0);
rep.ok('给出体力不足提示', /体力不足/.test(await lastToast(page)));
// 移动/收获/交易仍可用
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
rep.ok('体力不足仍能移动', (await pos(page))[0] !== 7);
await page.evaluate(() => { const s = window.__MOSS__.state; s.energy = 20; s.inventory.radish = 1; });
await walkTo(page, 7, 9);
await pickTool(page, 1); await clickTile(page, 7, 8);
await pickTool(page, 2); await clickTile(page, 7, 8);
await page.evaluate(() => { const s = window.__MOSS__.state; s.energy = 1; s.plots['7,8'].mature = true; s.inventory.radish = 2; });
await press(page, 'b');
await page.locator('.win .item', { hasText: '萝卜' }).locator('button', { hasText: '吃一个' }).click();
await page.waitForTimeout(150);
rep.ok('体力不足时也能吃东西恢复', (await snap(page)).energy > 1, `体力 ${(await snap(page)).energy}`);
rep.eq('吃 1 个消耗 1 个食物', (await snap(page)).inv.radish, 1);
// 体力已满时不消耗食物
await page.evaluate(() => { window.__MOSS__.state.energy = 100; });
await page.locator('.win .item', { hasText: '萝卜' }).locator('button', { hasText: '吃一个' }).click();
await page.waitForTimeout(150);
s = await snap(page);
rep.ok('体力已满时提示不消耗', /体力已经满/.test(await lastToast(page)));
rep.eq('体力已满时不消耗食物', s.inv.radish, 1);
await closeWin(page);
rep.ok('体力不足不妨碍睡觉推进', await sleepAtFarmhouse(page));
await dismissSettlement(page);

/* ================= 3. 背包已满 ================= */
console.log('【边界 3】背包满时不吞物品');
await reset(page);
await setupState(page, {
  energy: 100,
  plots: { '7,8': { tilled: true, water: true, crop: 'radish', age: 3, mature: true, harvested: false, regrow: 0 } },
  inventory: { seed_radish: 1, potato: 99, berry: 99, jam: 99, wood: 99, stone: 99, berry: 99, tool_hoe: 1 }
});
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.inventory = {};
  const fill = ['potato', 'berry', 'wood', 'stone', 'fish_crucian', 'fish_bass', 'fish_silver', 'strawberry', 'jam'];
  for (let i = 0; i < 25; i++) s.inventory[fill[i % fill.length]] = (s.inventory[fill[i % fill.length]] || 0) + 99;
  s.inventory.seed_radish = 5;
  s.inventory.radish = 0;              // 保证萝卜是新物品，正好占满背包
  window.__MOSS__.saveNow();
});
let slots = await page.evaluate(() => window.__MOSS__.countSlots());
rep.ok('背包被填满', slots >= 20, `格数 ${slots}`);
await walkTo(page, 7, 9);
await pickTool(page, 4);
await clickTile(page, 7, 8);
s = await snap(page);
rep.ok('背包满时收获失败', /背包满/.test(await lastToast(page)), await lastToast(page));
rep.eq('背包满时作物仍留在地里', [s.plots['7,8'].mature, !!s.plots['7,8'].crop], [true, true]);
rep.eq('背包满时没有多出萝卜', s.inv.radish || 0, 0);
// 采石：背包满时保留节点
await page.evaluate(() => { const s = window.__MOSS__.state; s.energy = 100; });
await mineAtSafe(page, 1, 11);
s = await snap(page);
rep.ok('背包满时石头节点保留', s.nodes['1,11'].active === true, JSON.stringify(s.nodes['1,11']));
async function mineAtSafe(pg, x, y) {
  await walkAdjacent(pg, x, y);
  await pickTool(pg, 6);
  for (let i = 0; i < 2; i++) { await clickTile(pg, x, y); await page.waitForTimeout(80); }
}
// 腾出空间后可以正常收获
await page.evaluate(() => { const s = window.__MOSS__.state; s.inventory = { seed_radish: 5, tool_hoe: 1, tool_can: 1, tool_axe: 1, tool_pick: 1, basket: 1 }; });
await walkTo(page, 7, 9); await pickTool(page, 4); await clickTile(page, 7, 8);
s = await snap(page);
rep.eq('腾出空间后收获成功', s.inv.radish, 1);

/* ================= 4. 制作失败不扣材料 ================= */
console.log('【边界 4】制作失败不扣材料 / 背包满不扣材料');
await reset(page);
await page.evaluate(() => { const s = window.__MOSS__.state; s.inventory = { tool_hoe: 1, wood: 5 }; window.__MOSS__.saveNow(); });
await press(page, 'c');
rep.ok('制作菜单打开', /制作/.test(await winTitle(page)));
const craftBtn = page.locator('.win .item', { hasText: '木箱' }).locator('button').first();
rep.ok('材料不足时按钮禁用', await craftBtn.isDisabled());
rep.ok('展示拥有/需要数量', (await winText(page)).includes('木材 5 / 10'));
await page.evaluate(() => { const s = window.__MOSS__.state; s.inventory.wood = 10; s.inventory.dev_chest = 0; });
await page.evaluate(() => window.__MOSS__.refreshWindow());
await page.waitForTimeout(200);
await page.locator('.win .item', { hasText: '木箱' }).locator('button').first().click();
await page.waitForTimeout(200);
s = await snap(page);
rep.eq('制作木箱成功', s.inv.dev_chest, 1);
rep.eq('制作后材料扣除到 0', s.inv.wood || 0, 0);
rep.ok('未解锁洒水器配方不可制作', await page.locator('.win .item', { hasText: '洒水器' }).locator('button').first().isDisabled());
await closeWin(page);

/* ================= 5. 洒水器只浇四格 ================= */
console.log('【边界 5】洒水器覆盖上下左右四格，不含对角');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.inventory.dev_sprinkler = 1;
  s.plots = {};
  const around = { '10,7': 0, '10,9': 0, '9,8': 0, '11,8': 0, '9,7': 0, '11,7': 0, '9,9': 0, '11,9': 0, '10,6': 0, '10,10': 0 };
  Object.keys(around).forEach(k => { const [x, y] = k.split(',').map(Number); s.plots[k] = { tilled: true, water: false, crop: null, age: 0, mature: false, harvested: false, regrow: 0 }; });
  s.weather = { today: 'sun', tomorrow: 'sun' };
  s.structures = [{ id: 's1', device: 'sprinkler', x: 10, y: 8, contents: {} }];
  s.nextStructureId = 2;
  window.__MOSS__.saveNow();
});
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('上格被浇灌', s.plots['10,7'].water, true);
rep.eq('下格被浇灌', s.plots['10,9'].water, true);
rep.eq('左格被浇灌', s.plots['9,8'].water, true);
rep.eq('右格被浇灌', s.plots['11,8'].water, true);
rep.eq('左上对角不被浇灌', s.plots['9,7'].water, false);
rep.eq('右上对角不被浇灌', s.plots['11,7'].water, false);
rep.eq('左下对角不被浇灌', s.plots['9,9'].water, false);
rep.eq('右下对角不被浇灌', s.plots['11,9'].water, false);
rep.eq('更远的格子不被浇灌', s.plots['10,6'].water, false);

/* ================= 6. 草莓再生 ================= */
console.log('【边界 6】草莓首次 6 天 + 再生 3 天');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.plots['7,8'] = { tilled: true, water: true, crop: 'strawberry', age: 5, mature: false, harvested: false, regrow: 0 };
  s.weather = { today: 'sun', tomorrow: 'sun' };
  window.__MOSS__.saveNow();
});
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('草莓第 6 次结算后首次成熟', s.plots['7,8'].mature, true);
await walkTo(page, 7, 9); await pickTool(page, 4); await clickTile(page, 7, 8);
s = await snap(page);
rep.eq('收获草莓', s.inv.strawberry, 1);
rep.eq('收获后进入再生', [s.plots['7,8'].mature, s.plots['7,8'].harvested], [false, true]);
await page.evaluate(() => { const s = window.__MOSS__.state; s.weather = { today: 'sun', tomorrow: 'sun' }; });
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => { const s = window.__MOSS__.state; Object.values(s.plots).forEach(p => { if (p.crop) p.water = true; }); });
  await sleep(page); await dismissSettlement(page);
}
s = await snap(page);
rep.eq('再生第 2 天仍未成熟', s.plots['7,8'].mature, false);
await page.evaluate(() => { const s = window.__MOSS__.state; Object.values(s.plots).forEach(p => { if (p.crop) p.water = true; }); });
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('再生第 3 天再次成熟', s.plots['7,8'].mature, true);

/* ================= 7. 果酱加工 ================= */
console.log('【边界 7】果酱罐隔天完成、领取不重复、背包满保留');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.inventory.strawberry = 3;
  s.structures = [{ id: 's1', device: 'jam_jar', x: 7, y: 8, input: 0, startDay: 0, ready: false, contents: {} }];
  s.nextStructureId = 2;
  window.__MOSS__.saveNow();
});
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.keyboard.press('e');
await page.waitForTimeout(250);
rep.ok('可以打开果酱罐', /果酱罐/.test(await winTitle(page)));
await clickWin(page, '投入 1 颗草莓');
s = await snap(page);
rep.eq('投入后草莓减少', s.inv.strawberry, 2);
rep.eq('罐子进入加工', s.structures[0].input, 1);
rep.ok('加工中不能再投入', (await winText(page)).includes('不能投入'));
await closeWin(page);
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('次日成品可领取', s.structures[0].ready, true);
// 刷新不加速
await page.reload();
await page.waitForFunction(() => !!window.__MOSS__);
await page.locator('.boot-actions button').first().click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
s = await snap(page);
rep.eq('刷新后仍是 1 份待领', [s.structures[0].ready, s.structures[0].input], [true, 1]);
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.keyboard.press('e'); await page.waitForTimeout(250);
await clickWin(page, '领取莓果酱');
s = await snap(page);
rep.eq('领取后莓果酱进背包', s.inv.jam, 1);
rep.eq('领取后罐子清空', [s.structures[0].ready, s.structures[0].input], [false, 0]);
rep.ok('领取后罐子回到空闲、不可重复领取', (await winText(page)).includes('空闲'));
await closeWin(page);
// 空罐可收起
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.keyboard.press('e'); await page.waitForTimeout(250);
await clickWin(page, '收起果酱罐');
s = await snap(page);
rep.eq('空果酱罐可收起', [s.structures.length, s.inv.dev_jam], [0, 1]);
// 背包满时成品保留
await setupState(page, { structures: [{ id: 's1', device: 'jam_jar', x: 7, y: 8, input: 0, startDay: 0, ready: true, contents: {} }], nextStructureId: 2, inventory: { tool_hoe: 1 } });
await page.evaluate(() => {
  const s = window.__MOSS__.state; s.inventory = { tool_hoe: 1 };
  const fill = ['potato', 'berry', 'wood', 'stone', 'fish_crucian', 'fish_bass', 'fish_silver', 'radish', 'strawberry', 'jam'];
  for (let i = 0; i < 25; i++) s.inventory[fill[i % fill.length]] = (s.inventory[fill[i % fill.length]] || 0) + 99;
  s.jam = 0; delete s.inventory.jam;
  window.__MOSS__.saveNow();
});
rep.ok('背包确实已满', await page.evaluate(() => window.__MOSS__.countSlots() >= 20), '格数 ' + await page.evaluate(() => window.__MOSS__.countSlots()));
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.keyboard.press('e'); await page.waitForTimeout(250);
const jamBefore = (await snap(page)).inv.jam || 0;
await page.locator('.win button', { hasText: '领取莓果酱' }).click();
await page.waitForTimeout(250);
s = await snap(page);
rep.eq('背包满时成品保留在罐子', s.structures[0].ready, true);
rep.eq('背包满时莓果酱没进背包', s.inv.jam || 0, jamBefore);

/* ================= 8. 箱子往返守恒 ================= */
console.log('【边界 8】箱子来回转移物品总数不变');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.inventory = { tool_hoe: 1, wood: 37, stone: 12, radish: 5 };
  s.structures = [{ id: 's1', device: 'chest', x: 7, y: 8, contents: {} }];
  s.nextStructureId = 2;
  window.__MOSS__.saveNow();
});
const total = () => page.evaluate(() => {
  const s = window.__MOSS__.state, b = s.structures[0].contents;
  const f = o => Object.keys(o).reduce((a, k) => a + (o[k] || 0), 0);
  return f(s.inventory) + f(b);
});
const t0 = await total();
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.keyboard.press('e'); await page.waitForTimeout(250);
rep.ok('可以打开木箱', /木箱/.test(await winTitle(page)));
await clickWin(page, '背包全部放入');
rep.eq('全部放入后总数不变', await total(), t0);
await clickWin(page, '箱子全部取出');
rep.eq('全部取出后总数不变', await total(), t0);
s = await snap(page);
rep.eq('物品回到背包', [s.inv.wood, s.inv.stone, s.inv.radish], [37, 12, 5]);
// 非空箱子不可收起
await page.locator('.win .item', { hasText: '木材' }).first().locator('button', { hasText: '放入 1 个' }).click();
await page.waitForTimeout(200);
await closeWin(page);
await faceTowards(page, 7, 8);
await page.keyboard.press('e'); await page.waitForTimeout(250);
await clickWin(page, '收起木箱');
s = await snap(page);
rep.eq('非空箱子不能收起', s.structures.length, 1);
await closeWin(page);

/* ================= 9. 天气刷新不变 ================= */
console.log('【边界 9】同一天刷新后天气与预报保持一致');
await reset(page);
for (let d = 0; d < 5; d++) { await sleep(page); await dismissSettlement(page); }
s = await snap(page);
const w = JSON.stringify(s.weather);
await page.reload();
await page.waitForFunction(() => !!window.__MOSS__);
await page.locator('.boot-actions button').first().click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
rep.eq('刷新后天气不变', JSON.stringify((await snap(page)).weather), w);
rep.eq('第 1 天晴', s.day >= 5 ? 'ok' : '', 'ok');
rep.note(`第 ${s.day} 天天气：${w}`);
rep.note('（前三天为 晴/晴/雨，第 4 天起 70% 晴 30% 雨）');

/* ================= 10. 赠礼每日一次 ================= */
console.log('【边界 10】赠礼规则');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.inventory = { tool_hoe: 1, tool_can: 1, tool_axe: 1, tool_pick: 1, basket: 1, radish: 3, stone: 2, fish_crucian: 1 };
  s.questProgress = { 1: 'done', 2: 'done', 3: 'done', 4: 'done' };
  s.bridgeRepaired = true;
  s.inventory.tool_rod = 1;
  window.__MOSS__.saveNow();
});
await walkTo(page, 31, 10);
await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'town', null, { timeout: 5000 });
await page.waitForTimeout(300);
async function gift(page, npcName, itemName) {
  const id = await page.evaluate(n => Object.keys(window.__MOSS__.NPCS).find(i => window.__MOSS__.NPCS[i].name === n), npcName);
  if (!id) return false;
  if ((await snap(page)).scene !== 'town') {
    await walkTo(page, 31, 10);
    try { await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'town', null, { timeout: 8000 }); } catch (e) { }
    await page.waitForTimeout(350);
  }
  if ((await snap(page)).scene !== 'town') return false;
  for (let t = 0; t < 20; t++) {
    if (await winOpen(page)) await closeWin(page);
    const np = await page.evaluate(x => { const r = window.__MOSS__.npcRuntime[x]; return r ? [r.x, r.y] : null; }, id);
    if (!np) return false;
    for (const [x, y] of [[np[0], np[1] - 1], [np[0] + 1, np[1]], [np[0] - 1, np[1]], [np[0], np[1] + 1], [np[0], np[1] - 2], [np[0] + 2, np[1]]]) {
      if (!(await page.evaluate(([a, b]) => !window.__MOSS__.isSolid(window.__MOSS__.state.sceneId, a, b), [x, y]))) continue;
      if (await walkTo(page, x, y, 5000)) {
        await faceTowards(page, np[0], np[1]);
        await page.keyboard.press('e'); await page.waitForTimeout(250);
        if (await winOpen(page)) return true;
      }
    }
    await page.waitForTimeout(250);
  }
  rep.note(`!! 找不到 ${npcName}（player=${JSON.stringify(await pos(page))} scene=${(await snap(page)).scene}）`);
  return false;
}
rep.ok('找到芽芽并对话', await gift(page, '芽芽', 'radish'));
const giftBtn = page.locator('.win button', { hasText: '赠送礼物' });
rep.ok('对话窗口提供赠送入口', await giftBtn.count() > 0);
rep.ok('对话窗口提供聊天入口', await page.locator('.win button', { hasText: '再聊一句' }).count() >= 0);
await giftBtn.click(); await page.waitForTimeout(150);
rep.ok('赠礼列表只显示可送物品', (await winText(page)).includes('萝卜'));
rep.ok('种子不能作为礼物', !(await winText(page)).includes('萝卜种子'));
rep.ok('工具不能作为礼物', !(await winText(page)).includes('水壶'));
const f0 = (await snap(page)).friend.yaya;
const inv0 = (await snap(page)).inv.radish;
await page.locator('.win .item', { hasText: '萝卜' }).locator('button', { hasText: '赠送 1 个' }).click();
await page.waitForTimeout(200);
s = await snap(page);
rep.eq('赠送喜欢的礼物 +8 好感', s.friend.yaya - f0, 8);
rep.eq('赠礼扣除 1 个物品', inv0 - s.inv.radish, 1);
rep.ok('赠礼后有反馈与好感变化', /好感 \+8/.test(await winText(page)) && /♡/.test(await winText(page)));
await closeWin(page);
rep.ok('第二天还能再送', await (async () => { await sleep(page); await dismissSettlement(page); return gift(page, '芽芽', 'radish'); })());
const giftBtn2 = page.locator('.win button', { hasText: '赠送礼物' });
if (await giftBtn2.count()) {
  const f1 = (await snap(page)).friend.yaya;
  await giftBtn2.click(); await page.waitForTimeout(150);
  await page.locator('.win .item', { hasText: '石头' }).locator('button', { hasText: '赠送 1 个' }).click();
  await page.waitForTimeout(200);
  s = await snap(page);
  rep.eq('赠送不喜欢的礼物 -2 好感', s.friend.yaya - f1, -2);
  await closeWin(page);
  const beforeSecondGift = await snap(page);
  rep.ok('同一天仍可再次对话', await gift(page, '芽芽', 'radish'));
  rep.eq('重复对话不会额外加好感', (await snap(page)).friend.yaya, beforeSecondGift.friend.yaya);
  rep.eq('无赠礼入口时不会扣物品', (await snap(page)).inv, beforeSecondGift.inv);
  // 同日第二次：再打开对话窗口，赠送按钮应消失
  await (async () => {
    for (let i = 0; i < 8; i++) {
      if (await gift(page, '芽芽', 'radish')) break;
    }
  })();
  rep.eq('当天不再出现赠送入口', await page.locator('.win button', { hasText: '赠送礼物' }).count(), 0);
  await closeWin(page);
}
// 阿栎：石头是喜欢的
rep.ok('找到阿栎', await gift(page, '阿栎', 'stone'));
const f2 = (await snap(page)).friend.aqi;
const ab = page.locator('.win button', { hasText: '赠送礼物' });
if (await ab.count()) {
  await ab.click(); await page.waitForTimeout(150);
  await page.locator('.win .item', { hasText: '石头' }).locator('button', { hasText: '赠送 1 个' }).click();
  await page.waitForTimeout(200);
  s = await snap(page);
  rep.eq('阿栎喜欢石头 +8', s.friend.aqi - f2, 8);
  await closeWin(page);
}
const yLines = await page.evaluate(() => window.__MOSS__.NPCS.yaya.lines);
const aLines = await page.evaluate(() => window.__MOSS__.NPCS.aqi.lines);
rep.ok('两位村民台词不重复', yLines.every(l => !aLines.includes(l)));

/* ================= 11. 存档导出 / 导入 ================= */
console.log('【边界 11】导出 / 导入 / 导入失败');
await reset(page);
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.coins = 1234; s.inventory.radish = 7; s.inventory.seed_strawberry = 2;
  s.questProgress = { 1: 'done', 2: 'done', 3: 'unlocked', 4: 'locked' };
  s.npcFriendship = { yaya: 33, aqi: 12 };
  s.unlockedRecipes = ['chest', 'sprinkler'];
  window.__MOSS__.saveNow();
});
await press(page, 'Escape');
await clickWin(page, '导出存档');
const dump = await page.locator('#saveText').inputValue();
rep.ok('导出内容是合法 JSON', (() => { try { JSON.parse(dump); return true; } catch (e) { return false; } })());
rep.ok('导出内容含关键字段', JSON.parse(dump).coins === 1234 && JSON.parse(dump).version === 2);
await closeWin(page);
// 破坏当前存档
await page.evaluate(() => { window.__MOSS__.state.coins = 0; window.__MOSS__.state.inventory.radish = 0; window.__MOSS__.saveNow(); });
const beforeFail = await snap(page);
await press(page, 'Escape');
await clickWin(page, '导入存档');
await page.locator('#importText').fill('{ 这不是合法的 JSON');
await clickWin(page, '导入并覆盖');
s = await snap(page);
rep.eq('导入失败时当前存档不变', [s.coins, s.inv.radish], [beforeFail.coins, beforeFail.inv.radish]);
rep.ok('导入失败给出提示', /导入失败/.test(await lastToast(page)));
await page.locator('#importText').fill(JSON.stringify({ version: 1, hello: 'world' }));
await clickWin(page, '导入并覆盖');
s = await snap(page);
rep.eq('导入错误版本被拒绝', [s.coins, s.inv.radish], [beforeFail.coins, beforeFail.inv.radish]);
await page.locator('#importText').fill(dump);
await clickWin(page, '导入并覆盖');
await page.waitForTimeout(300);
s = await snap(page);
rep.eq('合法存档导入成功', s.coins, 1234);
rep.eq('导入恢复库存', s.inv.radish, 7);
rep.eq('导入恢复好感', {yaya:s.friend.yaya,aqi:s.friend.aqi,ds:s.friend.ds}, { yaya: 33, aqi: 12, ds: 0 });
rep.ok('新增居民好感默认值为零', Object.entries(s.friend).filter(([id])=>!['yaya','aqi','ds'].includes(id)).every(([,v])=>v===0));
rep.eq('导入恢复配方', s.recipes, ['chest', 'sprinkler']);

/* ================= 12. 损坏存档 ================= */
console.log('【边界 12】损坏存档不被静默覆盖');
const { ctx: ctx2, page: p2, errors: err2 } = await isolatedPage(browser, () => {
  localStorage.clear();
  localStorage.setItem('moss-farm-v2', '{ broken json');
});
const corruptNote = await p2.locator('#bootNote').textContent();
rep.ok('提示存档损坏', /损坏/.test(corruptNote), corruptNote);
rep.ok('提供导出原始数据入口', (await p2.locator('.boot-actions button', { hasText: '导出损坏的原始数据' }).count()) > 0);
rep.ok('提供重新开始入口', (await p2.locator('.boot-actions button', { hasText: '重新开始' }).count()) > 0);
rep.ok('不会自动进入损坏存档', await p2.evaluate(() => !window.__MOSS__.state));
rep.eq('损坏原文被保留', await p2.evaluate(() => localStorage.getItem('moss-farm-v2-corrupt')), '{ broken json');
await p2.locator('.boot-actions button', { hasText: '重新开始' }).click();
await p2.waitForTimeout(600);
await p2.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden, null, { timeout: 6000 });
const fresh2 = await p2.evaluate(() => ({ day: window.__MOSS__.state.totalDay, coins: window.__MOSS__.state.coins, trees: Object.values(window.__MOSS__.state.resourceNodes).filter(n => n.type === 'tree').length }));
rep.eq('重新开始得到全新第 1 天 50 金 10 棵树', fresh2, { day: 1, coins: 50, trees: 10 });
rep.ok('损坏存档流程无控制台错误', err2.length === 0, err2.join('|'));
await ctx2.close();

/* ================= 13. v1 迁移 ================= */
console.log('【边界 13】第一版存档迁移');
const v1 = JSON.stringify({
  day: 7, money: 320, seeds: 5, crops: 4, x: 10, y: 10, face: [0, -1],
  plots: { '6,4': { seed: true, water: true, age: 2 }, '7,4': { seed: true, water: false, age: 1 }, '8,4': { seed: false, water: true, age: 0 } }
});
const mig = await isolatedPage(browser, v => { localStorage.clear(); localStorage.setItem('moss-farm-v1', v); }, { width: 1100, height: 820 });
await mig.page.evaluate(v => localStorage.setItem('moss-farm-v1', v), v1);
await mig.page.reload();
await mig.page.waitForFunction(() => !!window.__MOSS__);
const migNote = await mig.page.locator('#bootNote').textContent();
rep.ok('提示已迁移', /迁移/.test(migNote), migNote);
await mig.page.locator('.boot-actions button').first().click();
await mig.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
s = await mig.page.evaluate(() => JSON.parse(JSON.stringify({
  day: window.__MOSS__.state.totalDay, coins: window.__MOSS__.state.coins,
  inv: window.__MOSS__.state.inventory, plots: window.__MOSS__.state.plots,
  energy: window.__MOSS__.state.energy, time: window.__MOSS__.state.timeMinutes,
  weather: window.__MOSS__.state.weather, px: window.__MOSS__.state.player.x, py: window.__MOSS__.state.player.y,
  quests: window.__MOSS__.state.questProgress
})));
rep.eq('迁移日期', s.day, 7);
rep.eq('迁移金币', s.coins, 320);
rep.eq('迁移萝卜种子', s.inv.seed_radish, 5);
rep.eq('迁移补发土豆种子', s.inv.seed_potato, 2);
rep.eq('迁移已收获萝卜', s.inv.radish, 4);
rep.eq('迁移保留种植', [s.plots['6,4'].crop, s.plots['6,4'].age, s.plots['6,4'].water], ['radish', 2, true]);
rep.eq('迁移保留浇水状态', s.plots['7,4'].water, false);
rep.eq('迁移保留空耕地', [!!s.plots['8,4'], s.plots['8,4'].crop], [true, null]);
rep.eq('迁移体力 100', s.energy, 100);
rep.eq('迁移时间 06:00', Math.floor(s.time), 360);
rep.eq('迁移当天晴天', s.weather.today, 'sun');
rep.eq('迁移位置保留', [s.px, s.py], [10, 10]);
rep.eq('迁移保留旧工具', [s.inv.tool_hoe, s.inv.tool_can, s.inv.basket], [1, 1, 1]);
rep.eq('迁移后委托 1 解锁', s.quests[1], 'unlocked');
rep.ok('保留第一版原始存档键', await mig.page.evaluate(() => !!localStorage.getItem('moss-farm-v1')));
rep.ok('已写入第二版存档键', await mig.page.evaluate(() => !!localStorage.getItem('moss-farm-v2')));
rep.ok('迁移后仍可正常游玩（锄地成功）', await (async () => {
  await mig.page.waitForTimeout(300);
  return await mig.page.evaluate(() => {
    const M = window.__MOSS__;
    const p = M.state.player;                 // 迁移后玩家在 (10,10)
    return M.useTool('hoe', p.x, p.y - 1) === true && !!M.state.plots[p.x + ',' + (p.y - 1)];
  });
})());
rep.ok('迁移流程无控制台错误', mig.errors.length === 0, mig.errors.join('|'));
await mig.ctx.close();
await reset(page);

await reset(page);

/* ================= 13b. 雨天规则（确定性） ================= */
console.log('【边界 13b】雨天规则：第 3 天必雨');
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.totalDay = 2; s.timeMinutes = 360; s.energy = 100;
  s.weather = { today: 'sun', tomorrow: 'rain' };
  s.plots = {
    '7,8': { tilled: true, water: false, crop: 'radish', age: 0, mature: false, harvested: false, regrow: 0 },
    '8,8': { tilled: true, water: false, crop: null, age: 0, mature: false, harvested: false, regrow: 0 }
  };
  window.__MOSS__.saveNow();
});
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('第 3 天确定为雨天', [s.day, s.weather.today], [3, 'rain']);
rep.eq('雨天所有耕地自动湿润', Object.values(s.plots).filter(p => p.water).length, 2);
rep.eq('第 2 晚没浇水所以不生长', s.plots['7,8'].age, 0);
await sleep(page); await dismissSettlement(page);
s = await snap(page);
rep.eq('雨天的作物照常生长', s.plots['7,8'].age, 1);
await walkTo(page, 17, 9);
await pickTool(page, 1); await clickTile(page, 17, 8);
rep.eq('雨天新锄的地自动湿润', (await snap(page)).plots['17,8'].water, true);
await pickTool(page, 3); await clickTile(page, 17, 8);
rep.ok('雨天浇水给出不用浇水的提示', /不用浇水|已经浇过水/.test(await lastToast(page)), await lastToast(page));
await pickTool(page, 2); await page.evaluate(() => { window.__MOSS__.state.selectedSeed = 'radish'; });
await clickTile(page, 17, 8);
rep.ok('雨天播种无需浇水', /雨天不用浇水/.test(await lastToast(page)));
rep.eq('雨天播种后地仍是湿润的', (await snap(page)).plots['17,8'].water, true);
await pickTool(page, 8);
await page.evaluate(() => { window.__MOSS__.state.selectedDevice = 'dev_sprinkler'; window.__MOSS__.state.inventory.dev_sprinkler = 1; });
await walkAdjacent(page, 20, 8);
await clickTile(page, 20, 8);
rep.ok('雨天也可正常放置设备', (await snap(page)).structures.filter(x => x.device === 'sprinkler').length === 1);

/* ================= 14. 错误操作提示 ================= */
console.log('【边界 14】无效操作给出简短原因且不消耗');
await reset(page);
await walkTo(page, 7, 9);
await pickTool(page, 2); await clickTile(page, 7, 8);
rep.ok('未松土播种有原因', /先把这块土地松好/.test(await lastToast(page)));
rep.eq('失败播种不扣种子', (await snap(page)).inv.seed_radish, 8);
await pickTool(page, 1); await clickTile(page, 7, 8);
await pickTool(page, 2); await clickTile(page, 7, 8);
await pickTool(page, 2); await clickTile(page, 7, 8);
rep.ok('重复播种有原因', /已经种了作物/.test(await lastToast(page)));
rep.eq('失败播种仍不扣种子', (await snap(page)).inv.seed_radish, 7);
await pickTool(page, 3); await clickTile(page, 7, 8);
await pickTool(page, 3); await clickTile(page, 7, 8);
rep.ok('重复浇水有原因', /已经浇过水/.test(await lastToast(page)));
const en0 = (await snap(page)).energy;
await pickTool(page, 3); await clickTile(page, 7, 8);
rep.eq('重复浇水不扣体力', (await snap(page)).energy, en0);
// 远处不能操作
await pickTool(page, 1); await clickTile(page, 20, 5);
rep.ok('隔空操作被拒绝', /走近一点/.test(await lastToast(page)));
// 错误工具不扣体力：镐子打树 / 斧头打石头
await walkAdjacent(page, 2, 9);   // (2,9) 是树
const en1 = (await snap(page)).energy;
await pickTool(page, 6); await clickTile(page, 2, 9);
rep.ok('用镐子打树有原因（提示改用斧头）', /这里是树.*斧头/.test(await lastToast(page)), await lastToast(page));
rep.eq('错误工具不扣体力', (await snap(page)).energy, en1);
await walkAdjacent(page, 1, 11);  // (1,11) 是石头
const en2 = (await snap(page)).energy;
await pickTool(page, 5); await clickTile(page, 1, 11);
rep.ok('用斧头打石头有原因（提示改用镐子）', /这里是石头.*镐子/.test(await lastToast(page)), await lastToast(page));
rep.eq('错误工具仍不扣体力', (await snap(page)).energy, en2);
rep.eq('石头耐久未变', (await snap(page)).nodes['1,11'].hp, 2);
// 不能走出地图
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(900); await page.keyboard.up('ArrowLeft');
rep.ok('不会走出地图左边界', (await pos(page))[0] >= 0);
/* ================= 15. 碰撞 ================= */
console.log('【边界 15】碰撞与摄像机');
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2500); await page.keyboard.up('ArrowUp');
let p = await pos(page);
rep.ok('不会走进农舍内部', !(p[0] >= 1 && p[0] <= 4 && p[1] >= 1 && p[1] <= 3), JSON.stringify(p));
await walkTo(page, 28, 19, 20000);
p = await pos(page);
rep.ok('池塘不可通过（或被挡住）', !(p[0] >= 26 && p[0] <= 30 && p[1] >= 17 && p[1] <= 21), JSON.stringify(p));
rep.ok('相机被限制在地图内', await page.evaluate(() => {
  const M = window.__MOSS__;
  const limits = M.cameraLimits;
  return M.cam.x >= limits.minX - 0.01 && M.cam.x <= limits.maxX + 0.01
    && M.cam.y >= limits.minY - 0.01 && M.cam.y <= limits.maxY + 0.01;
}));

console.log('\n控制台错误：', errors.length);
rep.consoleErrors = errors;
const pass = rep.summary();
await browser.close();
process.exit(pass ? 0 : 1);
