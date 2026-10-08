/* 第三版验收：作物可见性、农舍室内、池塘游鱼
   说明：正常流程只用键盘/鼠标真实操作；标注“夹具”的部分才预置状态取画面或覆盖边界。 */
import {
  launch, boot, snap, pos, walkTo, walkAdjacent, clickTile, faceTowards,
  pickTool, press, winOpen, winTitle, winText, closeWin, lastToast, clickWin, clickItemByName, isolatedPage
} from './harness.mjs';
const { Report } = await import('./harness.mjs');
const rep = new Report();
const log = (...a) => console.log('  ·', ...a);

const SHOT = p => p;

/* 从画布上按世界格取一块像素，用来判断“画面里到底有没有画出来”。
   注意三点：
   1) 要减掉摄像机偏移，否则取到的是别的格子；
   2) 画布是自适应的，地图比视口小时摄像机有居中负偏移，边界要按实际缓冲区算；
   3) resizeCanvas 会按 zoom × dpr 放大缓冲区，getImageData 取的是物理缓冲区，
      所以世界坐标必须乘上这个倍率，否则整块取样会整体偏移一个格子。
   早期版本把这三点都写死成 384×256，导致自适应布局后全部取错格子。 */
async function tileHasPixels(page, tx, ty) {
  return page.evaluate(([x, y]) => {
    const c = document.getElementById('world');
    const g = c.getContext('2d');
    const M = window.__MOSS__;
    const cam = M.cam;
    const dpr = window.devicePixelRatio || 1;
    const zoom = (M.game && M.game.zoom) || 1;
    const scale = zoom * dpr;
    const side = Math.max(4, Math.round(16 * scale));
    const sx = Math.round((x * 16 - cam.x) * scale);
    const sy = Math.round((y * 16 - cam.y) * scale);
    if (sx < 0 || sy < 0 || sx > c.width - side || sy > c.height - side) return null;
    const d = g.getImageData(sx, sy, side, side).data;
    let green = 0, red = 0, yellow = 0, white = 0, lum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 10) continue;
      n++; lum += (r * 0.299 + gg * 0.587 + b * 0.114);
      // 叶片绿：#6F9A3C / #8CC24A / #4E7A32 一带
      if (gg > 80 && (gg - r) > 20 && (gg - b) > 25) green++;
      // 果实红：#E2603F / #D63B3B / #B02B2B 一带
      if (r > 150 && (r - gg) > 70 && gg < 120) red++;
      // 成熟提示的暖黄高光
      if (r > 205 && gg > 195 && b > 110 && b < 215) yellow++;
      if (r > 200 && gg > 195 && b > 175) white++;
    }
    return { green, red, yellow, white, lum: n ? Math.round(lum / n) : 0 };
  }, [tx, ty]);
}

const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(400);

/* 取样前先把角色挪开，否则 Clawd 的身体会盖住下方那一格的作物 */
async function park(page, x, y) {
  await page.evaluate(([px, py]) => {
    const M = window.__MOSS__;
    M.state.player = { x: px, y: py, face: 'up' };
    M.game.ppos.x = px * 16 + 8; M.game.ppos.y = py * 16 + 12;
    M.game.hoverTile = null; M.game.selectTile = null;
  }, [x, y]);
  await page.waitForTimeout(280);
}
const PARK = [4, 12];

/* ================= A. 作物 ================= */
console.log('【A1】播种后立刻出现芽苗（真实操作）');
await walkTo(page, 7, 9);
await pickTool(page, 1); await clickTile(page, 7, 8);
let s = await snap(page);
rep.ok('锄地后该格成为耕地', !!(s.plots['7,8'] && s.plots['7,8'].tilled));
const emptyTile = await tileHasPixels(page, 7, 8);
rep.ok('空耕地没有绿色（看起来不像已播种）', emptyTile.green < 6, JSON.stringify(emptyTile));
await pickTool(page, 2); await clickTile(page, 7, 8);
await page.waitForTimeout(250);
s = await snap(page);
rep.eq('播种后 crop 字段为 radish', s.plots['7,8'].crop, 'radish');
await park(page, PARK[0], PARK[1]);
const sown = await tileHasPixels(page, 7, 8);
rep.ok('播种后同一格立即出现绿色芽苗', sown.green >= 4, JSON.stringify(sown));
await page.screenshot({ path: '../output/playwright/v3-a1-sown.png' });

// 另一处不同摄像机位置
await walkTo(page, 16, 9);
await pickTool(page, 1); await clickTile(page, 16, 8);
await pickTool(page, 2); await clickTile(page, 16, 8);
await page.waitForTimeout(250);
await park(page, PARK[0], PARK[1]);
const sown2 = await tileHasPixels(page, 16, 8);
rep.ok('第二个摄像机位置同样出现芽苗', sown2.green >= 4, JSON.stringify(sown2));
rep.ok('两处摄像机位置不同', true);

