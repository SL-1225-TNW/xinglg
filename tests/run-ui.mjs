/* 界面 / 响应式 / 触屏 / 摄像机 / 焦点 / 后台暂停 */
import {
  launch, boot, snap, hud, pos, walkTo, walkAdjacent, clickTile, faceTowards,
  pickTool, press, winOpen, winTitle, winText, closeWin, clickWin, lastToast, clearToasts
} from './harness.mjs';
const { Report } = await import('./harness.mjs');
const rep = new Report();
const noScrollX = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/* ---------- 1. 桌面 1280×860 ---------- */
console.log('【UI 1】桌面布局');
let ctx = await launch({ viewport: { width: 1280, height: 860 } });
let page = ctx.page;
await boot(page, { fresh: true });
await page.waitForTimeout(400);
let rect = await page.evaluate(() => window.__MOSS__.canvasRect);
const deskScale = rect.w / 384;
// 缩放策略：0.5 步进（像素仍是规则网格），不再锁死在 1x/2x/3x
rep.ok('桌面画布按 0.5 步进放大', Number.isInteger(deskScale * 2), JSON.stringify(rect));
rep.ok('桌面画布不小于 2 倍', deskScale >= 2, JSON.stringify(rect));
rep.ok('桌面画布仍为最近邻（无平滑）', await page.evaluate(() =>
  ['pixelated', 'crisp-edges'].includes(getComputedStyle(document.getElementById('world')).imageRendering)));
rep.eq('画布宽高比正确', Math.round(rect.w / rect.h * 100), Math.round(384 / 256 * 100));
rep.eq('快捷栏 8 格', await page.locator('.hotbar .slot').count(), 8);
rep.ok('选中工具有边框与数字', await page.evaluate(() => {
  const s = document.querySelector('.slot.selected');
  return !!s && !!s.querySelector('.slot-num');
}));
rep.ok('工具图标是像素画布而非 Emoji', await page.evaluate(() => {
  const c = document.querySelectorAll('.slot canvas');
  if (!c.length) return false;
  const g = c[0].getContext('2d');
  const d = g.getImageData(0, 0, 16, 16).data;
  let painted = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
  return painted > 20;
}));
rep.ok('委托摘要不遮挡整屏', await page.evaluate(() => {
  const n = document.getElementById('questStrip');
  return n.getBoundingClientRect().height < 60 && n.getBoundingClientRect().width < window.innerWidth * 0.9;
}));
rep.ok('画布关闭平滑（最近邻）', await page.evaluate(() => {
  const v = getComputedStyle(document.getElementById('world')).imageRendering;
  return v === 'pixelated' || v === 'crisp-edges' || v === '-webkit-optimize-contrast';
}), await page.evaluate(() => getComputedStyle(document.getElementById('world')).imageRendering));
rep.ok('提示区 aria-live', await page.evaluate(() => document.getElementById('toast').getAttribute('aria-live') === 'polite'));
rep.ok('按钮有中文可读名称', await page.evaluate(() => {
  return [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null)
    .every(b => (b.getAttribute('aria-label') || b.textContent || '').trim().length > 0);
}));
rep.ok('桌面不显示触屏方向键', !(await page.evaluate(() =>
  getComputedStyle(document.getElementById('touch')).display === 'flex')));

/* 窗口不穿透点击 */
await press(page, 'b');
rep.ok('背包窗口打开', /背包/.test(await winTitle(page)));
const before = await snap(page);
await page.mouse.click(rect.left + 40, rect.top + 40);       // 点画布左上（应被弹窗遮住）
await page.waitForTimeout(150);
rep.eq('弹窗打开时点击不穿透到地图', (await snap(page)).plots, before.plots);
rep.ok('弹窗仍然打开', await winOpen(page));
// Esc 层级
await press(page, 'Escape');
rep.ok('Esc 关闭窗口', !(await winOpen(page)));
await press(page, 'Escape');
rep.ok('无窗口时 Esc 打开暂停菜单', /暂停/.test(await winTitle(page)));
await press(page, 'Escape');
rep.ok('再次 Esc 关闭', !(await winOpen(page)));

