/* 线上验收：直接打开 https://sl-1225-tnw.github.io/xinglg/ 走一遍快速传送 */
import { chromium } from 'playwright';
const URL = 'https://sl-1225-tnw.github.io/xinglg/';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
try {
  await p.goto(URL, { waitUntil: 'load', timeout: 45000 });
  await p.waitForFunction(() => !!window.__MOSS__, null, { timeout: 30000 });
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button', { hasText: '开始新的游戏' }).click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  console.log('游戏已启动，场景 =', await p.evaluate(() => __MOSS__.state.sceneId));

  const info = await p.evaluate(() => __MOSS__.travelStateInfo());
  console.log('传送登记:', JSON.stringify(info.discovered), '当前节点:', info.current);

  const pv = await p.evaluate(() => __MOSS__.travelPreview('town.square'));
  console.log('农场→小镇预览:', pv.ok ? `${pv.minutes} 分钟，到达 ${pv.arrivalText}` : pv.reason);

  await p.keyboard.press('m');
  await p.waitForSelector('.travel-panel');
  await p.getByRole('button', { name: /^芽芽小镇，已开放/ }).click();
  await p.getByRole('button', { name: '传送过去', exact: true }).click();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'town');
  console.log('✅ 线上传送成功，当前场景 =', await p.evaluate(() => __MOSS__.state.sceneId));
  await p.screenshot({ path: 'output/playwright/live-fast-travel.png' });
  console.log('控制台错误:', errors.length ? errors : '无');
} finally {
  await browser.close();
}
