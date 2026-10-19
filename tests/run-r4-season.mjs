/* R4 季节首轮：播种季节闸门、季末提示、跨季保护与芽芽的季度备货。
   全部用真实睡觉（performSettlement）推进日期，不直接改 totalDay 假装换季。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

async function snap() {
  return p.evaluate(() => {
    const M = __MOSS__, y = M.yearSeasonOfDay(M.state.totalDay);
    return {
      day: M.state.totalDay, season: y.seasonName, year: y.year, dayOfYear: y.dayOfYear,
      left: M.seasonDaysLeft(), coins: M.state.coins,
      stock: JSON.parse(JSON.stringify(M.seasonStockState())),
      plot: JSON.parse(JSON.stringify(M.state.plots['6,4'] || null)),
      seeds: {
        radish: M.state.inventory.seed_radish || 0,
        potato: M.state.inventory.seed_potato || 0,
        strawberry: M.state.inventory.seed_strawberry || 0,
      },
      radish: M.state.inventory.radish || 0,
    };
  });
}
async function sow(cid, x, y) {
  return p.evaluate(([c, tx, ty]) => {
    const M = __MOSS__;
    M.state.selectedSeed = c;
    return M.toolSeed(tx, ty);
  }, [cid, x, y]);
}
async function till(tx, ty) {
  return p.evaluate(([x, y]) => { const M = __MOSS__; M.state.plots[x + ',' + y] = { tilled: true, water: true, crop: null, age: 0, mature: false, harvested: false, regrow: 0, fertility: 70 }; return true; }, [tx, ty]);
}
async function plotAt(key) {
  return p.evaluate((k) => JSON.parse(JSON.stringify(__MOSS__.state.plots[k] || null)), key);
}
function lastToast() {
  return p.evaluate(() => {
    const a = __MOSS__.toasts || [];
    return a.length ? a[a.length - 1].m : '';
  });
}
async function sleep() {
  await p.evaluate(() => { __MOSS__.state.weather.tomorrow = 'sun'; __MOSS__.performSettlement(true); });
}

/* ---------- 1. 季节表本身 ---------- */
const table = await p.evaluate(() => ({
  radish: __MOSS__.cropSowSeasons('radish'),
  potato: __MOSS__.cropSowSeasons('potato'),
  strawberry: __MOSS__.cropSowSeasons('strawberry'),
  spring: __MOSS__.seasonCropsNow(1).slice(),
  summer: __MOSS__.seasonCropsNow(29).slice(),
  autumn: __MOSS__.seasonCropsNow(57).slice(),
  winter: __MOSS__.seasonCropsNow(85).slice(),
}));
eq(table.radish, ['春', '秋'], '萝卜只在春、秋下种');
eq(table.potato, ['春', '夏'], '土豆在春、夏下种');
eq(table.strawberry, ['春'], '草莓只在春下种');
eq(table.spring, ['radish', 'potato', 'strawberry'], '春季三种都能种');
eq(table.summer, ['potato'], '夏季只剩土豆');
eq(table.autumn, ['radish'], '秋季只剩萝卜');
eq(table.winter, [], '冬季没有可下种作物');
ok(await p.evaluate(() => __MOSS__.seasonSowableText(85).includes('本季不宜下种')), '冬季给出的是解释而不是空清单');

/* ---------- 2. 反季播种被拦住，且不扣种子 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.totalDay = 1; M.state.coins = 300;
  M.state.inventory.seed_strawberry = 5;
  M.state.weather = { today: 'sun', tomorrow: 'sun' };
});
await till(6, 4);
let s = await snap();
eq(s.season, '春', '第 1 天是春季');
eq(s.seeds.strawberry, 5, '下种前背包里 5 份草莓种子');
ok(await p.evaluate(() => __MOSS__.cropSowableNow('strawberry', 1)), '春季可以种草莓');
ok(await sow('strawberry', 6, 4), '春季播下草莓');
s = await snap();
eq(s.seeds.strawberry, 4, '成功播种扣掉 1 份种子');
eq(await p.evaluate(() => __MOSS__.state.plots['6,4'].crop), 'strawberry', '地里记下草莓');

/* 夏天的草莓 */
await p.evaluate(() => { const M = __MOSS__; M.state.totalDay = 29; });
eq((await snap()).season, '夏', '第 29 天进入夏季');
await till(7, 4);
ok(!(await sow('strawberry', 7, 4)), '夏季播草莓被拒绝');
s = await snap();
eq(s.seeds.strawberry, 4, '被拒绝时不扣种子');
ok((await lastToast()).includes('春季'), '被拒绝时说明它只能在春季下种');
const planted7 = await p.evaluate(() => (__MOSS__.state.plots['7,4'] || {}).crop);
ok(!planted7, '被拒绝时地里没有留下作物');