/* 种子 / 设备类型选择器 */
await pickTool(page, 2);
rep.ok('选择种子工具出现类型选择器', (await page.locator('#typePick').count()) === 1);
const tp1 = await page.evaluate(() => document.getElementById('typePick').innerText);
rep.ok('类型选择器列出 3 种种子', ['萝卜', '土豆', '草莓'].every(n => tp1.includes(n)), tp1);
await page.locator('#typePick button', { hasText: '土豆' }).click();
await page.waitForTimeout(150);
rep.eq('记住上次选择的种子', await page.evaluate(() => window.__MOSS__.state.selectedSeed), 'potato');
await pickTool(page, 8);
rep.ok('选择设备工具出现类型选择器', await page.locator('#typePick').count() === 1);
const tp2 = await page.evaluate(() => document.getElementById('typePick').innerText);
rep.ok('设备选择器列出 3 种设备', ['木箱', '洒水器', '果酱罐'].every(n => tp2.includes(n)), tp2);
await page.locator('#typePick button', { hasText: '洒水器' }).click();
await page.waitForTimeout(150);
rep.eq('记住上次选择的设备', await page.evaluate(() => window.__MOSS__.state.selectedDevice), 'dev_sprinkler');
await pickTool(page, 1);
rep.ok('换成其它工具后选择器收起', (await page.locator('#typePick').count()) === 0);

/* 提示不刷屏 + 保存状态 */
await clearToasts(page);
await page.evaluate(() => { const M = window.__MOSS__; M.state.energy = 0; });
await walkTo(page, 7, 9);
await pickTool(page, 1);
for (let i = 0; i < 4; i++) { await clickTile(page, 7, 8); await page.waitForTimeout(60); }
rep.ok('相同提示不重复刷屏', await page.evaluate(() => {
  const arr = window.__MOSS__.toasts.filter(t => /体力不足/.test(t.m));
  return arr.length <= 1;
}), '体力不足提示条数 ' + await page.evaluate(() => window.__MOSS__.toasts.filter(t => /体力不足/.test(t.m)).length));
rep.ok('提示区只显示一条', await page.evaluate(() => {
  const n = document.getElementById('toast');
  return n.textContent.split('\n').length === 1 && n.textContent.length < 60;
}), await page.evaluate(() => document.getElementById('toast').textContent));
await page.waitForTimeout(900);
rep.eq('普通状态变更后显示已保存', (await hud(page)).save, '已保存');
await page.waitForTimeout(500);
rep.ok('保存状态文字为中文', /保存/.test((await hud(page)).save));

/* 帮助窗口 */
await press(page, 'Escape');
await page.locator('.win button', { hasText: '帮助与操作' }).first().click();
await page.waitForTimeout(200);
rep.ok('暂停菜单可进入帮助', /帮助/.test(await winTitle(page)));
const helpTxt = await winText(page);
rep.ok('帮助列出完整键位', ['方向键', '空格', 'E', 'B', 'C', 'J', 'Esc'].every(k => helpTxt.includes(k)), helpTxt.slice(0, 80));
await closeWin(page);
rep.ok('Esc 从帮助返回', !(await winOpen(page)));
await closeWin(page);

/* 摄像机 */
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(2200); await page.keyboard.up('ArrowLeft');
rep.ok('摄像机不越出地图左边界', await page.evaluate(() => window.__MOSS__.cam.x >= 0), JSON.stringify(await page.evaluate(() => window.__MOSS__.cam)));
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(2600); await page.keyboard.up('ArrowUp');
rep.ok('摄像机不越出地图上边界', await page.evaluate(() => window.__MOSS__.cam.y >= 0));
rep.ok('摄像机跟随玩家', await page.evaluate(() => {
  const M = window.__MOSS__, s = M.state, c = M.cam, r = M.canvasRect;
  const px = s.player.x * 16 + 8, py = s.player.y * 16 + 12;
  const sx = (px - c.x) / 384 * r.w, sy = (py - c.y) / 256 * r.h;
  return sx > 0 && sx < r.w && sy > 0 && sy < r.h;
}));
/* 缩放后点击坐标仍正确 */
await walkTo(page, 7, 9);
await page.evaluate(() => { window.__MOSS__.state.energy = 100; });
await page.evaluate(() => { const c = document.getElementById('world'); c.style.width = '384px'; c.style.height = '256px'; });
await page.waitForTimeout(250);
await pickTool(page, 1);
await page.evaluate(() => { window.__MOSS__.state.plots = {}; });
await clickTile(page, 7, 8);
rep.ok('1 倍缩放下点击格位仍准确', !!(await snap(page)).plots['7,8'], JSON.stringify(Object.keys((await snap(page)).plots)));
await page.evaluate(() => { const c = document.getElementById('world'); c.style.width = '768px'; c.style.height = '512px'; });
await page.waitForTimeout(250);
await page.evaluate(() => { window.__MOSS__.state.plots = {}; });
await clickTile(page, 7, 8);
rep.ok('2 倍缩放下点击格位仍准确', !!(await snap(page)).plots['7,8'], JSON.stringify(Object.keys((await snap(page)).plots)));
await page.setViewportSize({ width: 1700, height: 1000 });
await page.waitForTimeout(400);
await page.evaluate(() => { window.__MOSS__.state.plots = {}; });
await clickTile(page, 7, 8);
rep.ok('自适应放大后点击格位仍准确', !!(await snap(page)).plots['7,8'], JSON.stringify(Object.keys((await snap(page)).plots)));
await page.setViewportSize({ width: 1280, height: 860 });
await page.waitForTimeout(400);

