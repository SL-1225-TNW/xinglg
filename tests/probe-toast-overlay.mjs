/* 提示条浮层探针：取证「电脑端提示条不再占用画布高度」。
   三点测量把「种子选择器开合」与「提示条出现」分开：g1→g2 的差异才是提示条的影响。
   2026-11-03 定位 run-edge 偶发失败（点格子落到邻格）时写。
   用法：cd tests && node probe-toast-overlay.mjs
   注意：纯诊断脚本，不参与 CI，不写断言（结论以 run-edge 等正式套件为准）。 */
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, boot, walkTo, clickTile, pickTool } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'output', 'playwright', 'ui-polish');

const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 860 } });
await boot(page, { fresh: true });
await walkTo(page, 7, 9);

const geo = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const t = document.getElementById('toast');
  const tr = t.getBoundingClientRect();
  return {
    canvas: [Math.round(r.width), Math.round(r.height)],
    canvasTop: Math.round(r.top),
    canvasBottom: Math.round(r.bottom),
    toast: (t.textContent || '').slice(0, 24),
    toastBox: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.width), Math.round(tr.height)],
    toastPos: getComputedStyle(t).position,
    zoom: window.__MOSS__.game.zoom,
  };
});

const g0 = await geo();
await pickTool(page, 2);                 // 种子槽：开选择器（底栏变高，画布变矮）
await page.waitForTimeout(120);
const g1 = await geo();                  // 此时还没有提示条
await clickTile(page, 7, 8);             // 未松土播种 → 必定弹提示条
await page.waitForTimeout(250);
const g2 = await geo();                  // 提示条已出现

console.log('g0 选择器前：', JSON.stringify(g0));
console.log('g1 选择器后：', JSON.stringify(g1));
console.log('g2 提示条后：', JSON.stringify(g2));
console.log('选择器影响：画布 ' + g0.canvas.join('x') + ' → ' + g1.canvas.join('x'));
console.log('提示条影响：画布 ' + g1.canvas.join('x') + ' → ' + g2.canvas.join('x') +
  (g1.canvas.join('x') === g2.canvas.join('x') ? '（未变：提示条不占画布高度）' : '（变了！）'));
console.log('提示条浮在画布下沿：', g2.toastBox[1] >= g2.canvasTop && g2.toastBox[1] + g2.toastBox[3] <= g2.canvasBottom + 1 ? '是' : '否',
  ' 定位=' + g2.toastPos, ' 文本=' + g2.toast);

await page.screenshot({ path: path.join(OUT, 'toast-overlay-desktop.png') });
console.log('截图：output/playwright/ui-polish/toast-overlay-desktop.png');
if (errors && errors.length) console.log('控制台错误：', errors.slice(0, 3));
await browser.close();