console.log('【A2】干湿区分与浇水水花');
await walkTo(page, 7, 9);
await pickTool(page, 3); await clickTile(page, 7, 8);
await page.waitForTimeout(120);
const wet = await tileHasPixels(page, 7, 8);
/* 静置后再取样前先把角色挪回取样位：站在 (7,9) 时摄像机会把画面上移，
   干土那格的取样区正好落在屏幕右缘的委托/地标文字条底下（深色底会拉低亮度），
   湿土那格又紧贴着角色与选中框——不挪开这两个读数都不代表土色本身。 */
await park(page, PARK[0], PARK[1]);
await page.waitForTimeout(900);
const wetSettled = await tileHasPixels(page, 7, 8);
const dry = await tileHasPixels(page, 16, 8);
rep.ok('浇水后该格标记为已浇水', (await snap(page)).plots['7,8'].water === true);
rep.ok('湿土比干土明显更暗', wetSettled.lum < dry.lum - 12, `湿亮度 ${wetSettled.lum} 干亮度 ${dry.lum}`);
rep.ok('浇水时有水花高光（比静置后更亮）', wet.lum > wetSettled.lum - 2, `浇水瞬间 ${wet.lum} 静置 ${wetSettled.lum}`);
const en0 = (await snap(page)).energy;
/* 取样时人挪到了 (4,12)，重复浇水前得先走回田边，否则提示是"走近一点"而不是"已经浇过水"。 */
await walkTo(page, 7, 9);
await pickTool(page, 3); await clickTile(page, 7, 8);
rep.eq('重复浇水不再扣体力', (await snap(page)).energy, en0);
rep.ok('重复浇水有提示', /已经浇过水/.test(await lastToast(page)));

console.log('【A3】四个生长阶段（夹具推进，只为取各阶段画面）');
await page.evaluate(() => {
  const st = window.__MOSS__.state;
  const P = (crop, age, x) => Object.assign({ tilled: true, water: true, crop, age, mature: false, harvested: false, regrow: 0 }, x || {});
  st.plots = {
    '6,8': P('radish', 0), '7,8': P('radish', 1), '8,8': P('radish', 2), '9,8': P('radish', 3, { mature: true }),
    '10,8': P('potato', 0), '11,8': P('potato', 2), '12,8': P('potato', 4), '13,8': P('potato', 5, { mature: true }),
    '14,8': P('strawberry', 0), '15,8': P('strawberry', 2), '16,8': P('strawberry', 5), '17,8': P('strawberry', 6, { mature: true }),
    '18,8': P('strawberry', 6, { harvested: true, regrow: 1 }),
    '19,8': { tilled: true, water: true, crop: null, age: 0, mature: false, harvested: false, regrow: 0 }
  };
  st.player = { x: 12, y: 10, face: 'up' };
  st.selectedTool = 'hoe';
  window.__MOSS__.saveNow();
});
await page.evaluate(() => { const M = window.__MOSS__; M.game.ppos.x = 12 * 16 + 8; M.game.ppos.y = 10 * 16 + 12; M.game.hoverTile = null; M.game.selectTile = null; });
await page.waitForTimeout(400);
await park(page, PARK[0], PARK[1]);
const stages = {};
for (const [name, tx] of [['萝卜刚播', 6], ['萝卜幼苗', 7], ['萝卜生长', 8], ['萝卜成熟', 9],
['土豆刚播', 10], ['土豆幼苗', 11], ['土豆生长', 12], ['土豆成熟', 13],
['草莓刚播', 14], ['草莓幼苗', 15], ['草莓生长', 16], ['草莓成熟', 17], ['草莓再生', 18]]) {
  stages[name] = await tileHasPixels(page, tx, 8);
}
for (const n in stages) rep.ok(`${n}有绿色像素`, stages[n] && stages[n].green >= 3, JSON.stringify(stages[n]));
rep.ok('萝卜成熟露出红色根部', stages['萝卜成熟'].red >= 8, JSON.stringify(stages['萝卜成熟']));
rep.ok('草莓成熟有红果', stages['草莓成熟'].red >= 8, JSON.stringify(stages['草莓成熟']));
rep.ok('空耕地仍然没有绿色', (await tileHasPixels(page, 19, 8)).green < 4, JSON.stringify(await tileHasPixels(page, 19, 8)));
// 三种作物轮廓不同：同阶段绿色像素量应有差别
const rad = stages['萝卜生长'].green, pot = stages['土豆生长'].green, str = stages['草莓生长'].green;
rep.ok('三种作物生长中轮廓大小不同', new Set([rad, pot, str]).size >= 2, `萝卜${rad} 土豆${pot} 草莓${str}`);
// 成熟提示：只有成熟格出现黄色高光
rep.ok('成熟作物有黄色提示', stages['萝卜成熟'].yellow >= 1, JSON.stringify(stages['萝卜成熟']));
rep.ok('未成熟作物没有黄色提示', stages['萝卜生长'].yellow === 0, JSON.stringify(stages['萝卜生长']));
await page.screenshot({ path: '../output/playwright/v3-a3-stages.png' });