/* 后台暂停 */
const t1 = (await snap(page)).time;
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(2500);
const t2 = (await snap(page)).time;
rep.eq('标签页隐藏时时间暂停', Math.round(t2 - t1), 0);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(1200);
rep.ok('回到页面后时间继续（不补跑后台）', (await snap(page)).time - t2 < 60, '推进 ' + Math.round((await snap(page)).time - t2) + ' 分钟');
rep.ok('桌面布局无横向滚动', await noScrollX(page));
rep.eq('桌面控制台无错误', ctx.errors.length, 0, ctx.errors.join('|'));
await ctx.browser.close();

/* ---------- 2. 390px 小屏（触屏） ---------- */
console.log('【UI 2】390px 小屏 + 触屏');
ctx = await launch({ viewport: { width: 390, height: 844 }, touch: true });
page = ctx.page;
await boot(page, { fresh: true });
await page.waitForTimeout(500);
rect = await page.evaluate(() => window.__MOSS__.canvasRect);
rep.ok('小屏画布按宽度适配', rect.w <= 390, JSON.stringify(rect));
rep.ok('小屏画布仍为最近邻', await page.evaluate(() => {
  const v = getComputedStyle(document.getElementById('world')).imageRendering;
  return v === 'pixelated' || v === 'crisp-edges' || v === '-webkit-optimize-contrast';
}));
rep.ok('小屏无横向滚动', await noScrollX(page));
rep.ok('触屏方向键可见', await page.evaluate(() => getComputedStyle(document.getElementById('touch')).display === 'flex'));
const tb = await page.evaluate(() => { const r = document.getElementById('touchAct').getBoundingClientRect(); return [r.width, r.height]; });
rep.ok('触控目标 ≥44px', tb[0] >= 44 && tb[1] >= 44, JSON.stringify(tb));
rep.ok('快捷栏可点击且 8 格', await page.locator('.hotbar .slot').count() === 8);
// 触屏移动
const p0 = await pos(page);
const dpad = await page.locator('[data-dir="1,0"]').boundingBox();
await page.touchscreen.tap(dpad.x + dpad.width / 2, dpad.y + dpad.height / 2);
await page.waitForTimeout(50);
rep.ok('触屏轻点后没有卡住移动键', await page.evaluate(() => !window.__MOSS__.game.moving));
// 用 pointer 事件模拟按住移动
await page.locator('[data-dir="1,0"]').dispatchEvent('pointerdown');
await page.waitForTimeout(600);
await page.locator('[data-dir="1,0"]').dispatchEvent('pointerup');
await page.waitForTimeout(150);
rep.ok('触屏按住可移动', (await pos(page))[0] > p0[0], `${JSON.stringify(p0)} -> ${JSON.stringify(await pos(page))}`);
// 触屏点快捷栏换工具
await page.locator('.hotbar .slot').nth(2).click();
await page.waitForTimeout(150);
rep.eq('触屏点快捷栏可换工具', await page.evaluate(() => window.__MOSS__.state.selectedTool), 'water');
// 触屏使用工具
await walkTo(page, 7, 9);
await page.evaluate(() => { window.__MOSS__.state.selectedTool = 'hoe'; });
await page.locator('#touchUse').dispatchEvent('pointerdown');
await page.waitForTimeout(200);
rep.ok('触屏"使用工具"可用', !!((await snap(page)).plots['7,8'] || (await snap(page)).plots['7,9'] || (await snap(page)).plots['6,9']));
// 触屏背包 / 制作 / 任务
await page.locator('#touchBag').click(); await page.waitForTimeout(200);
rep.ok('触屏背包可打开', /背包/.test(await winTitle(page)));
rep.ok('窗口在 390px 内不溢出', await page.evaluate(() => {
  const w = document.querySelector('.win').getBoundingClientRect();
  return w.left >= -1 && w.right <= window.innerWidth + 1;
}));
await page.evaluate(() => { document.getElementById('windowLayer').scrollTop = 999; });
rep.ok('窗口内容不横向溢出', await noScrollX(page));
await closeWin(page);
await page.locator('#touchCraft').click(); await page.waitForTimeout(200);
rep.ok('触屏制作可打开', /制作/.test(await winTitle(page)));
await closeWin(page);
await page.locator('#touchQuest').click(); await page.waitForTimeout(200);
rep.ok('触屏任务可打开', /委托日志/.test(await winTitle(page)));
await closeWin(page);
// 触屏交互按钮
await page.evaluate(() => { const s = window.__MOSS__.state; s.structures = [{ id: 's1', device: 'chest', x: 7, y: 8, contents: { wood: 3 } }]; s.nextStructureId = 2; });
await walkTo(page, 7, 9);
await faceTowards(page, 7, 8);
await page.locator('#touchAct').dispatchEvent('pointerdown');
await page.waitForTimeout(250);
rep.ok('触屏"交互"可打开设备', /木箱/.test(await winTitle(page)));
await closeWin(page);
rep.eq('小屏无控制台错误', ctx.errors.length, 0, ctx.errors.join('|'));
await ctx.browser.close();