/* ---------- 3. 季末提示：剩余天数不够成熟时给出跨季文案 ---------- */
eq(await p.evaluate(() => __MOSS__.seasonEndWarning('strawberry', 1)), '', '春季刚开始不提示季末');
ok((await p.evaluate(() => __MOSS__.seasonEndWarning('radish', 27))) !== '', '萝卜快到季末时给出提示');
ok((await p.evaluate(() => __MOSS__.seasonEndWarning('potato', 1))) === '', '土豆还来得及时不给提示');
ok((await p.evaluate(() => __MOSS__.seasonEndWarning('potato', 26))).includes('跨季继续生长'), '季末文案写明跨季继续生长');
ok((await p.evaluate(() => __MOSS__.seasonEndWarning('potato', 26))).includes('不会枯掉'), '季末文案写明不会枯掉');

/* 真的播下去，并确认播种提示里带了跨季说明 */
await p.evaluate(() => { const M = __MOSS__; M.state.totalDay = 26; M.state.inventory.seed_potato = 3; });
await till(8, 4);
await sow('potato', 8, 4);
const msg = await lastToast();
ok(/播下土豆/.test(msg), '季末仍然允许播种');
ok(/跨季继续生长/.test(msg) && /不会枯掉/.test(msg), '播下季末作物时，提示里确实带上了跨季说明');

/* 跨季保护：地里已长的作物换季不清除、不减产 */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.totalDay = 27;
  M.state.plots['8,4'] = { tilled: true, water: true, crop: 'potato', age: 3, mature: false, harvested: false, regrow: 0, fertility: 70 };
});
await sleep();
s = await snap();
eq(s.season, '春', '第一次睡醒仍在春季（春共 28 天）');
let pl = await plotAt('8,4');
eq(pl.age, 4, '春季最后一天照常累积生长天数');

await p.evaluate(() => { __MOSS__.state.plots['8,4'].water = true; });
await sleep();
s = await snap();
eq(s.season, '夏', '第二次睡醒进入夏季');
pl = await plotAt('8,4');
eq(pl.crop, 'potato', '跨季后作物还在地里，没有被换季清掉');
eq(pl.age, 5, '跨季后照常累积生长天数');
ok(pl.mature, '土豆满 5 天在夏季成熟，跨季没有拖慢也没有减产');

/* ---------- 5. 芽芽的季度备货：每季一份，换季刷新 ---------- */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.totalDay = 1; M.state.coins = 300;
  M.state.inventory.radish = 0;
  M.state.inventory.seed_radish = 0;   // 清掉新档赠送的种子，让备货奖励好数
  M.state.inventory.seed_potato = 0;
  M.state.inventory.seed_strawberry = 0;
});
ok(await p.evaluate(() => __MOSS__.seasonStockReady()), '新档本季备货可交');
ok(!(await p.evaluate(() => __MOSS__.completeSeasonStock())), '材料不足时不能交付');
ok((await p.evaluate(() => __MOSS__.seasonStockMissing())).length > 0, '缺料清单非空');
await p.evaluate(() => { __MOSS__.state.inventory.radish = 3; });
eq(await p.evaluate(() => __MOSS__.completeSeasonStock()), true, '凑齐萝卜后完成春播备货');
s = await snap();
eq(s.stock, { year: 1, seasonIdx: 0, count: 1 }, '备货只记一次，绑定到本季');
eq(s.seeds.radish, 2, '换到萝卜种子');
eq(s.seeds.potato, 2, '换到土豆种子');
ok(!(await p.evaluate(() => __MOSS__.seasonStockReady())), '同一季不能再交第二次');
ok(!(await p.evaluate(() => __MOSS__.completeSeasonStock())), '重复交付被拒绝');
ok(!(await p.evaluate(() => __MOSS__.completeSeasonStock())) , '连点也不会重复发奖');

