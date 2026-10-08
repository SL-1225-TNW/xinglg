import { launch, boot } from './harness.mjs';

/* §32.2 土壤肥力/轮作 端到端审计
   纯逻辑测试只验证函数本身；这里在真实浏览器里驱动游戏，
   验证「存档→操作→每日结算→产量→UI 数据」的完整链路。 */
const { browser, page, errors } = await launch();
let fails = 0;
const t = (n, ok, note = '') => { console.log(`  ${ok ? '✓' : '✗'} ${n}${note ? '  → ' + note : ''}`); if (!ok) fails++; };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  // ---- 1. 开垦初始化 ----
  console.log('=== 开垦初始化 ===');
  const till = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    M.devSwitchScene('farm', 8, 5);
    const ok = M.devFarm.hoe(8, 5);
    const p = s.plots['8,5'];
    return {
      ok, has: !!p,
      f: p ? p.fertility : null, def: M.devFert.def(),
      lg: p ? p.lastGroup : 'MISSING', pg: p ? p.prevGroup : 'MISSING',
    };
  });
  t('开垦成功并创建地块', till.ok === true && till.has, `hoe=${till.ok}`);
  t('初始肥力 = FERT.DEF', till.f === till.def, `${till.f} (DEF=${till.def})`);
  t('DEF 落在「适宜」档（不追溯处罚）', (await page.evaluate(() => window.__MOSS__.devFert.tier(8, 5))).label === '适宜');
  t('lastGroup/prevGroup 初始为 null', till.lg === null && till.pg === null, `last=${till.lg} prev=${till.pg}`);

  // ---- 2. 播种写入组别 ----
  console.log('\n=== 播种与轮作组 ===');
  const seedRes = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const cid = 'radish';
    s.inventory = s.inventory || {};
    s.inventory[M.CROPS[cid].seed] = 5;
    const ok = M.devFarm.seed(8, 5, cid);
    const p = s.plots['8,5'];
    return { ok, crop: p.crop, lg: p.lastGroup, pg: p.prevGroup, group: M.devFert.groupOf(cid) };
  });
  t('播种成功', seedRes.ok === true, `crop=${seedRes.crop}`);
  t('lastGroup = 萝卜所属组', seedRes.lg === seedRes.group, `lastGroup=${seedRes.lg} (${seedRes.group})`);
  t('首种 prevGroup = null', seedRes.pg === null);

  // ---- 3. 同组连作 → 下降 ----
  console.log('\n=== 每日结算：同组连作 ===');
  const decay = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    p.prevGroup = p.lastGroup;          // 构造连作
    const before = p.fertility;
    const d = M.devFert.applyDaily(8, 5);
    return { before, after: p.fertility, d, rate: M.devFert.rate() };
  });
  t('同组连作每日 -2', decay.d === decay.rate.sameGroup, `${decay.before} → ${decay.after} (Δ${decay.d})`);
  t('肥力不会跌破 0', decay.after >= 0);

  // ---- 4. 换组 / 休耕恢复 ----
  console.log('\n=== 换组与休耕恢复 ===');
  const rec = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    const out = {};
    const groups = Object.keys(M.devFert.groups());
    p.fertility = 50;
    p.prevGroup = groups.find(g => g !== p.lastGroup) || 'root';
    p.crop = 'radish';
    out.diff = M.devFert.applyDaily(8, 5);
    out.afterDiff = p.fertility;
    p.crop = null; p.fertility = 50;    // 休耕
    out.fallow = M.devFert.applyDaily(8, 5);
    out.afterFallow = p.fertility;
    out.rate = M.devFert.rate();
    return out;
  });
  t('换组每日 +1', rec.diff === rec.rate.diffGroup, `50 → ${rec.afterDiff}`);
  t('休耕每日 +3', rec.fallow === rec.rate.fallow, `50 → ${rec.afterFallow}`);

  // ---- 5. 边界夹紧 ----
  console.log('\n=== 上下限夹紧 ===');
  const cl = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    p.crop = null; p.fertility = 100;
    const atMax = M.devFert.applyDaily(8, 5);
    const maxAfter = p.fertility;
    p.fertility = 0;
    const atMin = M.devFert.applyDaily(8, 5);
    return { atMax, maxAfter, atMin, minAfter: p.fertility };
  });
  t('肥力 100 休耕不再涨（上限夹紧）', cl.atMax === 0 && cl.maxAfter === 100, `Δ=${cl.atMax} → ${cl.maxAfter}`);
  t('肥力 0 休耕能回升', cl.atMin === 3 && cl.minAfter === 3, `0 → ${cl.minAfter}`);

  // ---- 6. 产量影响 ----
  console.log('\n=== 产量影响（低肥力减产，保底 1 个）===');
  const yld = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = {};
    ['radish', 'potato', 'strawberry'].forEach(cid => {
      const c = M.CROPS[cid];
      out[cid] = {
        name: c.name, base: c.yield, sell: c.sell,
        fLow: M.devFert.yieldFactor(0),
        fGood: M.devFert.yieldFactor(60),
        fHigh: M.devFert.yieldFactor(100),
        yLow: Math.max(1, Math.floor(c.yield * M.devFert.yieldFactor(0))),
        yDef: Math.max(1, Math.floor(c.yield * M.devFert.yieldFactor(60))),
        yHigh: Math.max(1, Math.floor(c.yield * M.devFert.yieldFactor(100))),
      };
    });
    return out;
  });
  Object.keys(yld).forEach(cid => {
    const c = yld[cid];
    t(`${c.name}：三档产量可区分（低${c.yLow} < 默认${c.yDef} < 充足${c.yHigh}）`,
      c.yLow < c.yDef && c.yDef < c.yHigh, `基础${c.base} 系数 ${c.fLow}/${c.fGood}/${c.fHigh}`);
    t(`${c.name}：低肥力保底 1 个（不会颗粒无收）`, c.yLow >= 1);
  });
  const rad = yld.radish;
  t('默认肥力（60）下收入与旧版一致（经济中性）',
    rad.yDef * rad.sell === 18, `萝卜 2×${rad.sell}=${rad.yDef * rad.sell}，旧版 1×18=18`);

  // ---- 7. 真实收获：低肥力实收 ----
  console.log('\n=== 真实收获：低肥力实收减产 ===');
  const harvest = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    const c = M.CROPS['radish'];
    p.crop = 'radish'; p.age = c.growDays; p.mature = true; p.water = true;
    p.fertility = 5;                              // 低肥力
    s.inventory = s.inventory || {};
    s.inventory[c.produce] = 0;
    const before = s.inventory[c.produce] || 0;
    const ok = M.devFarm.harvest(8, 5);
    const low = (s.inventory[c.produce] || 0) - before;
    // 再来一次：充足肥力
    M.devFarm.hoe(8, 5);
    M.devFarm.seed(8, 5, 'radish');
    const p2 = s.plots['8,5'];
    p2.crop = 'radish'; p2.age = c.growDays; p2.mature = true; p2.water = true;
    p2.fertility = 100;
    s.inventory[c.produce] = 0;
    const ok2 = M.devFarm.harvest(8, 5);
    const high = (s.inventory[c.produce] || 0) - 0;
    return { ok, low, ok2, high, base: c.yield };
  });
  t('低肥力收获成功但少于充足肥力', harvest.ok === true && harvest.ok2 === true && harvest.low < harvest.high,
    `低肥力 ${harvest.low} / 充足 ${harvest.high}（基础 ${harvest.base}）`);

  // ---- 8. 农务总览 ----
  console.log('\n=== 农务总览 ===');
  const ov = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    M.devFarm.hoe(9, 5);
    p.crop = 'radish'; p.mature = false; p.harvested = false; p.water = false; p.fertility = 60;
    const o = M.devFert.overview();
    return { needWater: o.needWater, ripe: o.ripe, seedShort: o.seedShort, any: o.any, line: M.devFert.overviewLine() };
  });
  t('识别出缺水作物', ov.needWater >= 1, `needWater=${ov.needWater}`);
  t('总览一句话非空', !!ov.line, ov.line);

  // ---- 9. ETA（不假设未来浇水）----
  console.log('\n=== 预计收获日：缺水不给虚假日期 ===');
  const eta = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state, p = s.plots['8,5'];
    const c = M.CROPS['radish'];
    p.crop = 'radish'; p.mature = false; p.harvested = false; p.age = 1;
    p.water = false;
    const dry = M.devFert.eta(8, 5);
    p.water = true;
    const wet = M.devFert.eta(8, 5);
    p.mature = true;
    const ripe = M.devFert.eta(8, 5);
    return { dry, wet, ripe, growDays: c.growDays };
  });
  t('缺水时标记 needsWater', eta.dry && eta.dry.needsWater === true, eta.dry && eta.dry.text);
  t('缺水时文案不含虚假的确信日期', eta.dry && /不浇水|还没浇水/.test(eta.dry.text), eta.dry && eta.dry.text);
  t('已浇水时给出剩余天数', eta.wet && eta.wet.needsWater !== true && /还需/.test(eta.wet.text), eta.wet && eta.wet.text);
  t('已成熟时说「现在就能收获」', eta.ripe && /现在就能收获/.test(eta.ripe.text), eta.ripe && eta.ripe.text);

  // ---- 10. 旧档迁移 ----
  console.log('\n=== 旧档迁移（不追溯处罚）===');
  const mig = await page.evaluate(() => {
    const M = window.__MOSS__;
    // 完全模拟一个"功能上线前"的存档：没有任何肥力字段
    const oldPlots = {
      '6,4': { tilled: true, water: true, crop: 'radish', age: 2, mature: false, harvested: false, regrow: 0 },
      '7,4': { tilled: true, water: false, crop: 'potato', age: 1, mature: true, harvested: true, regrow: 2 },
      '8,4': { tilled: true, water: false, crop: null, age: 0, mature: false, harvested: false, regrow: 0 },
    };
    const out = M.devFert.sanitize(oldPlots);
    return {
      '6,4': out['6,4'], '7,4': out['7,4'], '8,4': out['8,4'],
      hasExtraKeys: Object.values(out).some(v => Object.keys(v).some(k => k.startsWith('_'))),
    };
  });
  t('有作物地块迁移到 DEF', mig['6,4'].fertility === 60 && mig['7,4'].fertility === 60, `6,4=${mig['6,4'].fertility} 7,4=${mig['7,4'].fertility}`);
  t('空地也迁移到 DEF', mig['8,4'].fertility === 60);
  t('有作物时补出 lastGroup（轮作提示才能生效）', mig['6,4'].lastGroup === 'leaf' && mig['7,4'].lastGroup === 'root',
    `6,4=${mig['6,4'].lastGroup} 7,4=${mig['7,4'].lastGroup}`);
  t('迁移不产生 _ 开头残留字段', mig.hasExtraKeys === false);
  t('prevGroup 缺省为 null（不虚构历史）', mig['6,4'].prevGroup === null);

  // ---- 11. 脏数据清洗 ----
  console.log('\n=== 脏数据清洗 ===');
  const dirty = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = M.devFert.sanitize({
      '6,4': { tilled: true, water: false, crop: 'radish', age: 2, mature: false, harvested: false, regrow: 0, fertility: 9999 },
      '7,4': { tilled: true, water: false, crop: 'radish', age: 2, mature: false, harvested: false, regrow: 0, fertility: -50 },
      '8,4': { tilled: true, water: false, crop: 'radish', age: 2, mature: false, harvested: false, regrow: 0, fertility: NaN },
      '9,4': { tilled: true, water: false, crop: 'radish', age: 2, mature: false, harvested: false, regrow: 0, fertility: 'abc', prevGroup: 'bogus' },
    });
    return {
      hi: out['6,4'].fertility, lo: out['7,4'].fertility, nan: out['8,4'].fertility,
      str: out['9,4'].fertility, badGroup: out['9,4'].prevGroup,
    };
  });
  t('超上限值夹到 100', dirty.hi === 100, String(dirty.hi));
  t('负值夹到 0', dirty.lo === 0, String(dirty.lo));
  t('NaN 退回 DEF', dirty.nan === 60, String(dirty.nan));
  t('非数值退回 DEF', dirty.str === 60, String(dirty.str));
  t('非法 prevGroup 被丢弃', dirty.badGroup === null, String(dirty.badGroup));

  // ---- 12. 结算真的把肥力写进收成记录 ----
  console.log('\n=== 结算摘要与收成记录 ===');
  const hist = await page.evaluate(async () => {
    const M = window.__MOSS__, s = M.state;
    const p = s.plots['8,5'];
    p.crop = 'radish'; p.lastGroup = 'leaf'; p.prevGroup = 'leaf';
    p.water = true; p.mature = false; p.harvested = false; p.age = 1; p.fertility = 60;
    const before = (s.settleHistory || []).length;
    M.devFarm.settle(false);
    // 结算会弹窗，等它渲染完
    await new Promise(r => setTimeout(r, 400));
    const list = s.settleHistory || [];
    const last = list[list.length - 1] || null;
    return {
      grew: list.length > before, last,
      f: p.fertility,
      hasFertKey: last ? ('fertGained' in last && 'fertLost' in last && 'fertLow' in last) : false,
    };
  });
  t('结算写入了新的一条收成记录', hist.grew === true);
  t('肥力字段进入 settleHistory（回看页用得到）', hist.hasFertKey === true,
    hist.last ? `gained=${hist.last.fertGained} lost=${hist.last.fertLost} low=${JSON.stringify(hist.last.fertLow)}` : 'no record');
  t('结算确实扣了同组连作的肥力', hist.last ? hist.last.fertLost >= 2 : false,
    hist.last ? `60 → ${hist.f} (lost=${hist.last.fertLost})` : '');

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错:\n  ' + e2.slice(0, 5).join('\n  ') : '\n零运行时报错');
  console.log(fails ? `\n✗ 失败 ${fails} 项` : '\n✓ 全部通过');
} catch (e) {
  console.error('崩溃:', e.stack || e.message);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
