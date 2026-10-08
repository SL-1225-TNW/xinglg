/* 32.6 集市每周轮换且可预览
   总规原文：「保留种子店、任务板与原有居民，增加每周轮换但可预览的集市」

   验收重点：
   - 种子铺 3 种常售不受轮换影响（原文说"保留"，不是替换）
   - 货单按 7 天一周确定性轮换，同一周号永远同一份货
   - 可预览下周：预览与实际售卖必须一致，不能只是"看起来像"
   - 买不到的货不能成交（不在本周货单上）
   - 集市是新增设施，须有真实小镇入口
*/
import { launch, boot, Report } from './harness.mjs';

const r = new Report();
const t = (name, cond, detail) => r.ok(name, cond, JSON.stringify(detail));

const { browser, page } = await launch();
try {
  await boot(page, { fresh: true });
  await page.locator('#tutorialSkip').click().catch(() => { });

  // ---------- 1. 种子铺边界不被破坏 ----------
  console.log('\n=== 1. 种子铺仍常售 3 种 ===');
  const shop = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.openShop();
    const wins = document.querySelectorAll('.win').length;
    const txt = wins ? document.querySelector('.win').innerText : '';
    return { wins, txt };
  });
  t('种子铺窗口能打开', shop.wins > 0, { wins: shop.wins });
  t('种子铺仍卖萝卜种子', /萝卜种子/.test(shop.txt), shop.txt.slice(0, 100));
  t('种子铺仍卖土豆种子', /土豆种子/.test(shop.txt));
  t('种子铺仍卖草莓种子', /草莓种子/.test(shop.txt));
  await page.evaluate(() => window.__MOSS__.closeWin && window.__MOSS__.closeWin());

  // ---------- 2. 周的定义 ----------
  console.log('\n=== 2. 周期 ===');
  const days = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = [];
    for (let d = 1; d <= 15; d++) {
      M.state.totalDay = d;
      out.push({ d, w: M.devMarket.week(), left: M.devMarket.daysLeft() });
    }
    return out;
  });
  t('第 1~7 天同属第 1 周', days.slice(0, 7).every(x => x.w === 1), days.slice(0, 7));
  t('第 8~14 天同属第 2 周', days.slice(7, 14).every(x => x.w === 2), days.slice(7, 14));
  t('第 15 天进入第 3 周', days[14].w === 3, days[14]);
  t('换货倒计时 7→1 循环',
    days.slice(0, 7).map(x => x.left).join(',') === '7,6,5,4,3,2,1',
    days.slice(0, 7).map(x => x.left));

  // ---------- 3. 确定性轮换 ----------
  console.log('\n=== 3. 确定性轮换 ===');
  const determinism = await page.evaluate(() => {
    const M = window.__MOSS__;
    const a = M.devMarket.stock(3).items.map(i => i.id).join(',');
    const b = M.devMarket.stock(3).items.map(i => i.id).join(',');
    return { a, b, same: a === b };
  });
  t('同一周号算出同一份货（预览不会与实际脱节）', determinism.same, determinism);

  const varies = await page.evaluate(() => {
    const M = window.__MOSS__;
    const seen = {}, dup = [];
    for (let w = 1; w <= 8; w++) {
      const k = M.devMarket.stock(w).items.map(i => i.id).join(',');
      if (seen[k]) dup.push([seen[k], w]);
      seen[k] = w;
    }
    return { dup, weeks: Object.keys(seen).length };
  });
  t('连续 8 周货单确实在变', varies.dup.length === 0 && varies.weeks === 8, varies);

  const noDupInWeek = await page.evaluate(() => {
    const M = window.__MOSS__;
    let bad = [];
    for (let w = 1; w <= 12; w++) {
      const ids = M.devMarket.stock(w).items.map(i => i.id);
      if (new Set(ids).size !== ids.length) bad.push({ w, ids });
    }
    return bad;
  });
  t('同一周内没有重复商品', noDupInWeek.length === 0, noDupInWeek.slice(0, 3));

  const noDupGroup = await page.evaluate(() => {
    const M = window.__MOSS__;
    let bad = [];
    for (let w = 1; w <= 12; w++) {
      const g = M.devMarket.stock(w).items.map(i => i.group);
      if (new Set(g).size !== g.length) bad.push({ w, g });
    }
    return bad;
  });
  t('同品类一周只上一次（货架不全是鱼）', noDupGroup.length === 0, noDupGroup.slice(0, 3));

  // ---------- 4. 货单合法 ----------
  console.log('\n=== 4. 货单合法性 ===');
  const valid = await page.evaluate(() => {
    const M = window.__MOSS__;
    let bad = [];
    for (let w = 1; w <= 12; w++) {
      M.devMarket.stock(w).items.forEach(it => {
        if (!M.ITEMS[it.id]) bad.push({ w, id: it.id, why: 'ITEMS 无此物' });
        else if (!(it.price > 0)) bad.push({ w, id: it.id, why: '价格非正', price: it.price });
        else if (it.price < M.ITEMS[it.id].sell) bad.push({ w, id: it.id, why: '集市价低于日常售价' });
      });
    }
    return bad;
  });
  t('货单物品都存在、价格为正且高于白送', valid.length === 0, valid.slice(0, 4));

  const slots = await page.evaluate(() => {
    const M = window.__MOSS__;
    return [1, 2, 3, 4].map(w => M.devMarket.stock(w).items.length);
  });
  t('每周固定 5 个货位', slots.every(n => n === 5), slots);

  // ---------- 5. 买入 ----------
  console.log('\n=== 5. 买入 ===');
  const buy = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.totalDay = 3;
    const cur = M.devMarket.cur();
    const it = cur.items[0];
    M.state.coins = 100000;
    const invBefore = M.invCount(it.id);
    const ok = M.devMarket.buy(it.id, 2);
    return { id: it.id, price: it.price, ok, invBefore, invAfter: M.invCount(it.id), coins: M.state.coins };
  });
  t('买入本周在售商品成功', buy.ok, buy);
  t('按单价扣钱（2 份 = 单价×2）', buy.coins === 100000 - buy.price * 2, buy);
  t('商品进背包且数量正确', buy.invAfter === buy.invBefore + 2, buy);

  const notListed = await page.evaluate(() => {
    const M = window.__MOSS__;
    const cur = M.devMarket.cur();
    // 找一件本周不在货单上的可售物
    let all = [];
    for (let w = 1; w <= 8; w++) M.devMarket.stock(w).items.forEach(i => all.push(i.id));
    const missing = all.find(id => !cur.items.some(i => i.id === id)) ||
      Object.keys(M.ITEMS).find(id => M.ITEMS[id].sell > 0 && !cur.items.some(i => i.id === id));
    M.state.coins = 100000;
    const coinsBefore = M.state.coins;
    const ok = M.devMarket.buy(missing, 1);
    return { id: missing, ok, unchanged: M.state.coins === coinsBefore };
  });
  t('本周不在货单上的商品买不到', notListed.ok === false, notListed);
  t('买不到时不扣钱', notListed.unchanged, notListed);

  const poor = await page.evaluate(() => {
    const M = window.__MOSS__;
    const it = M.devMarket.cur().items[0];
    M.state.coins = 1;
    const before = M.invCount(it.id);
    const ok = M.devMarket.buy(it.id, 1);
    return { ok, same: M.invCount(it.id) === before, coins: M.state.coins };
  });
  t('金币不足拒绝成交', poor.ok === false && poor.same && poor.coins === 1, poor);

  // ---------- 6. 可预览：预览与实际必须一致 ----------
  console.log('\n=== 6. 预览 = 实际 ===');
  const previewMatch = await page.evaluate(() => {
    const M = window.__MOSS__;
    const results = [];
    for (let w = 1; w <= 8; w++) {
      const nxt = M.devMarket.stock(w + 1);
      // 把日期设到第 w+1 周，货单必须与预告的完全一致
      M.state.totalDay = (w) * 7 + 1;
      const actual = M.devMarket.cur();
      results.push({
        w,
        preview: nxt.items.map(i => i.id + '@' + i.price).join(','),
        actual: actual.items.map(i => i.id + '@' + i.price).join(','),
        weekPreview: nxt.week, weekActual: actual.week
      });
    }
    return results;
  });
  const mismatch = previewMatch.filter(x => x.preview !== x.actual || x.weekPreview !== x.weekActual);
  t('8 周全部：预告货单与当天实际货单逐项一致', mismatch.length === 0, mismatch.slice(0, 3));

  // ---------- 7. 真实入口 ----------
  console.log('\n=== 7. 小镇集市入口 ===');
  const entry = await page.evaluate(() => {
    const M = window.__MOSS__;
    const it = (M.INTERACTABLES.town || []).find(i => i.kind === 'market');
    return { found: !!it, it: it || null };
  });
  t('集市已注册为小镇可交互物', entry.found, entry.it);

  const opened = await page.evaluate(() => {
    const M = window.__MOSS__;
    const it = (M.INTERACTABLES.town || []).find(i => i.kind === 'market');
    M.activateInteractable(it);
    return { wins: document.querySelectorAll('.win').length };
  });
  t('点击集市能打开窗口（真实入口可用）', opened.wins > 0, opened);

  const txt = opened.wins ? await page.locator('.win').first().innerText() : '';
  t('窗口写明当前第几周', /第\s*\d+\s*周/.test(txt), txt.slice(0, 120));
  t('窗口有下周预告', /下周预告/.test(txt), txt.slice(0, 200));
  t('窗口写出距换货天数', /换货还有\s*\d+\s*天/.test(txt), txt.slice(0, 120));

  const listedNames = await page.evaluate(() => {
    const M = window.__MOSS__;
    return M.devMarket.cur().items.map(i => M.ITEMS[i.id].name);
  });
  const allShown = listedNames.every(n => txt.includes(n));
  t('本周每件货都在窗口里出现', allShown, { listedNames, missing: listedNames.filter(n => !txt.includes(n)) });

  const nextWeekNames = await page.evaluate(() => {
    const M = window.__MOSS__;
    return M.devMarket.stock(M.devMarket.cur().week + 1).items.map(i => M.ITEMS[i.id].name);
  });
  const nextShown = nextWeekNames.filter(n => txt.includes(n)).length;
  t('下周预告的商品也在窗口里（可预览）', nextShown > 0, { nextWeekNames, nextShown });

  const errs = await page.evaluate(() => window.__consoleErrors || []);
  t('打开集市无控制台报错', errs.length === 0, errs);
} catch (e) {
  t('脚本执行异常', false, String(e).slice(0, 300));
} finally {
  r.summary();
  await browser.close();
}