/* ---------- 3. 横屏手机 ---------- */
console.log('【UI 3】横屏手机 844×390');
ctx = await launch({ viewport: { width: 844, height: 390 }, touch: true });
page = ctx.page;
await boot(page, { fresh: true });
await page.waitForTimeout(400);
rep.ok('横屏无横向滚动', await noScrollX(page));
rect = await page.evaluate(() => window.__MOSS__.canvasRect);
rep.ok('横屏画布视野大于竖屏（高度 > 280）', rect.h > 280, JSON.stringify(rect));
rep.ok('横屏画布不超出视口高度', rect.h <= 390, JSON.stringify(rect));
rep.eq('横屏无控制台错误', ctx.errors.length, 0, ctx.errors.join('|'));
await ctx.browser.close();

/* ---------- 4. NPC 日程 ---------- */
console.log('【UI 4】NPC 日程随时间移动');
ctx = await launch();
page = ctx.page;
await boot(page, { fresh: true });
await page.waitForTimeout(300);
const sched = await page.evaluate(() => {
  const M = window.__MOSS__;
  return Object.keys(M.NPCS).map(id => ({ id, s: M.NPCS[id].schedule.map(x => [x.from, x.to, x.x, x.y]) }));
});
rep.ok('芽芽有 4 个日程段', sched.find(x => x.id === 'yaya').s.length === 4);
rep.ok('阿栎有 4 个日程段', sched.find(x => x.id === 'aqi').s.length === 4);
const moved = await page.evaluate(async () => {
  const M = window.__MOSS__;
  const before = JSON.parse(JSON.stringify({ yaya: M.npcRuntime.yaya, aqi: M.npcRuntime.aqi }));
  const seen = { yaya: new Set(), aqi: new Set() };
  for (let t = 0; t <= 1320; t += 10) {
    M.state.timeMinutes = t;
    await new Promise(r => setTimeout(r, 4));
    seen.yaya.add(M.npcRuntime.yaya.x + ',' + M.npcRuntime.yaya.y);
    seen.aqi.add(M.npcRuntime.aqi.x + ',' + M.npcRuntime.aqi.y);
  }
  return { yaya: seen.yaya.size, aqi: seen.aqi.size, before };
});
rep.ok('芽芽会随日程在多个位置之间移动', moved.yaya >= 3, '到达过的位置数 ' + moved.yaya);
rep.ok('阿栎会随日程在多个位置之间移动', moved.aqi >= 3, '到达过的位置数 ' + moved.aqi);
const pathOk = await page.evaluate(() => {
  const M = window.__MOSS__;
  const p = M.findPath('town', 12, 12, 8, 8);
  return !!p;
});
rep.ok('NPC 寻路可达店铺', pathOk);
const bridgeBlocked = await page.evaluate(() => {
  const M = window.__MOSS__;
  M.state.bridgeRepaired = false;
  const a = M.findPath('town', 12, 12, 31, 10);
  M.state.bridgeRepaired = true;
  const b = M.findPath('town', 12, 12, 31, 10);
  return [!a, !!b];
});
rep.eq('修桥前 NPC/寻路无法过河、修桥后可以', bridgeBlocked, [true, true]);
rep.eq('NPC 寻路无控制台错误', ctx.errors.length, 0, ctx.errors.join('|'));
await ctx.browser.close();

