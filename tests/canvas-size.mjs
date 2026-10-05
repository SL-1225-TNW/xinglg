/* 桌面大屏画布占位测量：不同分辨率下画布到底多大、占屏幕多少。 */
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, boot } from './harness.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', 'playwright');
const SIZES = [
  [1280, 860], [1440, 900], [1512, 982], [1728, 1117], [1920, 1080], [2560, 1440], [2560, 1600]
];
console.log('viewport      canvas        scale   占宽%   占高%');
for (const [w, h] of SIZES) {
  const { browser, page } = await launch({ viewport: { width: w, height: h } });
  await boot(page, { fresh: true });
  await page.waitForTimeout(450);
  const m = await page.evaluate(() => {
    const r = window.__MOSS__.canvasRect;
    const top = document.getElementById('topbar').getBoundingClientRect();
    const dock = document.getElementById('dock').getBoundingClientRect();
    const assist = document.getElementById('farmAssist').getBoundingClientRect();
    return { r, top: Math.round(top.height), dock: Math.round(dock.height), assist: Math.round(assist.height) };
  });
  const s = m.r.w / 384;
  console.log(
    `${String(w + 'x' + h).padEnd(13)} ${(m.r.w + 'x' + m.r.h).padEnd(13)} ${s.toFixed(2).padEnd(7)}`
    + `${(m.r.w / w * 100).toFixed(0).padStart(5)}% ${(m.r.h / h * 100).toFixed(0).padStart(5)}%`
    + `   顶栏${m.top} 底栏${m.dock} 引导${m.assist}`
  );
  if (w === 1512 || w === 2560) await page.screenshot({ path: path.join(OUT, `bigscreen-${w}x${h}.png`) });
  await browser.close();
}