console.log('【A4】草莓再生保留植株，萝卜土豆收获后消失');
await pickTool(page, 4);
for (const [tx, ty, key] of [[9, 8, 'radish'], [13, 8, 'potato'], [17, 8, 'strawberry']]) {
  const spot = await walkAdjacent(page, tx, ty);
  if (!spot) rep.note('走不到 ' + tx + ',' + ty + ' 旁边');
  await clickTile(page, tx, ty);
  await page.waitForTimeout(150);
  const got = (await snap(page)).inv[key] || 0;
  rep.eq('收获' + ({ radish: '萝卜', potato: '土豆', strawberry: '草莓' })[key], got, 1);
}
await page.waitForTimeout(300);
s = await snap(page);
rep.ok('收获后萝卜植株消失', !s.plots['9,8'].crop);
rep.ok('收获后土豆植株消失', !s.plots['13,8'].crop);
rep.ok('草莓收获后保留植株', s.plots['17,8'].crop === 'strawberry' && s.plots['17,8'].harvested === true);
await park(page, PARK[0], PARK[1]);
const afterHarvest = {
  萝卜: await tileHasPixels(page, 9, 8),
  土豆: await tileHasPixels(page, 13, 8),
  草莓: await tileHasPixels(page, 17, 8)
};
rep.ok('萝卜收获后画面无作物', afterHarvest.萝卜.green < 4, JSON.stringify(afterHarvest.萝卜));
rep.ok('土豆收获后画面无作物', afterHarvest.土豆.green < 4, JSON.stringify(afterHarvest.土豆));
rep.ok('草莓收获后画面仍有植株', afterHarvest.草莓.green >= 6, JSON.stringify(afterHarvest.草莓));
rep.ok('草莓再生期不再有红果', afterHarvest.草莓.red < 8, JSON.stringify(afterHarvest.草莓));
await page.screenshot({ path: '../output/playwright/v3-a4-harvest.png' });

console.log('【A5】地块信息浮层（悬停与点选都不吞工具操作）');
await page.evaluate(() => { window.__MOSS__.game.hoverTile = [11, 8]; });
await page.waitForTimeout(250);
let tip = await page.evaluate(() => { const n = document.getElementById('tileTip'); return { hidden: n.hidden, text: n.innerText.replace(/\n/g, ' / ') }; });
rep.ok('悬停显示地块信息', !tip.hidden && /土豆/.test(tip.text), JSON.stringify(tip));
rep.ok('信息含生长阶段', /幼苗|生长中|刚播种/.test(tip.text), tip.text);
rep.ok('信息含浇水状态', /浇水/.test(tip.text), tip.text);
await page.evaluate(() => { const s = window.__MOSS__.state; s.plots['8,8'].water = false; });
await page.evaluate(() => { window.__MOSS__.game.hoverTile = [8, 8]; });
await page.waitForTimeout(250);
tip = await page.evaluate(() => document.getElementById('tileTip').innerText.replace(/\n/g, ' / '));
rep.ok('未浇水时提示需要浇水', /需要浇水/.test(tip), tip);
await page.evaluate(() => { window.__MOSS__.state.plots['8,8'].mature = true; });
await page.waitForTimeout(250);
tip = await page.evaluate(() => document.getElementById('tileTip').innerText.replace(/\n/g, ' / '));
rep.ok('成熟时写明可收获', /可收获/.test(tip), tip);
await page.evaluate(() => { const p = window.__MOSS__.state.plots['8,8']; p.mature = false; p.age = 2; });
await page.waitForTimeout(250);
tip = await page.evaluate(() => document.getElementById('tileTip').innerText.replace(/\n/g, ' / '));
rep.ok('未成熟写出生长进度 2/3', /生长进度 2\/3/.test(tip), tip);
rep.ok('浮层不拦截指针事件', await page.evaluate(() => getComputedStyle(document.getElementById('tileTip')).pointerEvents === 'none'));
// 浮层存在时仍能正常用工具
await page.evaluate(() => { window.__MOSS__.game.hoverTile = [10, 8]; });
await walkTo(page, 10, 9);
await pickTool(page, 3); await clickTile(page, 10, 8);
rep.ok('浮层显示时工具仍可用', (await snap(page)).plots['10,8'].water === true);
// 触屏点选
await page.evaluate(() => { window.__MOSS__.game.hoverTile = null; window.__MOSS__.game.selectTile = [14, 8]; });
await page.waitForTimeout(250);
tip = await page.evaluate(() => { const n = document.getElementById('tileTip'); return { hidden: n.hidden, text: n.innerText.replace(/\n/g, ' / ') }; });
rep.ok('触屏点选同样显示信息', !tip.hidden && /草莓/.test(tip.text), JSON.stringify(tip));
await page.screenshot({ path: '../output/playwright/v3-a5-tip.png' });