await p.evaluate(() => { __MOSS__.state.inventory.potato = 3; });
await p.evaluate(() => { __MOSS__.state.totalDay = 29; });   // 换季到夏
ok(await p.evaluate(() => __MOSS__.seasonStockReady()), '换季后出现新的备货单');
ok(await p.evaluate(() => __MOSS__.completeSeasonStock()), '夏季备货可以交付');
s = await snap();
eq(s.stock.seasonIdx, 1, '备货记录推进到夏季');
eq(s.seeds.potato, 5, '夏季换到土豆种子（春季那份 2 份仍在背包里）');

/* 冬天的备货给开春留种：冬天不能种，这是唯一来源 */
await p.evaluate(() => { const M = __MOSS__; M.state.totalDay = 85; M.state.inventory.wood = 4; });
eq((await snap()).season, '冬', '第 85 天进入冬季');
ok(await p.evaluate(() => __MOSS__.completeSeasonStock()), '冬季整地备货可以交付');
s = await snap();
eq(s.seeds.radish, 5, '冬季备货给出开春的萝卜种');
eq(s.stock.count, 3, '三季各交过一次');

/* ---------- 6. 存档往返幂等 + 旧档缺字段 ---------- */
const round = await p.evaluate(() => {
  const raw = __MOSS__.serialize();
  const live = JSON.parse(JSON.stringify(__MOSS__.seasonStockState()));
  const a = __MOSS__.normalizeSaveForTest(raw);
  const b = __MOSS__.normalizeSaveForTest(a);
  const missing = __MOSS__.serialize();
  delete missing.seasonStock;
  const fresh = __MOSS__.normalizeSeasonStock(undefined);
  const bad = __MOSS__.normalizeSeasonStock({ year: 9, seasonIdx: 77, count: -3 });
  return {
    live: live, saved: a.seasonStock, a: a.seasonStock, b: b.seasonStock,
    old: __MOSS__.normalizeSaveForTest(missing).seasonStock,
    fresh: fresh, bad: bad,
  };
});
eq(round.saved, round.live, '季节备货真的写进了存档，不只是运行时字段');
eq(round.b, round.a, '季节备货存档归一化往返幂等');
eq(round.old, { year: 0, seasonIdx: -1, count: 0 }, '旧档整段缺这个键时补一份新的');
eq(round.fresh, { year: 0, seasonIdx: -1, count: 0 }, '旧档缺字段归一化为未交付');
eq(round.bad, { year: 9, seasonIdx: 3, count: 0 }, '越界季节序号夹到合法范围，负数归零');

/* ---------- 7. 界面上真的看得见 ---------- */
await p.evaluate(() => { const M = __MOSS__; M.state.totalDay = 26; M.openShop(); });
ok(await p.locator('.win').getByText('距本季结束还有', { exact: false }).count(), '种子铺显示距本季结束天数');
ok(await p.locator('.win').getByText('应季', { exact: true }).count(), '当季种子标记为应季');
ok(await p.locator('.win').getByText('可下种季节：', { exact: false }).count(), '每行写明可下种季节');
ok(await p.locator('.win').getByText('春播备货', { exact: false }).count(), '种子铺显示本季备货单');

/* 冬天：没有应季标签，备货单换成冬田整地，并写明还差什么 */
await p.evaluate(() => {
  const M = __MOSS__;
  M.state.totalDay = 85;
  M.state.inventory.wood = 0;
  M.state.seasonStock = { year: 1, seasonIdx: 0, count: 1 };   // 只交过春季，冬季这份还在
  M.openShop();
});
ok(!(await p.locator('.win').getByText('应季', { exact: true }).count()), '冬天没有应季标记');
ok(await p.locator('.win').getByText('冬田整地', { exact: false }).count(), '冬天显示冬田整地备货');
ok(await p.locator('.win').getByText('本季不宜下种', { exact: false }).count(), '冬天写明本季不宜下种而不是留空');
ok(await p.locator('.win').getByText('还差：木材', { exact: false }).count(), '备货材料不足时写明还差什么');

eq(r.errors, [], '季节流程无浏览器异常');
await r.browser.close();
console.log(`R4 季节首轮 ${checks} 项通过${single ? '（单文件）' : ''}`);
