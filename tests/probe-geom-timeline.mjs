/* 画布几何时间线探针：取证「提示条出现 → 画布变矮 → 缩放跳档 → 相机错位 → 点格子落到邻格」这条链路。
   2026-11-03 定位 run-edge 偶发失败时写：修复前后各跑一遍，逐帧记录画布尺寸、
   缩放档位与「格子→像素」映射的漂移量。
   用法：cd tests && node probe-geom-timeline.mjs [轮数]
   注意：纯诊断脚本，不参与 CI，不写断言（结论以 run-edge 等正式套件为准）。 */
import path from 'path';
import { fileURLToPath } from 'url';
import { launch, boot, snap, walkTo, clickTile, pickTool, lastToast, clearToasts } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'output', 'playwright', 'ui-polish');

const N = Number(process.argv[2] || 2);
const { browser, page, errors } = await launch();

const geo = () => page.evaluate(() => {
  const M = window.__MOSS__;
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  const p = M.tileToScreen(7, 8);
  return {
    pt: [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100],
    rect: [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100, Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100],
    zoom: M.game && M.game.zoom,
    canvasAttr: [c.width, c.height],
  };
});
const diff = (a, b) => ({
  dpt: [Math.round((b.pt[0] - a.pt[0]) * 100) / 100, Math.round((b.pt[1] - a.pt[1]) * 100) / 100],
  drect: [Math.round((b.rect[0] - a.rect[0]) * 100) / 100, Math.round((b.rect[1] - a.rect[1]) * 100) / 100, Math.round((b.rect[2] - a.rect[2]) * 100) / 100, Math.round((b.rect[3] - a.rect[3]) * 100) / 100],
  dzoom: (b.zoom !== a.zoom) ? `${a.zoom}->${b.zoom}` : '-',
  dattr: (b.canvasAttr[0] !== a.canvasAttr[0] || b.canvasAttr[1] !== a.canvasAttr[1]) ? `${a.canvasAttr.join('x')}->${b.canvasAttr.join('x')}` : '-',
});

for (let i = 0; i < N; i++) {
  await boot(page, { fresh: true });
  await walkTo(page, 7, 9);
  await clearToasts(page);
  console.log(`\n===== 轮 ${i} =====`);
  console.log('步行后      ', JSON.stringify(await geo()));

  await pickTool(page, 2);                    // 种子槽：开选择器（底栏变高）
  console.log('开选择器后  ', JSON.stringify(await geo()));
  const gA = await geo();
  await clickTile(page, 7, 8);                // 期望：未松土 → 播种被拒并弹出提示条
  const gB = await geo();
  console.log('点击后立刻  ', JSON.stringify(gB), 'Δ', JSON.stringify(diff(gA, gB)), 'toast=' + ((await lastToast(page)) || ''));

  await pickTool(page, 1);                    // 锄头槽：关选择器（底栏变矮）
  const gC = await geo();
  console.log('关选择器后  ', JSON.stringify(gC), 'Δ', JSON.stringify(diff(gB, gC)));

  const p = await page.evaluate(() => window.__MOSS__.tileToScreen(7, 8));
  await page.mouse.click(p[0], p[1]);         // 与 clickTile 相同的两段往返
  const gD = await geo();
  console.log('锄地点击后  ', JSON.stringify(gD), 'Δ', JSON.stringify(diff(gC, gD)));
  await page.waitForTimeout(300);
  const gE = await geo();
  console.log('300ms 后   ', JSON.stringify(gE), 'Δ', JSON.stringify(diff(gD, gE)));

  const s = await snap(page);
  const tilled = Object.keys(s.plots || {}).filter(k => s.plots[k].tilled);
  console.log('结果：被锄格=' + (tilled.join('|') || '(无)') + '  期望=7,8');
}
if (errors && errors.length) console.log('\n控制台错误：', errors.slice(0, 5));
await browser.close();
