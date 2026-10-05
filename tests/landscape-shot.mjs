/* 横屏手机（844×390）布局取证：打印各层实际占位并截图。
   用途——引导卡改成浮层后，横屏画布是否真的变大只能看画面，不能只看断言。
   对应的硬性回归在 tests/run-ui.mjs（画布高度 > 280、不超出视口、无横向滚动）。 */
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, boot } from './harness.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', 'playwright');
const VIEW = { width: 844, height: 390 };
const { browser, page } = await launch({ viewport: VIEW, touch: true });
await boot(page, { fresh: true });
await page.waitForTimeout(600);

const m = await page.evaluate(() => {
  const ids = ['app', 'topbar', 'farmAssist', 'tutorialCard', 'stage', 'viewport', 'dock', 'touch'];
  const out = {};
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e) { out[id] = 'missing'; continue; }
    const r = e.getBoundingClientRect();
    out[id] = { y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width), position: getComputedStyle(e).position };
  }
  out.innerHeight = innerHeight;
  out.canvas = window.__MOSS__.canvasRect;
  out.assistAnchor = getComputedStyle(document.documentElement).getPropertyValue('--assist-top').trim();
  return out;
});
console.log(JSON.stringify(m, null, 1));

const c = m.canvas;
const pass = c.h > 280 && c.h <= VIEW.height;
console.log(pass ? `PASS 横屏画布 ${c.w}x${c.h}（高度 > 280 且不超出视口）` : `FAIL 横屏画布 ${c.w}x${c.h}`);
console.log('引导浮层锚点 --assist-top = ' + m.assistAnchor + '（顶栏下沿）');

await page.screenshot({ path: path.join(OUT, 'guide-landscape.png') });
await browser.close();
process.exit(pass ? 0 : 1);
