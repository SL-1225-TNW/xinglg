/* 苔芽农场 · 自动化试玩台（真实键盘 / 鼠标驱动，非直接调用内部函数） */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GAME_URL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

export const T = { TILE: 16 };

/* ---------- 结果收集 ---------- */
export class Report {
  constructor() { this.passed = []; this.failed = []; this.consoleErrors = []; this.order = []; }
  ok(name, cond, detail) {
    if (cond) { this.passed.push({ name, detail }); }
    else { this.failed.push({ name, detail }); this.order.push(name); }
    return !!cond;
  }
  eq(name, actual, expected, extra) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    return this.ok(name, a === b, `实际 ${a} / 期望 ${b}${extra ? ' · ' + extra : ''}`);
  }
  note(msg) { this.order.push('— ' + msg); console.log('  ℹ ' + msg); }
  summary() {
    console.log('\n================ 试玩报告 ================');
    console.log(`通过 ${this.passed.length} 项，失败 ${this.failed.length} 项`);
    if (this.failed.length) {
      console.log('\n--- 失败明细 ---');
      this.failed.forEach(f => console.log(`  ✗ ${f.name}\n      ${f.detail}`));
    }
    if (this.consoleErrors.length) {
      console.log(`\n--- 控制台报错 ${this.consoleErrors.length} 条 ---`);
      [...new Set(this.consoleErrors)].slice(0, 20).forEach(e => console.log('  ! ' + e));
    }
    console.log('===========================================\n');
    return this.failed.length === 0 && this.consoleErrors.length === 0;
  }
}

/* ---------- 页面夹具 ---------- */
export async function launch(opts = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 860 },
    deviceScaleFactor: 1,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  return { browser, ctx, page, errors };
}

/* ---------- 基础动作 ---------- */
export async function boot(page, { fresh = true, seed = null } = {}) {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__MOSS__, null, { timeout: 15000 });
  if (seed) {
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('moss-farm-v1', s); }, seed);
    await page.reload();
    await page.waitForFunction(() => !!window.__MOSS__);
  } else if (fresh) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.__MOSS__);
  }
  const label = fresh || seed ? '开始新的游戏' : '继续游戏';
  const btn = page.locator('.boot-actions button', { hasText: '开始新的游戏' });
  if (seed) {
    await page.locator('.boot-actions button').first().click();
  } else if (fresh) {
    await btn.click();
  }
  await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  return label;
}

export const snap = page => page.evaluate(() => JSON.parse(JSON.stringify({
  day: window.__MOSS__.state.totalDay,
  time: window.__MOSS__.state.timeMinutes,
  coins: window.__MOSS__.state.coins,
  energy: window.__MOSS__.state.energy,
  scene: window.__MOSS__.state.sceneId,
  px: window.__MOSS__.state.player.x, py: window.__MOSS__.state.player.y,
  inv: window.__MOSS__.state.inventory,
  plots: window.__MOSS__.state.plots,
  nodes: window.__MOSS__.state.resourceNodes,
  structures: window.__MOSS__.state.structures,
  shipping: window.__MOSS__.state.shipping,
  quests: window.__MOSS__.state.questProgress,
  friend: window.__MOSS__.state.npcFriendship,
  bridge: window.__MOSS__.state.bridgeRepaired,
  recipes: window.__MOSS__.state.unlockedRecipes,
  weather: window.__MOSS__.state.weather,
  slots: window.__MOSS__.countSlots()
})));

export const hud = page => page.evaluate(() => ({
  date: document.querySelector('#hudDate .hud-value').textContent,
  time: document.querySelector('#hudTime .hud-value').textContent,
  weather: document.querySelector('#hudWeather .hud-value').textContent,
  coins: document.querySelector('#hudCoins .hud-value').textContent,
  energy: document.querySelector('#hudEnergy .hud-value').textContent,
  quest: document.querySelector('#questStripText').textContent,
  save: document.querySelector('#saveState').textContent
}));

export const pos = page => page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
export const lastToast = page => page.evaluate(() => { const t = window.__MOSS__.toasts; return t.length ? t[t.length - 1].m : ''; });
export const toastCount = page => page.evaluate(() => window.__MOSS__.toasts.length);
export const clearToasts = page => page.evaluate(() => { window.__MOSS__.toasts.length = 0; });