/* ---------- 5. 大屏桌面（16 寸常见视口） ---------- */
console.log('【UI 5】大屏 1512×982 与 2560×1600');
for (const vp of [{ width: 1512, height: 982 }, { width: 2560, height: 1600 }]) {
  const big = await launch({ viewport: vp });
  await boot(big.page, { fresh: true });
  await big.page.waitForTimeout(500);
  const r = await big.page.evaluate(() => window.__MOSS__.canvasRect);
  const scale = r.w / 384;
  const label = vp.width + '×' + vp.height;
  // 2000×1100 以上才启用沉浸式（UI 浮在画面上），以下保持带状布局
  const immersive = vp.width >= 2000 && vp.height >= 1100;
  const box = await big.page.evaluate(() => {
    const g = id => { const b = document.getElementById(id).getBoundingClientRect(); return { y: Math.round(b.y), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { assist: g('farmAssist'), dock: g('dock'), canvas: window.__MOSS__.canvasRect, immersive: document.documentElement.classList.contains('immersive') };
  });
  rep.ok(label + ' 沉浸式开关与门槛一致', box.immersive === immersive, 'immersive=' + box.immersive);
  rep.ok(label + ' 画布按 0.5 步进', Number.isInteger(scale * 2), JSON.stringify(r));
  rep.ok(label + ' 画布不超出视口', r.h <= vp.height && r.w <= vp.width, JSON.stringify(r));
  rep.ok(label + ' 无横向滚动', await noScrollX(big.page));
  if (immersive) {
    rep.ok(label + ' 沉浸式画布至少 6 倍上限附近（≥2200×1500）', r.w >= 2200 && r.h >= 1500, JSON.stringify(r));
    rep.ok(label + ' 引导条浮在画面上（不占布局、在画布高度范围内）',
      box.assist.y < box.canvas.top + box.canvas.h, JSON.stringify(box.assist) + ' canvasTop=' + box.canvas.top);
    rep.ok(label + ' 快捷栏浮在画面底部（已知取舍：会压住世界底部）',
      box.dock.y < box.canvas.top + box.canvas.h && box.dock.bottom <= vp.height + 1, JSON.stringify(box.dock));
  } else {
    rep.ok(label + ' 非沉浸式画布至少 2.5 倍', scale >= 2.5, JSON.stringify(r));
    rep.ok(label + ' 引导条在画布上方不重叠', box.assist.bottom <= box.canvas.top, JSON.stringify(box.assist) + ' canvasTop=' + box.canvas.top);
  }
  rep.ok(label + ' 快捷栏仍在屏内', await big.page.evaluate(() => {
    const b = document.getElementById('hotbar').getBoundingClientRect();
    return b.bottom <= innerHeight + 1 && b.width > 0;
  }));
  // 沉浸式下 UI 压在画面上，必须确认"屏幕坐标 → 格子"的映射没被顶栏/引导条截走
  const hit = await big.page.evaluate(() => {
    const M = window.__MOSS__;
    const out = [];
    for (const t of [[M.state.player.x, M.state.player.y], [M.state.player.x, M.state.player.y - 4], [M.state.player.x, M.state.player.y + 4]]) {
      const p = M.tileToScreen(t[0], t[1]);
      const el = document.elementFromPoint(p[0], p[1]);
      out.push({ t, onCanvas: !!(el && el.closest && el.closest('#viewport')) });
    }
    return out;
  });
  rep.ok(label + ' 格坐标映射命中画布（未被浮层截走）', hit.every(h => h.onCanvas), JSON.stringify(hit));
  // 真点一次：翻土后对应格必须有作物格数据，证明点击落在预期的格子上
  await big.page.keyboard.press('1');
  const tilled = [await big.page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y - 1]), null];
  const pt = await big.page.evaluate(t => window.__MOSS__.tileToScreen(t[0], t[1]), tilled[0]);
  await big.page.mouse.click(pt[0], pt[1]);
  await big.page.waitForTimeout(250);
  const hasPlot = await big.page.evaluate(t => !!window.__MOSS__.state.plots[t.join(',')], tilled[0]);
  rep.ok(label + ' 点击上方一格能翻松（映射与碰撞一致）', hasPlot, JSON.stringify(tilled[0]));
  await big.page.mouse.move(pt[0], pt[1]);
  await big.page.waitForTimeout(200);
  rep.ok(label + ' 悬停耕地能出信息浮层', await big.page.locator('#tileTip').isVisible());
  rep.eq(label + ' 无控制台错误', big.errors.length, 0, big.errors.join('|'));
  await big.browser.close();
}

rep.summary();
process.exit(rep.failed.length ? 1 : 0);
