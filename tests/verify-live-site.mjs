/* 线上站点验收：真的用浏览器打开 https://sl-1225-tnw.github.io/xinglg/ 开新档试玩，
   并把线上文件与本地文件逐字节比对，确认部署的就是当前代码。
   用法：node tests/verify-live-site.mjs */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://sl-1225-tnw.github.io/xinglg/';
let failed = 0;
const ok = (n, c, d) => { if (c) console.log('PASS ' + n + (d ? ' · ' + d : '')); else { failed++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(25000);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

/* 1. 页面能打开 */
const resp = await page.goto(SITE, { waitUntil: 'load' });
ok('线上页面返回 200', resp.status() === 200, 'HTTP ' + resp.status());

/* 2. 线上文件与本地一致由 tests/verify-live-files.ps1 单独核对
   （浏览器所在进程不继承系统代理，额外请求容易被重置，这里不重复下载） */

/* 3. 样式与脚本真的加载了（不是 404 页面） */
await page.waitForFunction(() => !!window.__MOSS__, null, { timeout: 25000 });
ok('脚本已加载', true, 'window.__MOSS__ 就绪');
const css = await page.evaluate(() => ({
  rendering: getComputedStyle(document.getElementById('world')).imageRendering,
  topbar: getComputedStyle(document.getElementById('topbar')).display
}));
ok('样式已加载', css.rendering === 'pixelated' && css.topbar === 'flex', JSON.stringify(css));

/* 4. 真的开新档并玩 */
await page.locator('.boot-actions button', { hasText: '开始新的游戏' }).click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const p0 = await page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
ok('开新档成功', !!p0, '出生 ' + p0.join(','));

await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowLeft');
const p1 = await page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
ok('方向键能走', p1[0] < p0[0], p0.join(',') + ' → ' + p1.join(','));

await page.keyboard.press('1');
const t = await page.evaluate(() => {
  const M = window.__MOSS__;
  const tile = [M.state.player.x, M.state.player.y - 1];
  return { tile, s: M.tileToScreen(tile[0], tile[1]) };
});
await page.mouse.click(t.s[0], t.s[1]);
await page.waitForTimeout(250);
ok('能翻土', await page.evaluate(k => !!window.__MOSS__.state.plots[k], t.tile.join(',')));
ok('引导卡显示', await page.locator('#tutorialCard').isVisible());
ok('今日待办显示', (await page.locator('#dailyTasks').innerText()).length > 0, await page.locator('#dailyTasks').innerText());

/* 5. 画布真画了东西 */
const colors = await page.evaluate(() => {
  const c = document.getElementById('world');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const s = new Set();
  for (let i = 0; i < d.length; i += 4 * 37) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return s.size;
});
ok('画布已绘制', colors > 12, colors + ' 种颜色');
ok('线上无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 条');

await page.screenshot({ path: path.join(ROOT, 'output', 'playwright', 'live-site.png') });
await browser.close();
console.log(failed ? `\n失败 ${failed} 项` : '\n线上站点全部通过');
process.exit(failed ? 1 : 0);