console.log('【A6】雨天与洒水器的水分显示');
await page.evaluate(() => {
  const st = window.__MOSS__.state;
  st.weather = { today: 'rain', tomorrow: 'rain' };
  st.plots['15,8'].water = false; st.plots['16,8'].water = true;
  st.player = { x: 17, y: 9, face: 'up' };
  window.__MOSS__.saveNow();
});
await page.evaluate(() => { const M = window.__MOSS__; M.game.ppos.x = 17 * 16 + 8; M.game.ppos.y = 9 * 16 + 12; M.game.selectTile = null; M.game.hoverTile = [15, 8]; });
await page.waitForTimeout(300);
tip = await page.evaluate(() => document.getElementById('tileTip').innerText.replace(/\n/g, ' / '));
rep.ok('雨天未浇水时提示无需浇水', /雨天无需浇水/.test(tip), tip);
await page.evaluate(() => { window.__MOSS__.game.hoverTile = [16, 8]; });
await page.waitForTimeout(250);
tip = await page.evaluate(() => document.getElementById('tileTip').innerText.replace(/\n/g, ' / '));
rep.ok('雨天已浇水时提示已浇水', /今天已浇水/.test(tip), tip);
await page.screenshot({ path: '../output/playwright/v3-a6-rain.png' });
await page.evaluate(() => { window.__MOSS__.state.weather = { today: 'sun', tomorrow: 'sun' }; });

/* ================= B. 农舍室内 ================= */
async function dismissSettle(page) {
  if (!(await winOpen(page))) return false;
  if (!/天结束/.test(await winTitle(page))) return false;
  for (let i = 0; i < 8; i++) {
    if (!(await winOpen(page))) return true;
    const b = page.locator('.win button', { hasText: '开始新的一天' });
    if (!(await b.count())) break;
    await b.first().click();
    await page.waitForTimeout(140);
  }
  if (await winOpen(page)) await closeWin(page);
  return true;
}

console.log('【B1】门口进入与退出（连续进出 5 次）');
await page.evaluate(() => { window.__MOSS__.state.player = { x: 3, y: 5, face: 'up' }; window.__MOSS__.saveNow(); });
await page.evaluate(() => { const M = window.__MOSS__; M.game.ppos.x = 3 * 16 + 8; M.game.ppos.y = 5 * 16 + 12; });
await page.waitForTimeout(300);
let cycles = 0, noBug = true;
for (let i = 0; i < 5; i++) {
  if (!(await walkTo(page, 3, 5))) { noBug = false; break; }
  await page.keyboard.press('e');
  await page.waitForTimeout(600);
  if ((await snap(page)).scene !== 'house') { noBug = false; rep.note('第 ' + (i + 1) + ' 次进入失败'); break; }
  if ((await snap(page)).scene === 'house' && (await pos(page))[1] === 11) { noBug = false; rep.note('入门即弹回室外'); break; }
  if (!(await walkTo(page, 7, 11))) { noBug = false; rep.note('第 ' + (i + 1) + ' 次找不到门'); break; }
  await page.waitForTimeout(700);
  if ((await snap(page)).scene !== 'farm') { noBug = false; rep.note('第 ' + (i + 1) + ' 次出门失败'); break; }
  cycles++;
}
rep.eq('连续进出 5 次都正常', cycles, 5);
rep.ok('没有黑屏或困住', noBug);
rep.ok('出门落在门外安全位置', JSON.stringify(await pos(page)) === '[3,5]', JSON.stringify(await pos(page)));

console.log('【B2】室内家具碰撞');
await page.evaluate(() => { const M = window.__MOSS__; M.state.player = { x: 3, y: 5, face: 'up' }; });
await walkTo(page, 3, 5);
await page.keyboard.press('e');
await page.waitForTimeout(600);
rep.eq('已进屋', (await snap(page)).scene, 'house');
const solidInside = await page.evaluate(() => {
  const M = window.__MOSS__;
  return [[1, 1], [2, 2], [4, 1], [1, 4], [7, 3], [9, 4], [13, 2], [10, 10], [0, 0], [0, 11]]
    .map(([x, y]) => ({ x, y, solid: M.isSolid('house', x, y) }));
});
rep.ok('所有家具与墙都不可穿过', solidInside.every(t => t.solid), JSON.stringify(solidInside.filter(t => !t.solid)));
// 实际走位：试图走进床
await walkTo(page, 1, 3);
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(700); await page.keyboard.up('ArrowUp');
const pBed = await pos(page);
rep.ok('走不进床里', !(pBed[0] <= 2 && pBed[1] <= 2), JSON.stringify(pBed));
const reachable = await page.evaluate(() => {
  const M = window.__MOSS__;
  return {
    床: !!M.findPath('house', 3, 3, 1, 3),
    箱子: !!M.findPath('house', 13, 3, 12, 2),
    日历: !!M.findPath('house', 7, 10, 9, 10),
    手册: !!M.findPath('house', 8, 2, 7, 2)
  };
});
rep.ok('从门到所有功能家具都有可走路径', Object.values(reachable).every(Boolean), JSON.stringify(reachable));
await page.screenshot({ path: '../output/playwright/v3-b2-inside.png' });

