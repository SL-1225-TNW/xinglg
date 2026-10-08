import { launch, boot } from './harness.mjs';

/* 烟囱像素取证：单栋离屏渲染 -> 判定屋顶之上像素不越出立面。
   判定要点（canvas-pixel-test-debugging 技能）：
   - 用不可能出现的洋红清屏色做背景，排除"画布初始黑"干扰
   - 只扫描屋顶之上的区域（y < 墙顶），因为墙身/屋顶本就与立面同宽
   - 容差 7px：屋顶外挑 5px + 烟囱帽檐 2px + 抗锯齿 1px */
const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】逐栋判定：屋顶之上像素不越出立面');
  const res = await page.evaluate(() => {
    const M = window.__MOSS__;
    const PAD_SIDE = 80, PAD_TOP = 40;
    const out = [];
    for (const b of M.CITY_BUILDINGS) {
      const arch = b.archetype || {};
      if (!arch.chimney) continue;
      const cv = document.createElement('canvas');
      cv.width = b.w * 16 + PAD_SIDE * 2;
      cv.height = (b.visualHeight || 64) + 200;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#FF00FE';
      g.fillRect(0, 0, cv.width, cv.height);
      const geo = M.__drawFacadeTo(g, b, PAD_TOP, PAD_SIDE);
      const img = g.getImageData(0, 0, cv.width, cv.height).data;
      const W = cv.width;
      const bg = (x, y) => {
        const i = ((y | 0) * W + (x | 0)) * 4;
        return Math.abs(img[i] - 255) < 24 && Math.abs(img[i + 1] - 0) < 24 && Math.abs(img[i + 2] - 254) < 24;
      };
      // 逐行求非背景像素的左右极值
      let topMost = cv.height, minX = W, maxX = -1, hit = 0;
      const rowMin = [];
      for (let y = 0; y < cv.height; y++) {
        let lo = W, hi = -1;
        for (let x = 0; x < W; x++) if (!bg(x, y)) { if (x < lo) lo = x; if (x > hi) hi = x; }
        rowMin.push(hi >= lo ? [lo, hi] : null);
        if (hi >= lo) { hit++; if (y < topMost) topMost = y; if (lo < minX) minX = lo; if (hi > maxX) maxX = hi; }
      }
      // 立面左缘在画布上的位置：地块左缘 + 5（drawCityBuilding: left=x+5）
      const faceL = PAD_SIDE + 5;
      const faceR = faceL + Math.max(24, b.w * 16 - 10) - 1;
      out.push({
        id: b.id, faceW: b.w * 16, chimney: arch.chimney, stack: !!arch.stack,
        topMost, hit, faceL, faceR,
        minX: minX - faceL, maxX: maxX - faceL,
        // 屋顶之上：y < topMost + roofH 近似 -> 取最上面 60px 区间单独看
        topRows: rowMin.slice(Math.max(0, topMost), Math.max(0, topMost) + 60)
          .filter(Boolean).map(v => [v[0] - faceL, v[1] - faceL]),
      });
    }
    return out;
  });

  console.log(`  带烟囱建筑 ${res.length} 栋\n`);
  for (const r of res) {
    if (!r.hit) { T(r.id.padEnd(11), false, '整栋没画出像素'); continue; }
    const TOL = 7;
    // 只用"屋顶之上"那 60 行判定：墙体宽度天然 = 立面宽，不会误报
    let tMin = 1e9, tMax = -1;
    r.topRows.forEach(([a, b]) => { if (a < tMin) tMin = a; if (b > tMax) tMax = b; });
    const useT = tMax >= tMin;
    const lo = useT ? tMin : r.minX, hi = useT ? tMax : r.maxX;
    const ok = lo >= -TOL && hi <= r.faceW + TOL;
    T(r.id.padEnd(11), ok,
      `立面${r.faceW}px 烟囱${r.chimney}${r.stack ? '高' : ''} ` +
      `屋顶上方像素x=[${lo}, ${hi}] 界=[-${TOL}, ${r.faceW + TOL}]` +
      (ok ? '' : `  ← 越界`));
  }

  console.log('\n【2】宽窄跨度对照');
  const byW = [...res].sort((a, b) => a.faceW - b.faceW);
  if (byW.length >= 2) {
    const n = byW[0], wd = byW[byW.length - 1];
    const f = r => {
      let lo = 1e9, hi = -1;
      r.topRows.forEach(([a, b]) => { if (a < lo) lo = a; if (b > hi) hi = b; });
      return hi >= lo ? [lo, hi] : [r.minX, r.maxX];
    };
    const fn = f(n), fw = f(wd);
    console.log(`  最窄 ${n.id.padEnd(11)} 立面${n.faceW}px  屋顶上方x=[${fn[0]}, ${fn[1]}]`);
    console.log(`  最宽 ${wd.id.padEnd(11)} 立面${wd.faceW}px  屋顶上方x=[${fw[0]}, ${fw[1]}]`);
    T('两者都不越界', fn[0] >= -7 && fn[1] <= n.faceW + 7 && fw[0] >= -7 && fw[1] <= wd.faceW + 7);
  }

  console.log('\n【3】控制台无报错');
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