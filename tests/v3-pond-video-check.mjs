/* 校验 v3-pond-fish.webm 真的有内容：在 6 个时间点抽帧，
   断言画面不是黑屏/静止，并且池塘区域逐帧有变化（鱼在游）。 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(__dirname, '..', 'output', 'playwright', 'v3-pond-fish.webm');
const PAGE = path.join(path.dirname(VIDEO), '_video-check.html');
const TIMES = [11.0, 14.0, 17.0, 20.0, 23.0, 26.0];   // 后半段是池塘游鱼的部分

/* file:// 页面必须自己落在磁盘上，about:blank 不能引用本地视频 */
fs.writeFileSync(PAGE, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
  <video id="v" src="v3-pond-fish.webm" style="width:1280px;height:860px" muted preload="auto"></video>
  <canvas id="c" width="1280" height="860"></canvas></body>`, 'utf8');

const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.goto(pathToFileURL(PAGE).href);
await page.evaluate(() => document.getElementById('v').load());
await page.waitForFunction(() => document.getElementById('v').readyState >= 2, null, { timeout: 25000 });

const meta = await page.evaluate(() => {
  const v = document.getElementById('v');
  if (v.error) throw new Error('video decode error code ' + v.error.code);
  return { dur: v.duration, w: v.videoWidth, h: v.videoHeight };
});
console.log(`视频元数据：${meta.w}x${meta.h}，时长 ${meta.dur.toFixed(1)}s`);
let failed = 0;
const ok = (n, c, d) => { if (c) console.log('PASS ' + n + (d ? ' · ' + d : '')); else { failed++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
ok('时长不少于 15 秒', meta.dur >= 15, meta.dur.toFixed(1) + 's');
ok('分辨率 1280x860', meta.w === 1280 && meta.h === 860, meta.w + 'x' + meta.h);

/* 池塘在视频画面里的位置：世界格 (26..31, 17..22) 经摄像机换算 */
const POND_BOX = { x: 828, y: 434, w: 168, h: 168 };

const frames = [];
for (const t of TIMES) {
  const d = await page.evaluate(([time, box]) => new Promise((res, rej) => {
    const v = document.getElementById('v'), c = document.getElementById('c');
    const g = c.getContext('2d', { willReadFrequently: true });
    v.onseeked = () => {
      g.drawImage(v, 0, 0);
      const all = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < all.length; i += 4 * 97) { sum += all[i] + all[i + 1] + all[i + 2]; n += 3; }
      const pond = g.getImageData(box.x, box.y, box.w, box.h).data;
      let h = 0, ps = 0, pn = 0;
      for (let i = 0; i < pond.length; i += 4) {
        h = (h * 31 + (pond[i] * 7 + pond[i + 1] * 13 + pond[i + 2] * 17 + i)) % 1000000007;
        ps += pond[i] + pond[i + 1] + pond[i + 2]; pn += 3;
      }
      // 鱼身颜色计数：池塘底色是蓝色渐变，五条鱼的体色与它区分得开
      const FISH = [[224, 168, 92], [143, 194, 200], [239, 209, 139], [217, 140, 122], [168, 208, 138]];
      const cnt = [0, 0, 0, 0, 0];
      for (let i = 0; i < pond.length; i += 4) {
        for (let k = 0; k < 5; k++) {
          if (Math.abs(pond[i] - FISH[k][0]) <= 6 && Math.abs(pond[i + 1] - FISH[k][1]) <= 6 && Math.abs(pond[i + 2] - FISH[k][2]) <= 6) { cnt[k]++; break; }
        }
      }
      window.__prev = pond.slice();
      res({ mean: +(sum / n).toFixed(1), pondHash: h, pondMean: +(ps / pn).toFixed(1), fish: cnt });
    };
    v.onerror = () => rej(new Error('seek error'));
    v.currentTime = time;
    setTimeout(() => rej(new Error('seek timeout ' + time)), 12000);
  }), [t, POND_BOX]);
  frames.push({ t, ...d });
  console.log(`  t=${String(t).padStart(4)}s  画面均亮 ${d.mean}  池塘均亮 ${d.pondMean}  鱼色像素 ${d.fish.join('/')}（共 ${d.fish.reduce((a, b) => a + b, 0)}）`);
}
ok('画面不是黑屏（各帧均亮 > 12）', frames.every(f => f.mean > 12), frames.map(f => f.mean).join(','));
const hashes = new Set(frames.map(f => f.pondHash));
ok('池塘区域逐帧有变化', hashes.size >= frames.length - 1, [...hashes].length + '/' + frames.length + ' 帧各不相同');
ok('池塘不是死黑一片', frames.every(f => f.pondMean > 20), frames.map(f => f.pondMean).join(','));
/* 每条鱼 7×4 或 9×5 世界像素，5 条合计不超过 225 世界像素；
   画布在页面里约 2 倍显示，所以屏幕像素上限给到 1500（远小于整池 28224） */
const perFrame = frames.map(f => f.fish.reduce((a, b) => a + b, 0));
ok('每帧都能在池塘里认出鱼（40–1500 鱼色像素）', perFrame.every(n => n >= 40 && n <= 1500), perFrame.join(','));
ok('五条鱼的体色都能被认出（每帧 5 种颜色全部命中）', frames.every(f => f.fish.filter(n => n > 0).length === 5),
  frames.map(f => f.fish.filter(n => n > 0).length).join(','));
ok('鱼色像素逐帧不同（鱼在游而不是静止贴图）', new Set(perFrame).size >= frames.length - 1, [...new Set(perFrame)].join(','));

await browser.close();
fs.rmSync(PAGE, { force: true });
console.log(failed ? `\n失败 ${failed} 项` : '\n录像内容校验全部通过');
process.exit(failed ? 1 : 0);