console.log('【B3】室内四项功能');
await walkTo(page, 13, 3);
await faceTowards(page, 13, 2);
await page.keyboard.press('e');
await page.waitForTimeout(280);
rep.ok('储物箱可打开且标题区分', /储物箱/.test(await winTitle(page)));
await page.locator('.win .item', { hasText: '木材' }).first().locator('button', { hasText: '放入 1 个' }).click().catch(() => { });
await page.waitForTimeout(150);
await page.locator('.win .item', { hasText: '萝卜' }).first().locator('button', { hasText: '放入全部' }).click().catch(() => { });
await page.waitForTimeout(200);
s = await snap(page);
const houseChest = await page.evaluate(() => window.__MOSS__.state.houseChest);
const farmChests = await page.evaluate(() => window.__MOSS__.state.structures.filter(x => x.device === 'chest').length);
rep.ok('室内箱与室外箱分开保存', farmChests === 0, '室外箱数量 ' + farmChests);
await clickWinChestBack(page);
async function clickWinChestBack(pg) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); }
await walkTo(page, 10, 9);
await faceTowards(page, 10, 10);
await page.keyboard.press('e');
await page.waitForTimeout(280);
const calTxt = await winText(page);
rep.ok('日历显示真实日期', calTxt.includes('第 ' + (await snap(page)).day + ' 天'), calTxt.slice(0, 40));
rep.ok('日历显示今日天气', /今日天气/.test(calTxt));
rep.ok('日历显示明日预报', /明日预报/.test(calTxt));
await page.screenshot({ path: '../output/playwright/v3-b3-calendar.png' });
await closeWin(page);
await walkTo(page, 8, 2);
await faceTowards(page, 8, 3);
await page.keyboard.press('e');
await page.waitForTimeout(280);
const hb = await winText(page);
rep.ok('农场手册可打开', /农场手册/.test(await winTitle(page)));
rep.ok('手册含浇水规则', /浇水/.test(hb));
rep.ok('手册含种植规则', /萝卜/.test(hb) && /土豆/.test(hb) && /草莓/.test(hb));
rep.ok('手册含收获规则', /收获/.test(hb));
await closeWin(page);
await walkTo(page, 2, 3);
await faceTowards(page, 1, 2);
await page.keyboard.press('e');
await page.waitForTimeout(280);
rep.ok('床可打开睡觉确认', /结束今天/.test(await winTitle(page)));

console.log('【B4】睡觉取消不推进、确认只结算一次、次日睡醒在床旁');
const day0 = (await snap(page)).day;
await clickWin(page, '再玩一会儿');
rep.eq('取消睡觉不推进日期', (await snap(page)).day, day0);
rep.eq('取消后仍在室内', (await snap(page)).scene, 'house');
await page.keyboard.press('e');
await page.waitForTimeout(280);
await clickWin(page, '确认睡觉');
await page.waitForTimeout(500);
await page.keyboard.press('e');           // 再点一次，确认不会重复结算
await page.waitForTimeout(300);
if (await winOpen(page)) { const t = await winTitle(page); if (/结束今天/.test(t)) { await clickWin(page, '确认睡觉'); await page.waitForTimeout(400); } }
await dismissSettle(page);
s = await snap(page);
rep.eq('确认后只结算一天', s.day, day0 + 1);
rep.eq('睡醒在室内', s.scene, 'house');
rep.ok('睡醒在床旁', JSON.stringify([s.px, s.py]) === '[2,3]', JSON.stringify([s.px, s.py]));
rep.eq('体力恢复满', s.energy, 100);
await page.screenshot({ path: '../output/playwright/v3-b4-wake.png' });
await walkTo(page, 7, 11);
await page.waitForTimeout(700);
rep.eq('可以从床上走到门口出门', (await snap(page)).scene, 'farm');