var WALK_DEBUG = !!process.env.WALK_DEBUG;
/* 用键盘真实走路到目标格：每步重新寻路，换场景即视为到达 */
export async function walkTo(page, tx, ty, timeout = 15000) {
  const startScene = (await snap(page)).scene;
  const t0 = Date.now();
  let last = null, stall = 0;
  while (Date.now() - t0 < timeout) {
    const st = await snap(page);
    if (st.scene !== startScene) return true;      // 触发场景切换，交给调用方等待淡入
    if (await winOpen(page)) { await closeWin(page); continue; }   // 弹窗挡住操作先关掉
    const cur = [st.px, st.py];
    if (cur[0] === tx && cur[1] === ty) return true;
    if (last && cur[0] === last[0] && cur[1] === last[1]) {
      if (++stall > 3) { if (WALK_DEBUG) console.log('  !! walkTo ' + tx + ',' + ty + ' 卡在 ' + cur + ' 场景 ' + st.scene); return false; }
    } else stall = 0;
    last = cur;
    const path = await page.evaluate(([sx, sy, x, y, sc]) => window.__MOSS__.findPath(sc, sx, sy, x, y),
      [cur[0], cur[1], tx, ty, st.scene]);
    if (!path || !path.length) { if (WALK_DEBUG) console.log('  !! walkTo ' + tx + ',' + ty + ' 无路径，起点 ' + cur + ' 场景 ' + st.scene); return false; }
    const nxt = path[0];
    const key = nxt[0] > cur[0] ? 'ArrowRight' : nxt[0] < cur[0] ? 'ArrowLeft'
      : nxt[1] > cur[1] ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    // 走到格子中心再松键，避免只刚跨过边界就转向，被碰撞或摄像机拖住。
    try {
      await page.waitForFunction(([x, y, dir, scene]) => {
        const M = window.__MOSS__;
        if (M.state.sceneId !== scene) return true;
        const p = M.game.ppos;
        return dir === 'ArrowRight' ? p.x >= x * 16 + 8
          : dir === 'ArrowLeft' ? p.x <= x * 16 + 8
          : dir === 'ArrowDown' ? p.y >= y * 16 + 12
          : p.y <= y * 16 + 12;
      }, [nxt[0], nxt[1], key, startScene], { timeout: 2500 });
    } catch (e) { /* 走到边界就够下一轮判断，不中断整段路 */ }
    await page.keyboard.up(key);
  }
  const st = await snap(page);
  return (st.px === tx && st.py === ty) || st.scene !== startScene;
}

/* 走到目标格旁边（用于点击该格） */
export async function walkAdjacent(page, tx, ty) {
  const cands = [[tx, ty - 1], [tx, ty + 1], [tx - 1, ty], [tx + 1, ty], [tx, ty]];
  for (const [x, y] of cands) {
    const okSolid = await page.evaluate(([a, b]) => !window.__MOSS__.isSolid(window.__MOSS__.state.sceneId, a, b), [x, y]);
    if (!okSolid) continue;
    if (await walkTo(page, x, y, 9000)) return [x, y];
  }
  return null;
}

export async function faceTowards(page, tx, ty) {
  const p = await pos(page);
  let key = null;
  if (p[1] === ty - 1 && p[0] === tx) key = 'ArrowDown';
  else if (p[1] === ty + 1 && p[0] === tx) key = 'ArrowUp';
  else if (p[0] === tx - 1) key = 'ArrowRight';
  else if (p[0] === tx + 1) key = 'ArrowLeft';
  if (key) await page.keyboard.press(key);
  await page.waitForTimeout(60);
}

export async function clickTile(page, tx, ty) {
  const p = await page.evaluate(([x, y]) => window.__MOSS__.tileToScreen(x, y), [tx, ty]);
  await page.mouse.click(p[0], p[1]);
  await page.waitForTimeout(120);
}
export async function hoverTile(page, tx, ty) {
  const p = await page.evaluate(([x, y]) => window.__MOSS__.tileToScreen(x, y), [tx, ty]);
  await page.mouse.move(p[0], p[1]);
  await page.waitForTimeout(30);
}
export async function useSpaceOn(page, tx, ty) {
  await faceTowards(page, tx, ty);
  await page.keyboard.press('Space');
  await page.waitForTimeout(90);
}
export async function pickTool(page, slot) {
  await page.keyboard.press(String(slot));
  await page.waitForTimeout(50);
}
/* 走到目标旁边、正对它、按 E 交互 */
export async function interactWith(page, tx, ty) {
  const spot = await walkAdjacent(page, tx, ty);
  if (!spot) return false;
  await faceTowards(page, tx, ty);
  await page.keyboard.press('e');
  await page.waitForTimeout(250);
  return winOpen(page);
}
export async function press(page, key, wait = 90) {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
}

