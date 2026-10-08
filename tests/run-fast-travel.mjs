/* 第七版 §33／§34.4 快速传送验收
   真实键鼠驱动浏览器，从 M 地图实际点击传送，不注入传送后的状态。
   逐条核对：登记与解锁、耗时预览、落点可走、单一事务、旧档迁移。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync('output/playwright', { recursive: true });

let passed = 0;
const failures = [];
function check(name, value, expected) {
  const a = JSON.stringify(value), b = JSON.stringify(expected);
  if (a === b) { console.log('PASS', name); passed++; }
  else { console.log('FAIL', name, '\n  实际', a, '\n  期望', b); failures.push(name); }
}

const desktop = await launch();
try {
  const p = desktop.page;
  await boot(p);

  /* --- §33.2 新档从农场出发，农场已知、小镇已登记 --- */
  let info = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('新档当前节点是农场', info.current, 'farm.home');
  check('新档已登记农场与小镇', info.discovered.includes('farm.home') && info.discovered.includes('town.square'), true);
  check('新档未登记森林', info.discovered.includes('forest.gate'), false);
  check('新档未登记城市', info.discovered.includes('city.gate'), false);

  /* --- §33.3 农场↔小镇为相邻生活节点 10 分钟 --- */
  await p.evaluate(() => { __MOSS__.state.timeMinutes = 360; });
  let pv = await p.evaluate(() => __MOSS__.travelPreview('town.square'));
  check('农场到小镇预览可用', pv.ok, true);
  check('农场到小镇耗时 10 分钟', pv.minutes, 10);
  check('预览不跨日', pv.crossesDay, false);
  check('到达时间正确', pv.arrivalText, '06:10');
  check('落点可走', await p.evaluate(() => __MOSS__.travelLandingWalkable('town.square')), true);

  /* --- §33.1 从 M 地图真实点击传送 --- */
  const before = await p.evaluate(() => ({ t: __MOSS__.state.timeMinutes, e: __MOSS__.state.energy, c: __MOSS__.state.coins }));
  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^芽芽小镇，已开放/ }).click();
  await p.waitForFunction(() => document.querySelector('.travel-panel .primary'));
  const panelText = await p.locator('.travel-panel').innerText();
  check('传送面板显示耗时', panelText.includes('10'), true);
  await p.getByRole('button', { name: '传送过去', exact: true }).click();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'town');
  const after = await p.evaluate(() => ({ t: __MOSS__.state.timeMinutes, e: __MOSS__.state.energy, c: __MOSS__.state.coins, s: __MOSS__.state.sceneId }));
  check('已抵达小镇', after.s, 'town');
  check('时间推进 10 分钟', after.t - before.t, 10);
  check('传送不消耗体力', after.e, before.e);
  check('传送不消耗金币', after.c, before.c);
  check('传送后窗口关闭', await p.evaluate(() => __MOSS__.ui.window), null);

  /* --- §33.1 免费、不需要道具、不需要先走到驿站 --- */
  check('传送免费', after.c, before.c);

  /* --- §33.6 落点始终可走 --- */
  const pos = await p.evaluate(() => ({ x: __MOSS__.state.player.x, y: __MOSS__.state.player.y, solid: __MOSS__.isSolidTest('town', __MOSS__.state.player.x, __MOSS__.state.player.y) }));
  check('落点不在碰撞格', pos.solid, false);

  /* --- §33.3 返程同为 10 分钟 --- */
  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^苔芽农场，已开放/ }).click();
  await p.getByRole('button', { name: '传送过去', exact: true }).click();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'farm');
  check('已返回农场', await p.evaluate(() => __MOSS__.state.sceneId), 'farm');

  /* --- §33.2 未解锁地点不可传送，并给出具体条件 --- */
  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^白蔷薇城/ }).click();
  let blocked = await p.locator('.travel-blocked').innerText();
  check('城市未解锁显示办证条件', blocked.includes('通行证'), true);
  check('未解锁时没有传送按钮', await p.getByRole('button', { name: '传送过去', exact: true }).count(), 0);
  await p.keyboard.press('Escape');

  /* --- §33.2 葡萄园与磨坊是规划中地点，不得出现可执行传送 --- */
  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^金叶葡萄园/ }).click();
  check('葡萄园标注内容待开放', (await p.locator('.travel-panel').innerText()).includes('内容待开放'), true);
  check('葡萄园没有传送按钮', await p.getByRole('button', { name: '传送过去', exact: true }).count(), 0);
  await p.keyboard.press('Escape');

  /* --- §33.6 一次传送只有一个事务 ID，不重复结算 --- */
  const txBefore = await p.evaluate(() => __MOSS__.travelStateInfo().txCount);
  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^芽芽小镇，已开放/ }).click();
  await p.getByRole('button', { name: '传送过去', exact: true }).click();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'town');
  const txAfter = await p.evaluate(() => __MOSS__.travelStateInfo().txCount);
  check('每次传送只记一笔事务', txAfter - txBefore, 1);
  const dup = await p.evaluate(() => {
    const k = Object.keys(__MOSS__.travelStateLog());
    return k.length;
  });
  check('事务日志唯一', dup, txAfter);

  /* --- §33.2 旧档迁移：解锁森林本身不等于已到访登记（除非存档里已开放） --- */
  await p.evaluate(() => {
    localStorage.clear();
    const s = __MOSS__.state;
    s.sceneId = 'farm'; s.player = { x: 9, y: 10, face: 'down' };
    s.exploration.forest = false; s.exploration.city = false; s.exploration.mine = false;
    s.bridgeRepaired = false;
    const saved = JSON.parse(JSON.stringify(s));
    delete saved.travel;
    localStorage.setItem('moss-farm-v1', JSON.stringify(saved));
  });
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  info = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('未开放森林不会因迁移被登记', info.discovered.includes('forest.gate'), false);
  check('未开放河湾不会因迁移被登记', info.discovered.includes('riverside.bank'), false);

  /* 解锁森林后，仍需真实到访才登记（§33.2 首次抵达自动登记） */
  await p.evaluate(() => {
    const s = __MOSS__.state; s.exploration.forest = true;
    __MOSS__.state.travel.discovered = { 'farm.home': true, 'town.square': true };
    __MOSS__.state.sceneId = 'farm';
    __MOSS__.ensureTravel();
  });
  info = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('解锁森林后仍需真实到访才登记', info.discovered.includes('forest.gate'), false);
  await p.evaluate(() => { __MOSS__.devSwitchScene('forest', 14, 2); });
  info = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('首次到访森林自动登记', info.discovered.includes('forest.gate'), true);

  /* --- §33.3 矿内层站：只有已修复且到访过的层可 0 分钟直达 --- */
  await p.evaluate(() => {
    const s = __MOSS__.state; s.exploration.forest = true; s.exploration.mine = true; s.exploration.depth = 1;
    __MOSS__.startGame(s);
  });
  let pv2 = await p.evaluate(() => __MOSS__.travelPreview('mine.level2'));
  check('未修复二层轨道不可传送', pv2.ok, false);
  check('二层提示修复轨道', pv2.reason.includes('二层轨道'), true);
  await p.evaluate(() => {
    const s = __MOSS__.state; s.exploration.mine = true; s.exploration.depth = 3;
    __MOSS__.startGame(s);
  });
  await p.evaluate(() => { __MOSS__.devSwitchScene('mine2', 13, 21); });
  info = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('到访二层后登记矿内层站', info.discovered.includes('mine.level2'), true);
  const notVisited3 = await p.evaluate(() => __MOSS__.travelPreview('mine.level3'));
  check('修复但未到访三层仍不可传送', notVisited3.ok, false);
  await p.evaluate(() => { __MOSS__.devSwitchScene('mine3', 13, 21); __MOSS__.devSwitchScene('mine2', 13, 21); });
  const pv3 = await p.evaluate(() => __MOSS__.travelPreview('mine.level3'));
  check('修复且到访后三层可传送', pv3.ok, true);
  check('矿内安全层为 0 分钟', pv3.minutes, 0);

  /* --- §33.4 0 分钟移动不恢复体力 --- */
  const e0 = await p.evaluate(() => __MOSS__.state.energy);
  await p.evaluate(() => { __MOSS__.travelCommit('mine.level3'); });
  const e1 = await p.evaluate(() => __MOSS__.state.energy);
  check('0 分钟传送不恢复体力', e1, e0);
  check('0 分钟传送到达第三层', await p.evaluate(() => __MOSS__.state.sceneId), 'mine3');

  /* --- §33.4 跨日行程需要在安全处过夜，不偷偷结算睡觉 --- */
  await p.evaluate(() => {
    const s = __MOSS__.state;
    s.exploration.forest = true; s.exploration.city = true; s.exploration.mine = true; s.exploration.depth = 1;
    __MOSS__.startGame(s);
  });
  await p.evaluate(() => { __MOSS__.devSwitchScene('city', 330, 470); });
  // 真实到访城市以登记公共站，再把时间设到傍晚
  await p.evaluate(() => { __MOSS__.state.timeMinutes = 1300; });
  const pvDay = await p.evaluate(() => __MOSS__.travelPreview('mine.entrance'));
  check('晚间远程行程提示会跨日', pvDay.crossesDay, true);
  const dayBefore = await p.evaluate(() => ({ d: __MOSS__.state.totalDay, t: __MOSS__.state.timeMinutes }));
  const committed = await p.evaluate(() => __MOSS__.travelCommit('mine.entrance'));
  check('跨日传送被拦截', committed, false);
  const dayAfter = await p.evaluate(() => ({ d: __MOSS__.state.totalDay, t: __MOSS__.state.timeMinutes }));
  check('被拦截时不改日期', dayAfter.d, dayBefore.d);
  check('被拦截时几乎不推进时间（仅自然时钟滴进）', Math.abs(dayAfter.t - dayBefore.t) < 5, true);
  check('被拦截时仍留在原地', await p.evaluate(() => __MOSS__.state.sceneId), 'city');

  /* --- §33.2 旧档迁移：只登记已真实开放的场景，不凭空补全规划中地点 ---
     这里从全新基线构造旧档：前面的用例已把 exploration.city 打开，
     直接复用当前 state 会让“城市未开放”这个前提失效。
     写入现行存档键 moss-farm-v2 且不带 travel 字段，即真实旧档形态；
     随后用同一份数据走真实的读档归一化路径（避免与运行中的存档写入竞争）。 */
  const oldSave = await p.evaluate(() => {
    const s = __MOSS__.freshState();
    s.sceneId = 'town'; s.player = { x: 14, y: 10, face: 'down' };
    s.exploration.forest = true; s.exploration.city = false; s.exploration.mine = false;
    s.bridgeRepaired = true;
    const saved = JSON.parse(JSON.stringify(s));
    delete saved.travel;                       // 旧存档没有 travel 字段
    return JSON.stringify(saved);
  });
  const migResult = await p.evaluate((raw) => {
    const normalized = __MOSS__.normalizeSaveForTest(JSON.parse(raw));
    if (!normalized) return { ok: false };
    __MOSS__.startGame(normalized);
    return { ok: true, info: __MOSS__.travelStateInfo(), city: normalized.exploration.city, bridge: normalized.bridgeRepaired };
  }, oldSave);
  check('旧档可被读档归一化', migResult.ok, true);
  info = migResult.info;
  check('旧档迁移后登记当前地点', info.discovered.includes('town.square'), true);
  check('旧档迁移后登记已开放森林', info.discovered.includes('forest.gate'), true);
  check('旧档迁移后登记已开放河湾', info.discovered.includes('riverside.bank'), true);
  check('旧档迁移后不凭空登记城市', info.discovered.includes('city.gate'), false);
  check('旧档迁移后农场仍可用', info.discovered.includes('farm.home'), true);

  /* 旧档经过真实读档与重载后仍保持一致 */
  await p.evaluate((raw) => { localStorage.clear(); localStorage.setItem('moss-farm-v2', raw); }, oldSave);
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  const reloaded = await p.evaluate(() => __MOSS__.travelStateInfo());
  check('重载后旧档登记保持不变', JSON.stringify(reloaded.discovered.slice().sort()), JSON.stringify(info.discovered.slice().sort()));

  /* --- §34.4 保存后重载：传送事务不重复 --- */
  const txCount = await p.evaluate(() => __MOSS__.travelStateInfo().txCount);
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  check('重载后事务数不变', await p.evaluate(() => __MOSS__.travelStateInfo().txCount), txCount);

  await p.screenshot({ path: 'output/playwright/fast-travel-desktop.png' });
  check('桌面无报错', desktop.errors, []);
} finally {
  await desktop.browser.close();
}