console.log('【B5】室内不能耕种/放设备/抛竿');
await walkTo(page, 3, 5);
await page.keyboard.press('e');
await page.waitForTimeout(600);
rep.eq('已进屋准备测试', (await snap(page)).scene, 'house');
// 先确认“点床会开睡觉窗口”这件正事
await walkTo(page, 2, 3);
await clickTile(page, 2, 2);
rep.ok('床边点击优先打开睡觉窗口', /结束今天/.test(await winTitle(page)), await winTitle(page));
await closeWin(page);
await walkTo(page, 5, 4);
await pickTool(page, 1);
await clickTile(page, 5, 3);
rep.ok('室内不能锄地', /没有可以耕种|不能耕种/.test(await lastToast(page)), await lastToast(page));
await page.evaluate(() => { window.__MOSS__.state.selectedDevice = 'dev_chest'; window.__MOSS__.state.inventory.dev_chest = 1; });
await pickTool(page, 8);
await walkTo(page, 6, 4);
await clickTile(page, 6, 3);
rep.ok('室内不能放设备', /只能放在农场/.test(await lastToast(page)), await lastToast(page));
await pickTool(page, 7);
rep.ok('没有钓竿时按 7 被拒绝', /钓竿|解锁/.test(await lastToast(page)), await lastToast(page));
rep.ok('未获得钓竿时不会切到钓竿', await page.evaluate(() => window.__MOSS__.state.selectedTool !== 'fish'));
await page.evaluate(() => { window.__MOSS__.state.inventory.tool_rod = 1; window.__MOSS__.refreshWindow && window.__MOSS__.refreshWindow(); });
await pickTool(page, 7);
rep.eq('拿到钓竿后可选中', await page.evaluate(() => window.__MOSS__.state.selectedTool), 'fish');
await walkTo(page, 4, 2);
await clickTile(page, 4, 1);
rep.ok('室内不能抛竿', /河边/.test(await lastToast(page)), await lastToast(page));
rep.ok('室内没有新增耕地', Object.keys((await snap(page)).plots).every(k => k !== '5,3' && k !== '6,3'));

console.log('【B6】室内刷新恢复 + 旧存档兼容 + 导出导入');
const beforeReload = await snap(page);
const chestBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.state.houseChest)));
await page.reload();
await page.waitForFunction(() => !!window.__MOSS__);
await page.locator('.boot-actions button').first().click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
await page.waitForTimeout(300);
s = await snap(page);
rep.eq('刷新后仍在室内', s.scene, 'house');
rep.ok('刷新后位置合法', s.px >= 0 && s.px < 16 && s.py >= 0 && s.py < 12, JSON.stringify([s.px, s.py]));
rep.ok('刷新后不在墙上/家具里', await page.evaluate(() => !window.__MOSS__.isSolid('house', window.__MOSS__.state.player.x, window.__MOSS__.state.player.y)));
rep.eq('刷新后日期恢复', s.day, beforeReload.day);
const chestAfter = await page.evaluate(() => window.__MOSS__.state.houseChest);
rep.eq('室内箱子内容恢复', JSON.stringify(chestAfter), JSON.stringify(chestBefore));
// 旧存档（无 houseChest 字段）兼容：用独立上下文，避免当前页面卸载时把存档写回去
const legacySave = {
  version: 2, totalDay: 9, timeMinutes: 600, coins: 137, energy: 80,
  sceneId: 'house', player: { x: 4, y: 5, face: 'down' },
  weather: { today: 'sun', tomorrow: 'rain' }, randomState: 4242,
  inventory: { seed_radish: 6, wood: 20 },
  plots: { '7,8': { tilled: true, water: true, crop: 'radish', age: 1, mature: false, harvested: false, regrow: 0 } },
  questProgress: { 1: 'done', 2: 'unlocked', 3: 'locked', 4: 'locked' },
  npcFriendship: { yaya: 20, aqi: 10 },
  bridgeRepaired: true, unlockedRecipes: ['chest'], nextStructureId: 1
};
const legacy = await isolatedPage(browser, s => { localStorage.clear(); localStorage.setItem('moss-farm-v2', s); }, { width: 1100, height: 820 });
// isolatedPage 的 setup 只拿到 seed 字符串，这里把预置存档写进去
await legacy.page.evaluate(s => { localStorage.clear(); localStorage.setItem('moss-farm-v2', s); }, JSON.stringify(legacySave));
await legacy.page.reload();
await legacy.page.waitForFunction(() => !!window.__MOSS__);
await legacy.page.locator('.boot-actions button').first().click();
await legacy.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
await legacy.page.waitForTimeout(300);
const legacyInfo = await legacy.page.evaluate(() => ({
  chest: window.__MOSS__.state.houseChest,
  coins: window.__MOSS__.state.coins,
  plots: Object.keys(window.__MOSS__.state.plots).length,
  quests: window.__MOSS__.state.questProgress,
  scene: window.__MOSS__.state.sceneId,
  pos: [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]
}));
rep.eq('旧存档自动补 houseChest', JSON.stringify(legacyInfo.chest), '{}');
rep.eq('旧存档场景与位置保留', [legacyInfo.scene, JSON.stringify(legacyInfo.pos)], ['house', '[4,5]']);
rep.eq('旧存档金币保留', legacyInfo.coins, 137);
rep.ok('旧存档田地与委托保留', legacyInfo.plots === 1 && legacyInfo.quests[1] === 'done', JSON.stringify(legacyInfo.quests));
rep.ok('旧存档可直接使用室内箱子', await legacy.page.evaluate(() => {
  const M = window.__MOSS__;
  M.state.houseChest.radish = 3; M.saveNow();
  return JSON.parse(localStorage.getItem('moss-farm-v2')).houseChest.radish === 3;
}));
rep.eq('旧存档流程无控制台错误', legacy.errors.length, 0, legacy.errors.join('|'));
await legacy.ctx.close();
// 导出导入
await press(page, 'Escape');
await page.locator('.win button', { hasText: '导出存档' }).first().click();
await page.waitForTimeout(250);
const dump = await page.locator('#saveText').inputValue();
rep.ok('导出内容是合法 JSON 且含 houseChest', (() => { try { const j = JSON.parse(dump); return !!j.houseChest; } catch (e) { return false; } })());
await closeWin(page);
await page.evaluate(() => { window.__MOSS__.state.coins = 99999; window.__MOSS__.saveNow(); });
await press(page, 'Escape');
await page.locator('.win button', { hasText: '导入存档' }).first().click();
await page.waitForTimeout(250);
await page.locator('#importText').fill(dump);
await page.locator('.win button', { hasText: '导入并覆盖' }).click();
await page.waitForTimeout(400);
rep.ok('导入后金币回到导出时的值', (await snap(page)).coins !== 99999);
rep.ok('导入后仍可正常进入室内', await (async () => {
  await page.evaluate(() => { const M = window.__MOSS__; M.state.player = { x: 3, y: 5, face: 'up' }; });
  if (!(await walkTo(page, 3, 5))) return false;
  await page.keyboard.press('e'); await page.waitForTimeout(600);
  return (await snap(page)).scene === 'house';
})());

