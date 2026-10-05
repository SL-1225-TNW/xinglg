/* 池塘游鱼短录像：用真实键盘走到池塘边，录 18 秒游鱼画面
   （第三版验收 E：游鱼最好附短录像）。同时断言录像期间鱼真的在动、且没有游出水域。 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { walkTo } from './harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'output', 'playwright');
const TMP = path.join(OUT, 'video-tmp');
const FINAL = path.join(OUT, 'v3-pond-fish.webm');
const GAME_URL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

const VIEW = { width: 1280, height: 860 };
const SECONDS = 18;
const POND = { x0: 26, y0: 17, x1: 30, y1: 21 };
const STAND = [25, 20];   // 池塘西岸，站着就能看全整池

const fishState = page => page.evaluate(() => {
  const f = window.__MOSS__.game.pondFish;
  if (!f) return null;
  return f.map(x => ({ x: Math.round(x.x), y: Math.round(x.y), d: x.dir }));
});

const inWater = f => (f.x / 16) >= POND.x0 && (f.x / 16) <= POND.x1 + 1
  && (f.y / 16) >= POND.y0 && (f.y / 16) <= POND.y1 + 1;

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  recordVideo: { dir: TMP, size: VIEW }
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('PASS ' + name + (detail ? ' · ' + detail : ''));
  else { failed++; console.log('FAIL ' + name + (detail ? ' · ' + detail : '')); }
};

await page.goto(GAME_URL);
await page.waitForFunction(() => !!window.__MOSS__, null, { timeout: 20000 });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.__MOSS__);
await page.locator('.boot-actions button', { hasText: '开始新的游戏' }).click();
await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
console.log('开新游戏完成');

// 真实走到池塘西岸，整个池塘都要在画面里
const reached = await walkTo(page, STAND[0], STAND[1], 20000);
const at = await page.evaluate(() => [window.__MOSS__.state.player.x, window.__MOSS__.state.player.y]);
check('真实走到池塘边 ' + at.join(','), reached && at[0] === STAND[0] && at[1] === STAND[1], '目标 ' + STAND.join(','));

const vis = await page.evaluate((P) => {
  const M = window.__MOSS__;
  const vw = 384, vh = 256;
  const ox = M.cam.x, oy = M.cam.y;
  return {
    inView: (P.x0 * 16 >= ox) && ((P.x1 + 1) * 16 <= ox + vw)
      && (P.y0 * 16 >= oy) && ((P.y1 + 1) * 16 <= oy + vh),
    cam: [Math.round(ox), Math.round(oy)]
  };
}, POND);
check('整池严格在画面内（不裁切）', vis.inView, 'cam ' + vis.cam.join(','));

// 录像起点画面（与视频同一机位同一状态）
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'v3-evidence-16-pond-video-frame.png') });

// 录像开始：18 秒真实游戏时间，不注入任何夹具
const before = await fishState(page);
check('池塘有 4–6 条鱼', before && before.length >= 4 && before.length <= 6, (before || []).length + ' 条');

const t0 = Date.now();
let sample = before;
let maxOut = 0;
const samples = [];
while ((Date.now() - t0) / 1000 < SECONDS) {
  await page.waitForTimeout(1000);
  sample = await fishState(page);
  samples.push(sample);
  const out = sample.filter(f => !inWater(f)).length;
  if (out > maxOut) maxOut = out;
  process.stdout.write(`  t+${Math.round((Date.now() - t0) / 1000)}s 越界 ${out}\n`);
}
const video = page.video();
await page.waitForTimeout(400);
const clip = await video.path();
await ctx.close();
await browser.close();

// 鱼确实动过：逐条比较首末位置
const moved = before.filter((f, i) => Math.abs(f.x - sample[i].x) > 6 || Math.abs(f.y - sample[i].y) > 4).length;
check('录像期间鱼持续游动', moved >= 4, moved + '/' + before.length + ' 条位移明显');
check('录像期间鱼没有游出水域', maxOut === 0, '最大越界数 ' + maxOut);
check('录像期间控制台无错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 条');

fs.copyFileSync(clip, FINAL);
fs.rmSync(TMP, { recursive: true, force: true });
const kb = Math.round(fs.statSync(FINAL).size / 1024);
console.log(`\n录像已保存：${FINAL}（${kb} KB，约 ${SECONDS} 秒）`);
console.log('控制台错误：' + errors.length);
console.log(failed ? `\n失败 ${failed} 项` : '\n游鱼录像全部通过');
process.exit(failed ? 1 : 0);