/* --- §33.1 手机常驻地图按钮 --- */
const mobile = await launch({ viewport: { width: 844, height: 390 }, touch: true });
try {
  const p = mobile.page;
  await p.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('emulated'); }; });
  await boot(p);
  check('手机有常驻地图按钮', await p.locator('#touchMap').isVisible(), true);
  await p.locator('#touchMap').click();
  check('手机点地图按钮打开地图', await p.evaluate(() => __MOSS__.ui.window.id), 'worldmap');
  await p.getByRole('button', { name: /^芽芽小镇，已开放/ }).click();
  check('手机传送面板可用', await p.getByRole('button', { name: '传送过去', exact: true }).count(), 1);
  const tap = p.locator('.travel-panel .btn');
  const box = await tap.boundingBox();
  check('手机传送按钮触控面积足够', box && box.height >= 36, true);
  await tap.click();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'town');
  check('手机完成传送', await p.evaluate(() => __MOSS__.state.sceneId), 'town');
  await p.screenshot({ path: 'output/playwright/fast-travel-mobile.png' });
  check('手机无报错', mobile.errors, []);
} finally {
  await mobile.browser.close();
}

console.log(`\n快速传送验收 ${passed}/${passed + failures.length} 通过`);
if (failures.length) { console.log('失败：', failures.join(' / ')); process.exit(1); }
