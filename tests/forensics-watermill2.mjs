import { launch, boot } from './harness.mjs';
import fs from 'node:fs';

/* 直接导出 watermill 离屏渲染 PNG，人眼看那 34px 是什么 */
const { browser, page, errors } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  const dataUrl = await page.evaluate(() => {
    const M = window.__MOSS__;
    const b = M.CITY_BUILDINGS.find(x => x.id === 'watermill');
    const PAD = 80;
    const cv = document.createElement('canvas');
    cv.width = b.w * 16 + PAD * 2;
    cv.height = (b.visualHeight || 200) + 260;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    M.__drawFacadeTo(g, b, 40, PAD);
    return cv.toDataURL('image/png');
  });
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync('/root/xinglg/tests/shots/wm_raw.png', buf);
  console.log('已导出 tests/shots/wm_raw.png', buf.length, 'bytes');

  // 再导一张：把立面右界和溢出区画成参考线
  const marked = await page.evaluate(() => {
    const M = window.__MOSS__;
    const b = M.CITY_BUILDINGS.find(x => x.id === 'watermill');
    const PAD = 80;
    const cv = document.createElement('canvas');
    cv.width = b.w * 16 + PAD * 2;
    cv.height = (b.visualHeight || 200) + 260;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    M.__drawFacadeTo(g, b, 40, PAD);
    const faceL = PAD + 5, faceR = faceL + Math.max(24, b.w * 16 - 10) - 1;
    // 立面左右界绿线
    g.strokeStyle = '#00FF00'; g.lineWidth = 1;
    [faceL, faceR + 1].forEach(x => { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, cv.height); g.stroke(); });
    // 立面底线红线
    g.strokeStyle = '#FF0000';
    g.beginPath(); g.moveTo(0, (cv.height - 20) + .5); g.lineTo(cv.width, (cv.height - 20) + .5); g.stroke();
    // 顶到最右内容
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let minX = cv.width, maxX = -1, minY = cv.height, maxY = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { url: cv.toDataURL('image/png'), faceL, faceR, minX, maxX, minY, maxY, H: cv.height };
  });
  const b2 = Buffer.from(marked.url.split(',')[1], 'base64');
  fs.writeFileSync('/root/xinglg/tests/shots/wm_marked.png', b2);
  console.log('\n=== 标注版 ===');
  console.log('绿线=立面边界 x=' + marked.faceL + ' ~ ' + (marked.faceR + 1));
  console.log('红线=立面底线 y=' + (marked.H - 20));
  console.log('不透明内容 bbox: x=[' + marked.minX + ', ' + marked.maxX + ']  y=[' + marked.minY + ', ' + marked.maxY + ']');
  console.log('\n!! 注意：这个 bbox 用 alpha>8 判定，含落影半透明，所以会偏大');
  console.log('绿线外右侧多出 =', marked.maxX - marked.faceR - 1, 'px');
  console.log('已导出 tests/shots/wm_marked.png');
  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n报错: ' + e2.slice(0, 3).join(' | ') : '\n零报错');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }