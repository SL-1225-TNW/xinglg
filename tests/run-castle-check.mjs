import { launch, boot } from './harness.mjs';
import fs from 'node:fs';

/* 城堡可见性排查：
   1) 城堡是否注册在 CITY_BUILDINGS 里
   2) 离屏渲染城堡，确认真的画出像素（不是静默失败）
   3) 玩家站在城堡门口时，城堡是否在视口内（可能被相机/焦点逻辑推出画面）
   4) 城堡总高 304px，视口高是否够放
   5) 截图存档 */

const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】城堡注册状态');
  const info = await page.evaluate(() => {
    const M = window.__MOSS__;
    const c = M.CITY_BUILDINGS.find(b => b.id === 'castle');
    return c ? {
      found: true, x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind,
      label: c.label, door: c.door, vh: c.visualHeight,
      total: M.CITY_BUILDINGS.length,
    } : { found: false, total: M.CITY_BUILDINGS.length };
  });
  console.log(`  CITY_BUILDINGS 共 ${info.total} 栋`);
  if (!info.found) { T('城堡已注册', false, 'CITY_BUILDINGS 里找不到 id=castle'); }
  else {
    T('城堡已注册', true,
      `(${info.x},${info.y}) ${info.w}x${info.h} kind=${info.kind} 视觉高=${info.vh}px 门=(${info.door.x},${info.door.y})`);
  }

  console.log('\n【2】离屏渲染：确认真的画出像素');
  const px = await page.evaluate(() => {
    const M = window.__MOSS__;
    const c = M.CITY_BUILDINGS.find(b => b.id === 'castle');
    if (!c) return { err: 'no castle' };
    const PAD = 80;
    const cv = document.createElement('canvas');
    cv.width = c.w * 16 + PAD * 2;
    cv.height = (c.visualHeight || 304) + 200;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#FF00FE';
    g.fillRect(0, 0, cv.width, cv.height);
    M.__drawFacadeTo(g, c, 40, PAD);
    const img = g.getImageData(0, 0, cv.width, cv.height).data;
    let nonBg = 0, minX = cv.width, maxX = -1, minY = cv.height, maxY = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (Math.abs(img[i] - 255) > 24 || img[i + 1] > 24 || Math.abs(img[i + 2] - 254) > 24) {
        nonBg++; if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { W: cv.width, H: cv.height, nonBg, minX, maxX, minY, maxY };
  });
  if (px.err) T('离屏渲染', false, px.err);
  else {
    T('城堡画出了像素', px.nonBg > 5000, `${px.nonBg}px`);
    console.log(`  画布 ${px.W}x${px.H}  内容包围盒 x=[${px.minX},${px.maxX}] y=[${px.minY},${px.maxY}]`);
    T('没被画布上缘裁掉', px.minY >= 0, `顶部 ${px.minY}px`);
    console.log(`  实际内容高度 ${px.maxY - px.minY}px / 画布高 ${px.H}px`);
  }

  console.log('\n【3】玩家站到城堡门口，看城堡是否在视口内');
  const view = await page.evaluate(() => {
    const M = window.__MOSS__;
    const c = M.CITY_BUILDINGS.find(b => b.id === 'castle');
    const cv = document.querySelector('#game') || document.querySelector('canvas');
    // 把玩家挪到城堡正门
    M.devSwitchScene('city', c.door.x, c.door.y + 1);
    return {
      doorX: c.door.x, doorY: c.door.y,
      viewW: cv.width, viewH: cv.height,
      cssW: cv.getBoundingClientRect().width,
      cssH: cv.getBoundingClientRect().height,
    };
  });
  await page.waitForTimeout(600);
  const onScreen = await page.evaluate(() => {
    const M = window.__MOSS__;
    const cv = document.querySelector('#game') || document.querySelector('canvas');
    const g = cv.getContext('2d');
    // 直接数视口里"城堡蓝灰顶色"的像素
    const img = g.getImageData(0, 0, cv.width, cv.height).data;
    let blue = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], gg = img[i + 1], b = img[i + 2];
      // #4C6480 / #566B80 一类蓝灰顶
      if (b > r + 15 && b > gg + 8 && b > 80 && r > 40 && r < 140) blue++;
    }
    return { blue, W: cv.width, H: cv.height };
  });
  T('视口里能看到城堡顶', onScreen.blue > 500, `蓝灰顶像素 ${onScreen.blue}px`);
  console.log(`  视口 ${view.viewW}x${view.viewH}（CSS ${view.cssW}x${view.cssH}）城堡门=(${view.doorX},${view.doorY})`);

  console.log('\n【4】截图：城堡门口视角');
  fs.mkdirSync('/root/xinglg/tests/shots', { recursive: true });
  await page.evaluate(() => {
    const M = window.__MOSS__;
    const c = M.CITY_BUILDINGS.find(b => b.id === 'castle');
    M.devSwitchScene('city', c.door.x, c.door.y + 1);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/root/xinglg/tests/shots/castle_at_door.png' });
  T('截图 castle_at_door', true, 'castle_at_door.png');

  // 再退远一点看全貌
  await page.evaluate(() => {
    const M = window.__MOSS__;
    M.devSwitchScene('city', 312, 74);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/root/xinglg/tests/shots/castle_far.png' });
  T('截图 castle_far', true, 'castle_far.png');

  console.log('\n【5】控制台无报错');
  const e2 = [...new Set(errors)];
  T('无报错', e2.length === 0, e2.slice(0, 4).join(' | ') || '');

  console.log('\n======== 汇总 ========');
  console.log(fails.length ? `失败 ${fails.length} 项` : '全部通过');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally { await browser.close(); }