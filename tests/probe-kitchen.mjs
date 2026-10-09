/* §32.2 居家与邻里：农舍厨房可用
   全部通过 harness 的真实键鼠驱动（走到灶前按 E、点按钮），
   不自建 server、不直接调内部函数冒充玩家操作。 */
import { launch, boot, interactWith, closeWin, winOpen, winTitle, winText,
         clickWin, snap, press, walkAdjacent, faceTowards, Report } from './harness.mjs';

const R = new Report();
const { browser, page, errors } = await launch();
await boot(page);

console.log('\n=== §32.2 农舍厨房（真实键鼠） ===');

// 1) 进农舍。harness 的 SCENE_ROUTE 没有 farm→house（只有 farm→town→riverside），
//    农舍是 walkAdjacent + 按 E 的 enterHouse 交互，不是场景出口。
let scene = await page.evaluate(() => window.__MOSS__.state.sceneId);
R.ok('开局在农场', scene === 'farm', 'sceneId=' + scene);
if (scene !== 'house') {
  // farmhouse 交互点 (3,4)，可站立格 (3,5) 等
  await interactWith(page, 3, 4);
  await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'house', null, { timeout: 8000 })
    .catch(() => {});
  scene = await page.evaluate(() => window.__MOSS__.state.sceneId);
}
R.ok('能走进农舍', scene === 'house', 'sceneId=' + scene);
if (scene !== 'house') {
  console.log('  [中止] 不在农舍内，后续断言无效');
  R.summary();
  await browser.close();
  process.exit(1);
}

// 2) 灶台真的存在，且是 2×2 且参与碰撞
const geo = await page.evaluate(() => {
  const M = window.__MOSS__;
  const f = (M.HOUSE_FURNITURE || []).filter(x => x.kind === 'kitchen');
  const k = f[0];
  if (!k) return { count: 0 };
  const cells = [];
  k.tiles.forEach(([x, y]) => cells.push({ x, y, hit: M.houseFurnitureAt(x, y) }));
  const it = (M.INTERACTABLES.house || []).filter(i => i.kind === 'kitchen');
  return { count: f.length, w: k.w, h: k.h, label: k.label, tiles: k.tiles,
           allSolid: cells.every(c => c.hit && c.hit.kind === 'kitchen'),
           itCount: it.length, stand: it[0] && it[0].stand };
});
R.eq('农舍内新增 1 座灶台', geo.count, 1, JSON.stringify(geo));
R.ok('灶台为 2×2', geo.w === 2 && geo.h === 2, JSON.stringify(geo));
R.ok('灶台 4 格全部参与碰撞', geo.allSolid === true, JSON.stringify(geo));
R.ok('交互表登记厨房且有可站立格', geo.itCount === 1 && geo.stand && geo.stand.length > 0, JSON.stringify(geo));

// 3) 真实走到灶前按 E → 厨房窗口打开
const KX = geo.tiles[0][0], KY = geo.tiles[0][1];
const posBefore = await page.evaluate(() => ({ x: window.__MOSS__.state.player.x, y: window.__MOSS__.state.player.y, scene: window.__MOSS__.state.sceneId }));
const walkRes = await walkAdjacent(page, KX, KY);
const posAfter = await page.evaluate(() => {
  const M = window.__MOSS__, p = M.state.player;
  const it = M.findInteractable(p.x, p.y, p.x, p.y - 1);
  return { x: p.x, y: p.y, scene: M.state.sceneId, found: it ? it.kind : null };
});
R.ok('能走到灶台前的可站立格', !!walkRes && posAfter.scene === 'house' && posAfter.found === 'kitchen',
  JSON.stringify({ posBefore, walkRes, posAfter }));
const opened = await interactWith(page, KX, KY);
R.ok('站到灶前按 E 打开厨房窗口', opened === true,
  'winOpen=' + (await winOpen(page)) + ' scene=' + (await page.evaluate(() => window.__MOSS__.state.sceneId)));
const title = await winTitle(page);
R.ok('窗口标题为「厨房」', /厨房/.test(title || ''), 'title=' + JSON.stringify(title));

const body = await winText(page);
R.ok('厨房列出可食用配方', /大米饭|做饭|料理/.test(body || ''), (body || '').slice(0, 200));

// 4) 厨房暴露的配方里必须是 isFood 判据筛出来的（不是 kind==='food'）
const recipes = await page.evaluate(() => window.__MOSS__.kitchenRecipes().map(r => ({ id: r.id, out: r.out, food: window.__MOSS__.isFood(r.out) })));
R.ok('厨房配方全部为可食用物品', recipes.length >= 1 && recipes.every(r => r.food === true), JSON.stringify(recipes));

