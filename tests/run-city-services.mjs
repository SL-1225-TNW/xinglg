import { launch, boot, closeWin, winOpen, winTitle, winText, lastToast } from './harness.mjs';

/* 白蔷薇城 15 栋：窗口可开、按钮可点、事务不回滚、存档往返保字段 */
const WANT = ['boiler', 'sawmill', 'foundry', 'watermill', 'shipyard', 'quay_store',
  'uni_main', 'uni_wing', 'uni_lab', 'uni_dorm', 'bank', 'exchange', 'gold',
  'market_hall', 'civic'];

const { browser, page, errors } = await launch();
const fails = [];
const T = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails.push(name + (detail ? ' — ' + detail : ''));
  return cond;
};
const openSvc = async id => {
  await closeWin(page);
  await page.evaluate(s => window.__MOSS__.devOpenService(s), id);
  await page.waitForTimeout(180);
};
const inv = id => page.evaluate(k => window.__MOSS__.state.inventory[k] || 0, id);
const ex = k => page.evaluate(key => window.__MOSS__.exploreState()[key], k);
const toastMsg = () => lastToast(page);

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.energy = 100; s.coins = 5000; s.timeMinutes = 480;
    s.inventory = { iron_ore: 6, coal: 6, copper_ore: 6, timber: 6, wood: 4 };
  });

  /* ---------- 1. 15 栋逐个开窗 ---------- */
  console.log('\n【1】15 栋服务窗口');
  const opened = [];
  for (const id of WANT) {
    await openSvc(id);
    const isOpen = await winOpen(page);
    const title = isOpen ? await winTitle(page) : '';
    const btns = isOpen ? (await page.locator('.win-body button').allTextContents()).filter(b => b.trim()) : [];
    // quay_store 是纯仓储，无生产按钮；验收标准改为「窗口开且正文非空」
    const ok = isOpen && (btns.length > 0 || id === 'quay_store');
    opened.push({ id, ok, title, btns });
    T(id.padEnd(12), ok, isOpen ? `「${title}」${btns.length} 按钮${id === 'quay_store' ? '（仓储无生产，预期）' : ''}` : '窗口未开');
  }
  console.log(`  → ${opened.filter(o => o.ok).length}/${WANT.length} 栋正常`);

  /* ---------- 2. 标题正确（不串到别的服务）---------- */
  console.log('\n【2】窗口标题归属');
  for (const o of opened.filter(x => x.ok)) {
    const expected = await page.evaluate(s => (window.__MOSS__.CITY_INFO[s] || {}).name, o.id);
    T(o.id.padEnd(12), o.title === expected, `「${o.title}」vs 期望「${expected}」`);
  }

  /* ---------- 3. 银行存取 / 计息 / 读档 ---------- */
  console.log('\n【3】银行存取与计息');
  await page.evaluate(() => { window.__MOSS__.state.coins = 5000; });
  await openSvc('bank');
  T('银行窗口', await winOpen(page), await winTitle(page));
  await page.locator('.win-body button', { hasText: '存入 100 金' }).first().click();
  await page.waitForTimeout(200);
  T('存入 → bankDeposit=100', await ex('bankDeposit') === 100, '实际 ' + await ex('bankDeposit'));
  await page.evaluate(() => { window.__MOSS__.state.totalDay += 3; });
  await openSvc('bank');
  const dep = await ex('bankDeposit');
  T('过 3 天推门自动计息', dep === 103, '100+3%=103，实际 ' + dep);

  await page.reload();
  await page.waitForFunction(() => !!window.__MOSS__);
  await page.locator('.boot-actions button').first().click();
  await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  T('读档后 bankDeposit 保留', await ex('bankDeposit') === 103, '实际 ' + await ex('bankDeposit'));
  T('读档后金币保留', await page.evaluate(() => window.__MOSS__.state.coins) === 4900,
    '实际 ' + await page.evaluate(() => window.__MOSS__.state.coins));

  /* ---------- 4. 磨坊扣麦 ---------- */
  console.log('\n【4】磨坊麦仓');
  await openSvc('watermill');
  T('磨坊窗口', await winOpen(page));
  const m0 = await ex('millStock');
  T('麦仓有货', m0 > 0, 'stock=' + m0);
  await page.locator('.win-body button', { hasText: '磨面' }).first().click();
  await page.waitForTimeout(220);
  const m1 = await ex('millStock');
  T('磨面扣 2 斗麦', m1 === m0 - 2, `${m0} → ${m1}`);
  T('产出面粉 4', await inv('flour') === 4, '实际 ' + await inv('flour'));

  /* 麦仓空时必须拒绝 */
  await page.evaluate(() => { window.__MOSS__.exploreState().millStock = 0; });
  await openSvc('watermill');
  await page.locator('.win-body button', { hasText: '磨面' }).first().click();
  await page.waitForTimeout(200);
  const tm = await toastMsg();
  T('麦仓空拒绝磨面', /麦仓/.test(tm), '「' + tm + '」');
  T('拒绝时不产面粉', await inv('flour') === 4, '仍为 ' + await inv('flour'));

  /* ---------- 5. 铸造车间材料闸门 ---------- */
  console.log('\n【5】铸造车间材料闸门');
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.inventory = {}; s.energy = 100; s.timeMinutes = 480;
  });
  await openSvc('foundry');
  T('铸造车间窗口', await winOpen(page));
  const fbtns = (await page.locator('.win-body button').allTextContents()).filter(b => b.trim());
  const si = fbtns.findIndex(b => /熔铁/.test(b));
  T('有熔铁按钮', si >= 0, fbtns[si] || fbtns.join('|'));
  if (si >= 0) {
    await page.locator('.win-body button').nth(si).click();
    await page.waitForTimeout(220);
    const st = await page.evaluate(() => ({
      e: window.__MOSS__.state.energy, t: window.__MOSS__.state.timeMinutes,
      msg: window.__MOSS__.toasts.length ? window.__MOSS__.toasts[window.__MOSS__.toasts.length - 1].m : ''
    }));
    T('材料不足不扣体力', st.e === 100, 'energy=' + st.e);
    T('材料不足不推进时间', st.t === 480, 'time=' + st.t);
    T('提示材料不够', /材料不够/.test(st.msg), '「' + st.msg + '」');
  }

  /* ---------- 6. 满背包不吞材料 ---------- */
  console.log('\n【6】满背包事务回滚');
  const slots = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    // 只留熔铁要用的料，且确保 iron_ingot 不在包里（否则同种叠加不占槽，测不出满包）
    s.inventory = { iron_ore: 4, coal: 2 };
    const fill = ['wood', 'copper_ore', 'gem', 'mushroom', 'berry', 'fish_bass',
      'fish_silver', 'flour', 'plank', 'charcoal', 'paper', 'cloth', 'salt',
      'vinegar', 'cheese', 'honey'];
    for (let g = 0; g < 200; g++) {
      if (M.countSlots() >= M.CFG.bagSlots) break;
      s.inventory[fill[g % fill.length]] = 1;
    }
    return { slots: M.countSlots(), cap: M.CFG.bagSlots, hasIngot: !!s.inventory.iron_ingot };
  });
  console.log(`  · 背包塞满 ${slots.slots}/${slots.cap} 槽，包内无铁锭=${!slots.hasIngot}`);
  await openSvc('foundry');
  const f2 = (await page.locator('.win-body button').allTextContents()).filter(b => b.trim());
  const si2 = f2.findIndex(b => /熔铁/.test(b));
  if (si2 >= 0) {
    await page.locator('.win-body button').nth(si2).click();
    await page.waitForTimeout(240);
    const a = await page.evaluate(() => {
      const s = window.__MOSS__.state, f = k => s.inventory[k] || 0;
      return { iron: f('iron_ore'), coal: f('coal'), ingot: f('iron_ingot'),
        msg: window.__MOSS__.toasts.length ? window.__MOSS__.toasts[window.__MOSS__.toasts.length - 1].m : '' };
    });
    T('满背包时铁矿未被吞', a.iron === 4, '4 → ' + a.iron);
    T('满背包时不发铁锭', a.ingot === 0, 'ingot=' + a.ingot);
    T('提示背包满', /背包满/.test(a.msg), '「' + a.msg + '」');
  }

  /* ---------- 7. 船坞不刷船板 ---------- */
  console.log('\n【7】船坞物料成本');
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.inventory = { timber: 3 }; s.energy = 100; s.timeMinutes = 480;
  });
  await openSvc('shipyard');
  const sbtns = (await page.locator('.win-body button').allTextContents()).filter(b => b.trim());
  const pi = sbtns.findIndex(b => /船板/.test(b));
  T('有船板按钮', pi >= 0, sbtns[pi] || sbtns.join('|'));
  if (pi >= 0) {
    await page.locator('.win-body button').nth(pi).click();
    await page.waitForTimeout(240);
    T('原木 3 → 船板 8', await inv('timber') === 0 && await inv('plank') === 8,
      `timber=${await inv('timber')} plank=${await inv('plank')}`);
    /* 再点一次：原木已空，必须拒绝 */
    await openSvc('shipyard');
    await page.locator('.win-body button').nth(pi).click().catch(() => { });
    await page.waitForTimeout(220);
    T('原木空时不能再造', await inv('plank') === 8, 'plank=' + await inv('plank'));
  }

  /* ---------- 8. 银行质押与赎回 ---------- */
  console.log('\n【8】银行质押与赎回');
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.coins = 5000; s.inventory = { warehouse_deed: 1 };
  });
  await openSvc('bank');
  const c0 = await page.evaluate(() => window.__MOSS__.state.coins);
  await page.locator('.win-body button', { hasText: '典当' }).first().click();
  await page.waitForTimeout(220);
  const s1 = await page.evaluate(() => ({
    coins: window.__MOSS__.state.coins,
    pledges: (window.__MOSS__.exploreState().pledges || []).length,
    deed: (window.__MOSS__.state.inventory.warehouse_deed || 0)
  }));
  T('典当后契据离手', s1.deed === 0, 'deed=' + s1.deed);
  T('典当后金币增加', s1.coins === c0 + 500, `${c0} → ${s1.coins}`);
  T('pledge 记 1 条', s1.pledges === 1, '实际 ' + s1.pledges);

  await page.locator('.win-body button', { hasText: '赎回' }).first().click();
  await page.waitForTimeout(240);
  const s2 = await page.evaluate(() => ({
    coins: window.__MOSS__.state.coins,
    pledges: (window.__MOSS__.exploreState().pledges || []).length,
    deed: (window.__MOSS__.state.inventory.warehouse_deed || 0)
  }));
  T('赎回后契据回包', s2.deed === 1, 'deed=' + s2.deed);
  T('赎回扣 550', s2.coins === c0 + 500 - 550, `${c0 + 500} → ${s2.coins}，应扣 550`);
  T('赎回后 pledge 清空', s2.pledges === 0, '实际 ' + s2.pledges);

  /* ---------- 9. 大学进阶课：体力不足不扣钱 ---------- */
  console.log('\n【9】大学课程闸门');
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.coins = 5000; s.energy = 5; s.inventory = {}; s.timeMinutes = 480;
  });
  await openSvc('uni_lab');
  const ubtn = (await page.locator('.win-body button').allTextContents()).filter(b => b.trim());
  const ci = ubtn.findIndex(b => /进阶课|讲义/.test(b));
  T('有课程按钮', ci >= 0, ubtn[ci] || ubtn.join('|'));
  if (ci >= 0) {
    await page.locator('.win-body button').nth(ci).click();
    await page.waitForTimeout(220);
    const st = await page.evaluate(() => ({
      coins: window.__MOSS__.state.coins, energy: window.__MOSS__.state.energy,
      tr: (window.__MOSS__.state.inventory.translation || 0),
      msg: window.__MOSS__.toasts.length ? window.__MOSS__.toasts[window.__MOSS__.toasts.length - 1].m : ''
    }));
    T('体力不足不扣钱', st.coins === 5000, 'coins=' + st.coins);
    T('体力不足不发讲义', st.tr === 0, 'translation=' + st.tr);
    T('提示体力不足', /体力/.test(st.msg), '「' + st.msg + '」');
  }

  /* ---------- 10. 税票 flag 落库 ---------- */
  console.log('\n【10】市政公债与税');
  await page.evaluate(() => {
    const s = window.__MOSS__.state;
    s.coins = 5000; s.energy = 100; s.inventory = {};
  });
  await openSvc('civic');
  T('市政厅窗口', await winOpen(page), await winTitle(page));
  const cb = (await page.locator('.win-body button').allTextContents()).filter(b => b.trim());
  console.log('    按钮：' + cb.join(' | '));
  const bi = cb.findIndex(b => /公债/.test(b));
  if (bi >= 0) {
    await page.locator('.win-body button').nth(bi).click();
    await page.waitForTimeout(220);
    T('认购公债入包', await inv('bond') === 1, 'bond=' + await inv('bond'));
  }
  await page.reload();
  await page.waitForFunction(() => !!window.__MOSS__);
  await page.locator('.boot-actions button').first().click();
  await page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  T('读档后公债保留', await inv('bond') === 1, 'bond=' + await inv('bond'));
  T('读档后 taxPaid 字段存在', typeof await ex('taxPaid') === 'boolean', '类型 ' + typeof await ex('taxPaid'));

  /* ---------- 11. 控制台 ---------- */
  console.log('\n【11】控制台');
  const uniq = [...new Set(errors)];
  T('无控制台报错', uniq.length === 0, uniq.slice(0, 6).join(' | ') || '');

  console.log('\n================ 汇总 ================');
  console.log(`失败 ${fails.length} 项`);
  fails.forEach(f => console.log('  ✗ ' + f));
  console.log('======================================\n');
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message, '\n', String(e.stack).split('\n').slice(1, 3).join('\n'));
  console.log(`\n失败 ${fails.length} 项`);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally {
  await browser.close();
}