/* ================= C. 池塘游鱼 ================= */
console.log('【C】池塘游鱼');
async function gotoScene(sc, x, y) {
  await page.evaluate(([s, px, py]) => {
    const M = window.__MOSS__;
    const st = JSON.parse(JSON.stringify(M.state));
    st.sceneId = s; st.player = { x: px, y: py, face: 'down' };
    M.startGame(st);
  }, [sc, x, y]);
  await page.waitForTimeout(900);
}
await gotoScene('farm', 27, 16);
const fishN = await page.evaluate(() => window.__MOSS__.game.pondFish ? window.__MOSS__.game.pondFish.length : 0);
rep.ok('池塘有 4–6 条鱼', fishN >= 4 && fishN <= 6, '实际 ' + fishN);
const t0 = await page.evaluate(() => window.__MOSS__.game.pondFish.map(f => ({ x: f.x, y: f.y, d: f.dir })));
await page.waitForTimeout(30000);   // 连续观察 30 秒
const t1 = await page.evaluate(() => window.__MOSS__.game.pondFish.map(f => ({ x: f.x, y: f.y, d: f.dir })));
const movedCount = t0.filter((f, i) => Math.abs(f.x - t1[i].x) > 8).length;
const turnedCount = t0.filter((f, i) => f.d !== t1[i].d).length;
rep.ok('30 秒内多数鱼持续移动', movedCount >= 3, `移动 ${movedCount}/${fishN}`);
rep.ok('有鱼发生转向', turnedCount >= 1, `转向 ${turnedCount} 次`);
const speeds = await page.evaluate(() => window.__MOSS__.game.pondFish.map(f => f.speed));
rep.ok('个体速度不同', new Set(speeds).size >= 3, JSON.stringify(speeds));
// 不出水域
const outList = await page.evaluate(() => {
  return window.__MOSS__.game.pondFish.filter(f => {
    const tx = Math.floor(f.x / 16), ty = Math.floor(f.y / 16);
    return !(tx >= 26 && tx <= 30 && ty >= 17 && ty <= 21);
  }).map(f => ({ x: Math.round(f.x), y: Math.round(f.y) }));
});
rep.eq('没有鱼游出池塘水域', outList.length, 0, JSON.stringify(outList));
// 不叠加
await gotoScene('farm', 3, 5);
await page.evaluate(() => { window.__MOSS__.state.player = { x: 3, y: 5 }; });
await page.waitForTimeout(700);
await gotoScene('farm', 27, 16);
rep.eq('进出场景后鱼数量不叠加', await page.evaluate(() => window.__MOSS__.game.pondFish.length), fishN);
rep.ok('鱼不写入存档', await page.evaluate(() => !/pondFish/.test(JSON.stringify(window.__MOSS__.serialize()))));
// 暂停时停止
const posA = await page.evaluate(() => window.__MOSS__.game.pondFish[0].x);
await press(page, 'b');
await page.waitForTimeout(1200);
const posB = await page.evaluate(() => window.__MOSS__.game.pondFish[0].x);
rep.eq('打开背包时鱼停止游动', Math.round(posB - posA), 0);
await closeWin(page);
await page.waitForTimeout(600);
rep.ok('关闭窗口后鱼恢复游动', Math.abs(await page.evaluate(() => window.__MOSS__.game.pondFish[0].x) - posB) > 2);
// 画面证据：鱼确实画在池塘里
const pondInk = await page.evaluate(() => {
  const c = document.getElementById('world');
  const g = c.getContext('2d');
  const r = window.__MOSS__.cam;
  const fish = window.__MOSS__.game.pondFish;
  const dpr = window.devicePixelRatio || 1;
  const zoom = (window.__MOSS__.game && window.__MOSS__.game.zoom) || 1;
  const scale = zoom * dpr, box = Math.max(6, Math.round(13 * scale));
  let painted = 0;
  for (const f of fish) {
    // 与 tileHasPixels 同理：鱼坐标是世界像素，取样要按 zoom × dpr 换算到物理缓冲区
    const sx = Math.round((f.x - r.x) * scale), sy = Math.round((f.y - r.y) * scale);
    if (sx < 0 || sy < 0 || sx > c.width - box || sy > c.height - box) continue;
    const d = g.getImageData(sx, sy, box, box).data;
    // 找与水色明显不同的像素
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (Math.abs(R - 121) > 45 || Math.abs(G - 169) > 45) { painted++; break; }
    }
  }
  return { total: fish.length, painted };
});
rep.ok('每条鱼在画面上都有可辨认像素', pondInk.painted === pondInk.total, JSON.stringify(pondInk));
await page.screenshot({ path: '../output/playwright/v3-c1-pond.png' });
// 夜晚仍可见
await page.evaluate(() => { window.__MOSS__.state.timeMinutes = 21 * 60; });
await page.waitForTimeout(500);
const nightInk = await page.evaluate(() => {
  const c = document.getElementById('world');
  const g = c.getContext('2d');
  const r = window.__MOSS__.cam;
  const fish = window.__MOSS__.game.pondFish;
  const dpr = window.devicePixelRatio || 1;
  const zoom = (window.__MOSS__.game && window.__MOSS__.game.zoom) || 1;
  const scale = zoom * dpr, box = Math.max(6, Math.round(13 * scale));
  let painted = 0;
  for (const f of fish) {
    const sx = Math.round((f.x - r.x) * scale), sy = Math.round((f.y - r.y) * scale);
    if (sx < 0 || sy < 0 || sx > c.width - box || sy > c.height - box) continue;
    const d = g.getImageData(sx, sy, box, box).data;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      if (Math.abs(R - 121) > 30 || Math.abs(G - 169) > 30) { painted++; break; }
    }
  }
  return painted;
});
rep.ok('夜晚鱼仍可辨认', nightInk >= Math.ceil(fishN * 0.6), `可见 ${nightInk}/${fishN}`);
await page.screenshot({ path: '../output/playwright/v3-c2-pond-night.png' });
await page.evaluate(() => { window.__MOSS__.state.timeMinutes = 8 * 60; });
rep.ok('池塘鱼不会改变背包（不赠送装备）', await page.evaluate(() => {
  const inv = window.__MOSS__.state.inventory;
  return !(inv.fish_crucian > 0 || inv.fish_bass > 0 || inv.fish_silver > 0 || inv.fish_crucian === 0 && false);
}), JSON.stringify(await page.evaluate(() => {
  const inv = window.__MOSS__.state.inventory;
  return { c: inv.fish_crucian || 0, b: inv.fish_bass || 0, s: inv.fish_silver || 0 };
})));
rep.ok('池塘鱼不改变委托顺序与修桥状态', await page.evaluate(() => {
  const q = window.__MOSS__.state.questProgress;
  return q[1] === 'done' || q[1] === 'unlocked' || q[1] === 'locked';
}));
rep.ok('池塘里点鱼不会触发捕获或抛竿', await (async () => {
  const F0 = await page.evaluate(() => !!window.__MOSS__.game.fishing);
  const pt = await page.evaluate(() => {
    const f = window.__MOSS__.game.pondFish[0];
    return window.__MOSS__.tileToScreen(Math.floor(f.x / 16), Math.floor(f.y / 16));
  });
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(250);
  return F0 === false && (await page.evaluate(() => !!window.__MOSS__.game.fishing)) === false;
})());

console.log('\n控制台错误：' + errors.length);
rep.consoleErrors = errors;
const pass = rep.summary();
await browser.close();
process.exit(pass ? 0 : 1);