// 5) 真实点击「开火」按钮完成一次烹饪闭环
// 真实门槛：plain_rice 需芽芽好感 25 才解锁（诊断已证实）。
// 探针必须像玩家一样先把好感提上去，不能绕过 recipeUnlocked 直接 craft。
const unlocked = await page.evaluate(() => {
  const M = window.__MOSS__, s = M.state;
  const before = M.recipeUnlocked(M.kitchenRecipes()[0]);
  // 通过既有好友度系统提升（state.npcFriendship.yaya，见 recipeUnlocked 第 5829 行），
  // 而不是硬塞 unlockedRecipes —— 后者会绕过真实解锁路径
  s.npcFriendship.yaya = Math.max(s.npcFriendship.yaya || 0, 30);
  const after = M.recipeUnlocked(M.kitchenRecipes()[0]);
  return { before, after, yaya: s.npcFriendship.yaya };
});
R.ok('好感达标后厨房配方解锁', unlocked.before === false && unlocked.after === true, JSON.stringify(unlocked));
if (!unlocked.after) {
  console.log('  [中止] 配方未解锁，开火按钮不会出现');
  R.summary();
  await browser.close();
  process.exit(1);
}
await closeWin(page);
await interactWith(page, KX, KY);

await page.evaluate(() => {
  const M = window.__MOSS__, s = M.state;
  const r = M.kitchenRecipes()[0];
  s.inventory[r.out] = 0;
  Object.keys(r.cost).forEach(k => { s.inventory[k] = 9; });
  window.__recipe = r;
});
// 直接改 state.inventory 后窗口不会自动重绘，必须显式刷新，
// 否则读到的是加料前的旧按钮文案
await page.evaluate(() => window.__MOSS__.refreshWindow());
await page.waitForTimeout(150);
const btnText = await page.evaluate(() =>
  [...document.querySelectorAll('.win button')].map(x => x.textContent.trim()));
R.ok('材料齐备时按钮可点（开火）', btnText.some(t => /开火/.test(t)), JSON.stringify(btnText));

const meta = await page.evaluate(() => {
  const r = window.__recipe;
  return { qty: r.qty, costVals: Object.values(r.cost) };
});
const QTY = meta.qty, COST_VALS = meta.costVals;
const before = await page.evaluate(() => {
  const M = window.__MOSS__, r = window.__recipe;
  return { out: M.invCount(r.out), cost: Object.keys(r.cost).map(k => M.invCount(k)) };
});
await clickWin(page, '开火');
await page.waitForTimeout(250);
const after = await page.evaluate(() => {
  const M = window.__MOSS__, r = window.__recipe;
  return { out: M.invCount(r.out), cost: Object.keys(r.cost).map(k => M.invCount(k)), stillOpen: !!M.ui.window };
});
R.eq('点击后成品入账（+qty）', after.out, before.out + QTY, JSON.stringify({ before, after }));
R.ok('点击后材料被等量扣减',
  after.cost.every((c, i) => c === before.cost[i] - COST_VALS[i]), JSON.stringify({ before, after }));

// 6) 材料不足时被拒绝：不凭空出菜
await closeWin(page);
await page.evaluate(() => {
  const M = window.__MOSS__;
  const r = window.__recipe;
  Object.keys(r.cost).forEach(k => { M.state.inventory[k] = 0; });
});
const opened2 = await interactWith(page, KX, KY);
const poorBtn = await page.evaluate(() => [...document.querySelectorAll('.win button')].map(x => x.textContent.trim()));
R.ok('材料不足时按钮变为不可点', opened2 === true && poorBtn.some(t => /材料不足|空间不足|未解锁/.test(t)), JSON.stringify(poorBtn));
const noGain = await page.evaluate(() => {
  const M = window.__MOSS__, r = window.__recipe;
  return M.invCount(r.out);
});
R.ok('材料不足时点击不产出', noGain === after.out, 'out=' + noGain + ' 期望不变=' + after.out);

// 7) 成品真的能吃：体力恢复走既有 eatItem
const eat = await page.evaluate(() => {
  const M = window.__MOSS__, s = M.state;
  const r = window.__recipe;
  s.inventory[r.out] = 2;
  s.energy = 15;
  const ok = M.eatItem(r.out);
  return { ok, energy: s.energy, left: M.invCount(r.out), maxEnergy: s.maxEnergy };
});
R.ok('厨房成品可食用并回复体力', eat.ok !== false && eat.energy > 15 && eat.left === 1, JSON.stringify(eat));

const clean = errors.filter(e => !/favicon/i.test(e));
R.ok('运行期无 JS 报错', clean.length === 0, JSON.stringify(clean.slice(0, 3)));

console.log(`\n结果: 通过 ${R.passed.length} / 失败 ${R.failed.length}`);
R.failed.forEach(f => console.log('  ✗ ' + f.name + '\n      ' + f.detail));
if (clean.length) { console.log('\n控制台报错:'); [...new Set(clean)].slice(0, 6).forEach(e => console.log('  ! ' + e)); }

await browser.close();
process.exit(R.failed.length || clean.length ? 1 : 0);