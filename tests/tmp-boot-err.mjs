import { launch } from './harness.mjs';
const { browser, page, errors } = await launch();
try {
  await page.goto((await import('./harness.mjs')).GAME_URL);
  await page.waitForTimeout(2500);
  console.log('__MOSS__:', await page.evaluate(() => !!window.__MOSS__));
  console.log('--- 页面报错 ---');
  [...new Set(errors)].forEach(e => console.log(e));
} finally { await browser.close(); }
