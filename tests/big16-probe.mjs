/* 2560×1600 上的画布占位与"还能不能再挤"的探针。 */
import { launch, boot } from './harness.mjs';

const VP = { width: 2560, height: 1600 };
const { browser, page } = await launch({ viewport: VP });
await boot(page, { fresh: true });
await page.waitForTimeout(600);

const probe = async label => {
  const m = await page.evaluate(() => {
    const r = window.__MOSS__.canvasRect;
    const parts = {};
    for (const id of ['topbar', 'farmAssist', 'dock', 'hotbar', 'toast', 'stage']) {
      const e = document.getElementById(id);
      const b = e.getBoundingClientRect();
      parts[id] = Math.round(b.height);
    }
    return { r, parts, scale: +(r.w / 384).toFixed(3) };
  });
  console.log(`${label.padEnd(22)} 画布 ${m.r.w}x${m.r.h}  ${m.scale}x  占屏 ${(m.r.w / 2560 * 100).toFixed(0)}% / ${(m.r.h / 1600 * 100).toFixed(0)}%`);
  return m;
};

const a = await probe('现状（引导条占位）');
console.log('   纵向占用：', JSON.stringify(a.parts));

// 模拟"引导条改成浮层"能拿到多少空间
await page.evaluate(() => {
  const el = document.getElementById('farmAssist');
  el.style.position = 'absolute';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.top = '60px';
  el.style.width = 'min(1120px,calc(100% - 40px))';
  el.style.zIndex = '26';
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(500);
const b = await probe('引导条改浮层（模拟）');

// 再模拟"底栏 toast 不占高度"
await page.evaluate(() => {
  const t = document.getElementById('toast');
  t.style.position = 'absolute';
  t.style.left = '50%';
  t.style.transform = 'translateX(-50%)';
  t.style.bottom = '110px';
  window.dispatchEvent(new Event('resize'));
});
await page.waitForTimeout(500);
await probe('再让 toast 浮起来');

await page.screenshot({ path: '../output/playwright/big-sim-2560x1600.png' });
await browser.close();
