/* 正常主线：只通过键盘和鼠标改变游戏；__MOSS__ 仅用于读取结果与路线。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, boot, snap, walkTo, walkAdjacent, faceTowards, clickTile,
  pickTool, closeWin, winTitle, sleepViaMenu, dismissSettlement } from './harness.mjs';
const { browser, page, errors } = await launch();
fs.mkdirSync('output/playwright', { recursive: true });
fs.writeFileSync('output/playwright/main-progress.log', '');
const log = (...args) => { const line = args.join(' '); console.log(line); fs.appendFileSync('output/playwright/main-progress.log', line + '\n'); };
let checks = 0;
function check(condition, text) { assert.ok(condition, text); checks++; log('PASS', text); }
function eq(actual, expected, text) { assert.deepEqual(actual, expected, text); checks++; log('PASS', text); }
const rad = Array.from({ length: 8 }, (_, i) => [7 + i, 8]);
const pot = [[7, 7], [8, 7]];
const str = [[15, 8], [16, 8]];
const nodes = s => Object.entries(s.nodes).map(([key, value]) => ({ ...value, x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }));
async function walk(x, y) { assert.ok(await walkTo(page, x, y, 25000), '走到 ' + x + ',' + y); }
async function adjacent(x, y) { assert.ok(await walkAdjacent(page, x, y), '邻近 ' + x + ',' + y); }
async function go(scene) {
  const now = (await snap(page)).scene;
  if (now === scene) return;
  if (now === 'farm' || now === 'riverside') {
    await walk(now === 'farm' ? 31 : 0, 10);
    await page.waitForTimeout(400);
    eq((await snap(page)).scene, 'town', '通过出口进入小镇');
    if (scene !== 'town') await go(scene);
  } else {
    await walk(scene === 'farm' ? 0 : 31, 10);
    await page.waitForTimeout(400);
    eq((await snap(page)).scene, scene, '通过出口进入 ' + scene);
  }
}
async function select(slot, label) {
  await pickTool(page, slot);
  await page.locator('#typePick button').filter({ hasText: label }).click();
}
async function plant(tiles, name) {
  await go('farm');
  for (const [x, y] of tiles) { await adjacent(x, y); await pickTool(page, 1); await clickTile(page, x, y); }
  await select(2, name);
  for (const [x, y] of tiles) { await adjacent(x, y); await clickTile(page, x, y); }
}
async function care() {
  await go('farm');
  const s = await snap(page);
  for (const [key, plot] of Object.entries(s.plots)) {
    if (!plot.crop || plot.mature || plot.water) continue;
    const [x, y] = key.split(',').map(Number);
    await adjacent(x, y); await pickTool(page, 3); await clickTile(page, x, y);
    check((await snap(page)).plots[key].water, '浇水 ' + key);
  }
}
async function rest() {
  await care();
  const day = (await snap(page)).day;
  assert.ok(await sleepViaMenu(page), '通过暂停菜单睡觉');
  await dismissSettlement(page);
  eq((await snap(page)).day, day + 1, '正常睡眠推进一天');
}
async function collect(wood, stone) {
  for (let n = 0; n < 80; n++) {
    await go('farm'); await care();
    const s = await snap(page);
    if ((s.inv.wood || 0) >= wood && (s.inv.stone || 0) >= stone) return;
    const type = (s.inv.stone || 0) < stone ? 'stone' : 'tree';
    const node = nodes(s).filter(v => v.type === type && v.active)
      .sort((a, b) => Math.abs(a.x - s.px) + Math.abs(a.y - s.py) - Math.abs(b.x - s.px) - Math.abs(b.y - s.py))[0];
    const cost = type === 'tree' ? 12 : 8;
    if (!node || s.energy < cost) { await rest(); continue; }
    await adjacent(node.x, node.y); await pickTool(page, type === 'tree' ? 5 : 6);
    for (let i = 0; i < (type === 'tree' ? 3 : 2); i++) await clickTile(page, node.x, node.y);
    const item = type === 'tree' ? 'wood' : 'stone';
    eq((await snap(page)).inv[item], (s.inv[item] || 0) + (type === 'tree' ? 5 : 3), '正常采集 ' + item);
  }
  throw Error('采集未能完成');
}
async function mature(tiles) {
  for (let n = 0; n < 20; n++) {
    const s = await snap(page);
    if (tiles.every(([x, y]) => s.plots[x + ',' + y]?.mature)) return;
    await rest();
  }
  throw Error('作物未成熟');
}
async function harvest(tiles) {
  await go('farm'); await pickTool(page, 4);
  for (const [x, y] of tiles) { await adjacent(x, y); await clickTile(page, x, y); }
}
async function interact(x, y) {
  await adjacent(x, y); await faceTowards(page, x, y); await page.keyboard.press('e');
  await page.waitForTimeout(200);
}
async function shop() { await go('town'); await interact(8, 7); check((await winTitle(page)).includes('种子铺'), '实际走到商店开门'); }
async function quest(id, name) {
  await go('town'); await interact(id === 3 ? 26 : 14, 9);
  await page.locator('.win .quest').filter({ hasText: name }).getByRole('button', { name: '交付材料', exact: true }).click();
  await page.waitForTimeout(400);
  eq((await snap(page)).quests[id], 'done', '交付委托 ' + id);
  await closeWin(page);
}
async function make(name) {
  await page.keyboard.press('c');
  await page.locator('.win .item').filter({ hasText: name }).getByRole('button', { name: '制作', exact: true }).click();
  await closeWin(page);
}
async function place(name, x, y) {
  await adjacent(x, y); await select(8, name); await clickTile(page, x, y);
  check((await snap(page)).structures.some(v => v.x === x && v.y === y), '正常放置 ' + name);
}
async function befriend() {
  await go('farm'); await pickTool(page, 4);
  for (const v of nodes(await snap(page)).filter(v => v.type === 'berry' && v.active)) {
    await adjacent(v.x, v.y); await clickTile(page, v.x, v.y);
  }
  await go('town');
  for (let n = 0; n < 5; n++) {
    const npc = await page.evaluate(() => ({ ...window.__MOSS__.npcRuntime.yaya }));
    await interact(npc.x, npc.y);
    if ((await winTitle(page)).includes('芽芽')) {
      const giftButton = page.getByRole('button', { name: '赠送礼物', exact: true });
      if (await giftButton.count()) await giftButton.click();
      const row = page.locator('.win .item').filter({ hasText: '野莓' });
      if (await row.count()) await row.getByRole('button', { name: '赠送 1 个', exact: true }).click();
      await closeWin(page); return;
    }
    await closeWin(page);
  }
  throw Error('未能与芽芽交谈');
}
async function fish() {
  await go('riverside'); await walk(10, 10); await faceTowards(page, 11, 10); await pickTool(page, 7);
  const before = await snap(page);
  await page.keyboard.press('Space');
  eq((await snap(page)).energy, before.energy - 4, '实际抛竿扣除体力');
  let held = false, caught = null;
  const until = Date.now() + 30000;
  try {
    while (Date.now() < until) {
      const f = await page.evaluate(() => {
        const v = window.__MOSS__.game.fishing;
        return v && { phase: v.phase, barY: v.barY, fishY: v.fishY, caught: v.caught };
      });
      if (!f) break;
      if (f.phase === 'bite') await page.keyboard.press('Space');
      else if (f.phase === 'catch') {
        const want = f.fishY < f.barY + 32 - 3;
        if (want !== held) { await page.keyboard[want ? 'down' : 'up']('Space'); held = want; }
      } else if (f.phase === 'result') { caught = f.caught; break; }
      await page.waitForTimeout(30);
    }
  } finally { if (held) await page.keyboard.up('Space'); }
  if (caught) eq((await snap(page)).inv[caught], (before.inv[caught] || 0) + 1, '按键追鱼成功，鱼进入背包');
  await page.waitForFunction(() => !window.__MOSS__.game.fishing, null, { timeout: 5000 });
  return caught;
}
try {
  await boot(page);
  eq((await snap(page)).coins, 50, '新游戏初始金币');
  await plant(rad, '萝卜'); await plant(pot, '土豆'); await care();
  eq((await snap(page)).inv.seed_radish || 0, 0, '八份萝卜种子实际播种');
  await collect(15, 9); await rest();
  await shop();
  await page.locator('.shop-row').filter({ hasText: '草莓种子' }).getByRole('button', { name: '买 1 份', exact: true }).click();
  await page.locator('.shop-row').filter({ hasText: '草莓种子' }).getByRole('button', { name: '买 1 份', exact: true }).click();
  eq((await snap(page)).inv.seed_strawberry, 2, '用初始金币实际买两份草莓种子');
  await closeWin(page); await go('farm'); await plant(str, '草莓'); await care();
  await mature(rad); await harvest(rad); eq((await snap(page)).inv.radish, 8, '收获八颗萝卜');
  await quest(1, '第一份收成'); await quest(2, '木匠的准备');
  await collect(25, 15); await mature(pot); await harvest(pot);
  eq((await snap(page)).inv.potato, 2, '收获两颗土豆');
  await quest(3, '把小桥修好'); check((await snap(page)).bridge, '正常材料修桥');
  check((await snap(page)).inv.tool_rod, '修桥获得钓竿');
  let caught;
  for (let n = 0; n < 8 && !caught; n++) {
    if ((await snap(page)).energy < 4) await rest();
    caught = await fish();
  }
  check(caught, '不注入鱼，真实钓鱼成功');
  await quest(4, '河边的新发现');
  await collect(40, 20);
  await make('木箱'); await place('木箱', 11, 8);
  await make('洒水器'); await place('洒水器', 10, 8);
  for (let n = 0; n < 8 && (await snap(page)).friend.yaya < 25; n++) {
    await befriend();
    if ((await snap(page)).friend.yaya < 25) await rest();
  }
  check((await snap(page)).friend.yaya >= 25, '聊天赠礼达到果酱罐配方的好感门槛');
  await collect(15, 10); await make('果酱罐'); await place('果酱罐', 13, 9);
  await mature(str); await harvest(str);
  await interact(13, 9); await page.getByRole('button', { name: '投入 1 颗草莓', exact: true }).click();
  await closeWin(page); await rest();
  await interact(13, 9); await page.getByRole('button', { name: '领取莓果酱', exact: true }).click();
  eq((await snap(page)).inv.jam, 1, '草莓实际加工为果酱');
  await closeWin(page); await shop();
  const gold = (await snap(page)).coins;
  await page.locator('.win .item').filter({ hasText: '莓果酱' }).getByRole('button', { name: '卖 1 个', exact: true }).click();
  eq((await snap(page)).coins, gold + 50, '果酱实际出售');
  await closeWin(page); await go('farm');
  await page.waitForTimeout(900);
  const before = await snap(page);
  await page.reload();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  const after = await snap(page);
  for (const key of ['day', 'coins', 'inv', 'quests', 'friend', 'bridge']) eq(after[key], before[key], '刷新恢复 ' + key);
  // 规范化会删除非箱子的空 contents 字段；比较设备真正使用的存档字段。
  const structures = list => list.map(v => ({ id: v.id, device: v.device, x: v.x, y: v.y,
    ...(v.device === 'chest' ? { contents: v.contents || {} } : {}),
    ...(v.device === 'jam_jar' ? { input: v.input || 0, startDay: v.startDay || 0, ready: !!v.ready } : {}) }));
  eq(structures(after.structures), structures(before.structures), '刷新恢复设备位置、箱子内容和加工状态');
  eq(errors, [], '主线控制台零错误');
  fs.mkdirSync('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/main-completed.png' });
  log('主线通过', checks, '项，完成于第', after.day, '天');
} catch (error) {
  fs.mkdirSync('output/playwright', { recursive: true });
  await page.screenshot({ path: 'output/playwright/main-failed.png' });
  console.error('失败现场', JSON.stringify(await snap(page)));
  throw error;
} finally {
  await browser.close();
}