/* 关闭窗口（Esc）；若窗口本就开着，避免误开暂停菜单 */
export async function closeWin(page) {
  if (!(await winOpen(page))) return;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(160);
  if (await winOpen(page)) { await page.keyboard.press('Escape'); await page.waitForTimeout(160); }
}
export const winOpen = page => page.evaluate(() => !document.getElementById('windowLayer').hidden);
export const winTitle = page => page.evaluate(() => { const n = document.querySelector('.win-title'); return n ? n.textContent : ''; });
export const winText = page => page.evaluate(() => { const n = document.querySelector('.win-body'); return n ? n.innerText : ''; });

/* 在窗口中点击含指定文字的按钮 */
export async function clickWin(page, text, nth = 0) {
  const b = page.locator(`.win button`, { hasText: text }).nth(nth);
  await b.waitFor({ state: 'visible', timeout: 4000 });
  await b.click();
  await page.waitForTimeout(120);
}
export async function clickItemByName(page, name, nth = 0) {
  const b = page.locator('.win .item', { hasText: name }).nth(nth);
  await b.waitFor({ state: 'visible', timeout: 4000 });
  await b.click();
  await page.waitForTimeout(120);
}

/* 睡觉：真实走回农舍门口 → 按 E 进屋 → 走到床边 → 按 E → 确认 */
export async function sleepAtFarmhouse(page) {
  if (await winOpen(page)) { await closeWin(page); }
  if ((await snap(page)).scene !== 'farm') {
    await walkTo(page, 0, 10);
    await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'farm', null, { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(300);
  }
  if ((await snap(page)).scene !== 'farm') return false;
  const ok = await walkTo(page, 3, 5);
  if (!ok) return false;
  await page.keyboard.press('e');
  await page.waitForTimeout(450);
  if ((await snap(page)).scene !== 'house') return false;
  await walkTo(page, 2, 3);
  await page.keyboard.press('e');
  await page.waitForTimeout(280);
  if (!(await winOpen(page))) return false;
  if (!/结束今天/.test(await winTitle(page))) { await closeWin(page); return false; }
  await page.locator('.win button', { hasText: '确认睡觉' }).first().click();
  await page.waitForTimeout(500);
  return true;
}
/* 睡觉：暂停菜单里的「睡觉」 */
export async function sleepViaMenu(page) {
  if (await winOpen(page)) { await closeWin(page); }
  await press(page, 'Escape');
  await page.waitForTimeout(200);
  if (!/暂停/.test(await winTitle(page))) { await press(page, 'Escape'); await page.waitForTimeout(200); }
  const b = page.locator('.win button', { hasText: '结束今天' });
  if (!(await b.count())) return false;
  await b.first().click();
  await page.waitForTimeout(300);
  if (!/结束今天/.test(await winTitle(page))) return false;
  await page.locator('.win button', { hasText: '确认睡觉' }).first().click();
  await page.waitForTimeout(500);
  return true;
}
export async function dismissSettlement(page) {
  if (await winOpen(page)) {
    const t = await winTitle(page);
    if (/天结束/.test(t)) { await clickWin(page, '开始新的一天'); return true; }
  }
  return false;
}

/* 独立上下文：避免旧页面卸载时的自动保存覆盖我们预置的存档 */
export async function isolatedPage(browser, setup, viewport) {
  const c = await browser.newContext({ viewport: viewport || { width: 1100, height: 820 } });
  const p = await c.newPage();
  p.setDefaultTimeout(9000);
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(GAME_URL);
  await p.evaluate(setup);
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  return { ctx: c, page: p, errors };
}

/* 让时间走到接近 22:00（真实推进，不改存档） */
export async function fastForward(page) {
  await page.evaluate(() => { window.__MOSS__.state.timeMinutes = 22 * 60 - 0.5; });
  await page.waitForFunction(() => window.__MOSS__.state.totalDay > 0 && !!window.__MOSS__.ui.window, null, { timeout: 6000 }).catch(() => {});
}
