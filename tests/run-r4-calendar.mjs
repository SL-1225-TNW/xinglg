/* R4 step 1: 四季年历 + 单源派生 + 旧档兼容。
   只新增了一层 calendar 派生与 HUD 显示，没有改任何作物结算与天气；
   旧档的 totalDay 1..N 直接映射到 1年春/夏/秋/冬 + 2年春，作物跨季节继续由
   sanitizePlots 决定（不会因为引入 calendar 多删一行）。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

const c = () => p.evaluate(() => ({
  totalDay: __MOSS__.state.totalDay,
  cal: __MOSS__.yearSeasonOfDay(__MOSS__.state.totalDay),
  fmt: __MOSS__.formatYearSeason(__MOSS__.state.totalDay),
  dpy: __MOSS__.DAYS_PER_YEAR,
  dps: __MOSS__.DAYS_PER_SEASON,
  seasons: __MOSS__.SEASONS.slice()
}));

/* 默认开局在第 1 天 → 1年春季第 1 天 */
const init = await c();
eq(init.dpy, 112, 'DAYS_PER_YEAR = 112 (4 × 28)');
eq(init.dps, 28, 'DAYS_PER_SEASON = 28');
eq(init.seasons, ['春', '夏', '秋', '冬'], 'SEASONS = [春,夏,秋,冬]');
eq(init.cal, { year: 1, seasonIdx: 0, seasonName: '春', dayOfYear: 1, total: 1,
                seasonStart: 1, seasonEnd: 28 }, '第 1 天 = 1年春第 1 天');

/* 第 28 天仍是 1 春 */
await p.evaluate(() => { __MOSS__.state.totalDay = 28; });
const d28 = await c();
eq(d28.cal.seasonName, '春', '第 28 天仍属春');
eq(d28.cal.dayOfYear, 28, '第 28 天 = 春季最后一天');

/* 第 29 天跨到 1 夏 */
await p.evaluate(() => { __MOSS__.state.totalDay = 29; });
const d29 = await c();
eq(d29.cal, { year: 1, seasonIdx: 1, seasonName: '夏', dayOfYear: 1, total: 29,
               seasonStart: 29, seasonEnd: 56 }, '第 29 天 = 1年夏第 1 天');

/* 春夏秋冬循环；第 112 天 = 1冬最后一天；第 113 天进入 2 年春 */
await p.evaluate(() => { __MOSS__.state.totalDay = 112; });
eq((await c()).cal.seasonName, '冬', '第 112 天 = 1冬最后一天');
await p.evaluate(() => { __MOSS__.state.totalDay = 113; });
const year2 = await c();
eq(year2.cal, { year: 2, seasonIdx: 0, seasonName: '春', dayOfYear: 1, total: 113,
                 seasonStart: 113, seasonEnd: 140 }, '第 113 天 = 2年春第 1 天');

/* formatYearSeason 文案 */
await p.evaluate(() => { __MOSS__.state.totalDay = 113; });
eq(await p.evaluate(() => __MOSS__.formatYearSeason(113)), '2年春第1天', 'formatYearSeason 文案');

/* HUD 在游戏里能查到「年」「季」字样 */
await p.locator('#hudDate .hud-value').waitFor();
const hud = await p.locator('#hudDate .hud-value').innerText();
ok(hud.includes('年') && hud.includes('季'), 'HUD 显示「年」「季」字样');
const hudClass = await p.locator('#hudDate .hud-value').getAttribute('class');
ok(/season-春/.test(hudClass) || /season-夏/.test(hudClass) || /season-秋/.test(hudClass) || /season-冬/.test(hudClass),
   'HUD 加上季节 className');

/* 把 totalDay 推到 4 个季边界，看 className 跟着变 */
async function setDayAndRefresh(d) {
  await p.evaluate((dd) => { __MOSS__.state.totalDay = dd; __MOSS__.refreshHud ? __MOSS__.refreshHud() : null; }, d);
}
await setDayAndRefresh(1);
eq(await p.evaluate(() => document.querySelector('#hudDate .hud-value').className), 'hud-value season-春', '第 1 天 HUD class = season-春');
await setDayAndRefresh(29);
eq(await p.evaluate(() => document.querySelector('#hudDate .hud-value').className), 'hud-value season-夏', '第 29 天 HUD class = season-夏');
await setDayAndRefresh(57);
eq(await p.evaluate(() => document.querySelector('#hudDate .hud-value').className), 'hud-value season-秋', '第 57 天 HUD class = season-秋');
await setDayAndRefresh(85);
eq(await p.evaluate(() => document.querySelector('#hudDate .hud-value').className), 'hud-value season-冬', '第 85 天 HUD class = season-冬');

function ok(c, n) { assert.ok(c, n); checks++; console.log('PASS', n); }

/* 旧档兼容：直接给一个没有 calendar 字段的 raw，normalizeSave 还能跑通。
   不会因为 calendar 多删一天 / 减少一行。 */
const roundtrip = await p.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('moss-farm-v2'));
  const a = __MOSS__.normalizeSaveForTest(raw);
  const b = __MOSS__.normalizeSaveForTest(a);
  return { aDay: a.totalDay, bDay: b.totalDay, aCoins: a.coins, bCoins: b.coins };
});
eq(roundtrip.aDay, roundtrip.bDay, '归一化往返 totalDay 不变');
eq(roundtrip.aCoins, roundtrip.bCoins, '归一化往返 coins 不变');

await r.browser.close();
console.log(`R4 四季年历 ${checks} 项通过${single ? '（单文件）' : ''}`);
