/* 单文件版冒烟测试：真的双击打开（file://）、真的玩几步，不是只检查文件存在。
   用法：node tests/single-file-smoke.mjs */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '苔芽农场-单文件版.html');
if (!fs.existsSync(FILE)) { console.error('缺少单文件版，先运行 node tests/build-single-file.mjs'); process.exit(1); }

let failed = 0;
const ok = (n, c, d) => { if (c) console.log('PASS ' + n + (d ? ' · ' + d : '')); else { failed++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };

const browser = await chromium.launch({ headless: true, ...(process.env.MOSS_CHROMIUM ? { executablePath: process.env.MOSS_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

/* 1. 以 file:// 打开（和对方双击完全一样） */
await page.goto(pathToFileURL(FILE).href);
ok('单文件用 file:// 打开', true, path.basename(FILE));

/* 2. 样式真的内联生效（不是裸 HTML） */
const styled = await page.evaluate(() => {
  const c = getComputedStyle(document.getElementById('world'));
  return { rendering: c.imageRendering, topbar: getComputedStyle(document.getElementById('topbar')).display };
});
ok('样式已内联生效', styled.rendering === 'pixelated' && styled.topbar === 'flex', JSON.stringify(styled));

/* 3. 脚本真的内联生效 */
await page.waitForFunction(() => !!window.__MOSS__, null, { timeout: 20000 });
ok('脚本已内联生效', true, 'window.__MOSS__ 就绪');

/* 4. 开新档并走几步 */
await page.locator('.boot-actions button', { hasText: '开始新的游戏' }).click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const p0 = await page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
ok('新档建立', !!p0, '出生 ' + p0.join(','));

await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowLeft');
const p1 = await page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
ok('方向键能走', p1[0] < p0[0], p0.join(',') + ' → ' + p1.join(','));

/* 5. 翻土 + 播种真的改变状态 */
await page.keyboard.press('1');
const pt = await page.evaluate(() => {
  const M = window.__MOSS__;
  const t = [M.state.player.x, M.state.player.y - 1];
  return { t, s: M.tileToScreen(t[0], t[1]) };
});
await page.mouse.click(pt.s[0], pt.s[1]);
await page.waitForTimeout(250);
const tilled = await page.evaluate(k => !!window.__MOSS__.state.plots[k], pt.t.join(','));
ok('能翻土（画面与逻辑都在）', tilled, pt.t.join(','));

/* 6. 引导卡出现（新手第一眼看到的东西） */
ok('新手引导卡显示', await page.locator('#tutorialCard').isVisible());
ok('今日待办显示', (await page.locator('#dailyTasks').innerText()).length > 0, await page.locator('#dailyTasks').innerText());

/* 7. 画布真的有画面（不是空白） */
const painted = await page.evaluate(() => {
  const c = document.getElementById('world');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 37) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return seen.size;
});
ok('画布已绘制', painted > 12, painted + ' 种颜色');

/* 8. 存档写进 localStorage（刷新能继续） */
const saved = await page.evaluate(() => !!window.__MOSS__.saves.read()?.payload);
ok('存档已写入 localStorage', saved);

ok('全程无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 条');

await page.screenshot({ path: path.join(ROOT, 'output', 'playwright', 'single-file-smoke.png') });
await browser.close();
console.log(failed ? `\n失败 ${failed} 项` : '\n单文件版冒烟测试全部通过');
process.exit(failed ? 1 : 0);
