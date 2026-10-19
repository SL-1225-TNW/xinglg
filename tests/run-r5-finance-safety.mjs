/* R5-0 经济止血：票据不能即时套利，价格和用途可解释，旧档与在押之物不受损。
 * 真实界面点击市政厅／交易所／金库／银行，不用内部函数伪造交易。
 *   node tests/run-r5-finance-safety.mjs
 *   node tests/run-r5-finance-safety.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winText } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const openSvc = async id => { await closeWin(p); await p.evaluate(s => __MOSS__.devOpenService(s), id); await p.waitForTimeout(180); };
const inv = id => p.evaluate(k => __MOSS__.state.inventory[k] || 0, id);
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const quote = id => p.evaluate(k => JSON.parse(JSON.stringify(__MOSS__.BILL_QUOTES[k])), id);
const btnTexts = () => p.locator('.win-body button').allTextContents().then(a => a.map(s => s.trim()).filter(Boolean));
async function clickBtn(re) {
  const list = await btnTexts();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `界面上找不到按钮 ${re}，现有：${list.join(' | ')}`);
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(200);
  return list[i];
}
const hasBtn = async re => (await btnTexts()).some(b => re.test(b));
/* 清成可重复的干净起点：金币、背包、票据批次、在押之物一起归零 */
async function reset(c = 20000, bag = {}) {
  await p.evaluate(([cc, bb]) => {
    const M = __MOSS__, s = M.state;
    s.coins = cc; s.energy = 100; s.timeMinutes = 480; s.inventory = bb;
    const e = M.exploreState();
    e.billLots = []; e.billTx = []; e.pledges = [];
  }, [c, bag]);
}
/* 立契、开票花的是材料不是金币，按镇价把材料折成金币一起算，
 * 否则只看金币会凭空算出"赚了" */
const worth = () => p.evaluate(() => {
  const M = __MOSS__, s = M.state;
  let v = s.coins;
  ['plank', 'copper_ingot', 'flour'].forEach(k => { v += (s.inventory[k] || 0) * (M.ITEMS[k] ? M.ITEMS[k].sell : 0); });
  return v;
});
const reload = async () => {
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
};

/* ---------- 1. 报价表本身守住不变式 ---------- */
console.log('\n【1】单一权威报价的不变式');
const ids = await p.evaluate(() => __MOSS__.BILL_IDS.slice());
eq(ids, ['bill', 'share_cert', 'warehouse_deed', 'bond'], '四种票据都有报价条目');
for (const id of ids) {
  const q = await quote(id);
  ok(Number.isFinite(q.face) && q.face > 0, `${id} 票面 ${q.face} 是正数`);
  ok(q.pledge === 0 || q.pledge <= q.face, `${id} 典当估值 ${q.pledge} 不高于票面 ${q.face}`);
  ok(q.pledge === 0 || q.pledge + Math.floor(q.pledge * 0.1) > q.pledge, `${id} 赎当连本带息，典当来回不赚钱`);
  ok(q.face <= q.cost || q.term > 0,
    `${id} 兑付 ${q.face} 不高于取得成本 ${q.cost}${q.term ? `（兑付须满 ${q.term} 天）` : ''}`);
  ok(q.pledge <= q.cost, `${id} 典当 ${q.pledge} 不高于取得成本 ${q.cost}`);
}
eq(await p.evaluate(() => __MOSS__.BILL_QUOTES.bond.coins), 240, '公债实际收金币 240，与金币当量一致');
eq(await p.evaluate(() => __MOSS__.BILL_QUOTES.share_cert.cost - __MOSS__.BILL_QUOTES.share_cert.coins), 52,
  '股票的金币当量比实收多 52，正好是两份面粉');

/* ---------- 2. 公债：认购后当场不能兑付，当场典当是亏的 ---------- */
console.log('\n【2】公债当场往返');
await reset();
const bond = await quote('bond');
ok(bond.term > 0, '公债带兑付期限');
const cStart = await coins();
const issueLabel = await openSvc('civic').then(() => clickBtn(/认购公债/));
ok(issueLabel.includes(String(bond.coins)), `认购按钮写明发行价 ${bond.coins} 金：「${issueLabel}」`);
eq(await coins(), cStart - bond.coins, '认购按发行价扣钱');
eq(await inv('bond'), 1, '认购后拿到一张公债');
const afterIssue = await coins();

await openSvc('bank');
ok(!await hasBtn(/兑付.*公债/), '未满期不出现公债兑付按钮');
eq(await p.evaluate(() => __MOSS__.billRedeemable('bond')), 0, '可兑付张数为 0');
ok(/还要等|未满期|待兑/.test(await winText(p)), '界面上写明公债未满期、还要等');
const pledgeLabel = await clickBtn(/典当.*公债/);
ok(pledgeLabel.includes(String(bond.pledge)), `典当按钮写明支取 ${bond.pledge} 金：「${pledgeLabel}」`);
eq(await coins(), afterIssue + bond.pledge, '当场典当按典当估值支现');
ok(bond.cost > bond.pledge, '认购后当场典当净收益为负');
eq(await inv('bond'), 0, '典当后公债离手');

/* ---------- 3. 公债满期才可兑付，且按票面付款 ---------- */
console.log('\n【3】公债满期兑付');
/* 上一节把公债典当掉了，先赎回来再算满期倒计时 */
await clickBtn(/赎回.*公债/);
eq(await inv('bond'), 1, '赎回后公债回包');
await p.evaluate(t => { __MOSS__.state.totalDay += t - 1; }, bond.term);
await openSvc('bank');
ok(!await hasBtn(/兑付.*公债/), `差 1 天仍不能兑付（期限 ${bond.term} 天）`);
eq(await p.evaluate(() => __MOSS__.billMaturityWait('bond')), 1, '界面提示还差 1 天');
ok(/还要等/.test(await winText(p)), '正文写明还要等 1 天');
await p.evaluate(() => { __MOSS__.state.totalDay += 1; });
await openSvc('bank');
eq(await p.evaluate(() => __MOSS__.billMaturityWait('bond')), 0, '满期后没有等待天数');
const beforeRedeem = await coins();
const rLabel = await clickBtn(/兑付.*公债/);
ok(rLabel.includes(String(bond.face)), `兑付按钮写明票面 ${bond.face} 金：「${rLabel}」`);
eq(await coins(), beforeRedeem + bond.face, '满期后按票面兑付，不再另加贴水');
eq(await inv('bond'), 0, '兑付后公债离手');

/* ---------- 4. 公债全流程：认购 → 典当 → 赎回 → 满期兑付 ---------- */
console.log('\n【4】公债全流程资金守恒');
await reset();
const base = await coins();
await openSvc('civic'); await clickBtn(/认购公债/);
await openSvc('bank'); await clickBtn(/典当.*公债/);
const pledgeCoins = await coins();
await clickBtn(/赎回.*公债/);
const backCoins = await coins();
ok(backCoins === pledgeCoins - (bond.pledge + Math.floor(bond.pledge * 0.1)),
  `赎回扣本金加一成息：${pledgeCoins} → ${backCoins}`);
eq(await inv('bond'), 1, '赎回后公债回包');
await p.evaluate(t => { __MOSS__.state.totalDay += t; }, bond.term);
await openSvc('bank');
ok(await hasBtn(/兑付.*公债/), '赎回的公债接着原来的持有日算，满期后可兑');
await clickBtn(/兑付.*公债/);
eq(await coins() - base, bond.face - bond.coins - Math.floor(bond.pledge * 0.1),
  '整条往返净收益 ≤ 0，不会凭空多金币');

/* ---------- 5. 货栈契据全流程 ---------- */
console.log('\n【5】货栈契据全流程');
await reset(20000, { plank: 12 });
const deed = await quote('warehouse_deed');
const dBase = await worth();
await openSvc('gold');
const dLabel = await clickBtn(/立货栈契据/);
ok(/立货栈契据/.test(dLabel), `金库能立契：「${dLabel}」`);
eq(await coins(), 20000, '立契不凭空给钱');
ok((await inv('plank')) === 6, `立契扣 6 板材：12 → ${await inv('plank')}`);
eq(await inv('warehouse_deed'), 1, '拿到货栈契据');
await openSvc('bank');
await clickBtn(/典当.*货栈契据/);
await clickBtn(/赎回.*货栈契据/);
await clickBtn(/兑付.*货栈契据/);
ok((await worth()) - dBase <= 0, `立契→典当→赎回→兑付净收益 ${(await worth()) - dBase} ≤ 0（含材料折价）`);
ok(deed.face - deed.cost <= 0, `票面 ${deed.face} 不高于材料当量 ${deed.cost}`);

/* ---------- 6. 商业票据与交易所股票 ---------- */
console.log('\n【6】商业票据与交易所股票');
await reset(20000, { copper_ingot: 6 });
const bill = await quote('bill');
const bBase = await worth();
await openSvc('gold');
await clickBtn(/开商业票据/);
eq(await coins(), 20000, '开票不凭空给钱');
eq(await inv('bill'), 1, '拿到商业票据');
await openSvc('bank');
await clickBtn(/兑付.*商业票据/);
ok((await worth()) - bBase <= 0, `开票→兑付净收益 ${(await worth()) - bBase} ≤ 0（含铜锭折价）`);
ok(bill.cost >= bill.face, `票面 ${bill.face} 不高于铜锭当量 ${bill.cost}`);

await reset(20000, { flour: 4 });
const cert = await quote('share_cert');
const sBase = await worth();
const sCoins = await coins();
await openSvc('exchange');
const sLabel = await clickBtn(/认购股票/);
ok(sLabel.includes(String(cert.coins)), `认购按钮写明实收 ${cert.coins} 金：「${sLabel}」`);
eq(await coins(), sCoins - cert.coins, '认购股票按标价扣金币');
eq(await inv('flour'), 2, '认购股票扣 2 面粉作保');
await openSvc('bank');
await clickBtn(/兑付.*交易所股票/);
ok((await worth()) - sBase <= 0, `认购→兑付净收益 ${(await worth()) - sBase} ≤ 0（含面粉折价）`);

/* ---------- 7. 同一张票据不能既兑付又典当 ---------- */
console.log('\n【7】同一张票据不能重复变现');
await reset(20000, { plank: 12 });
await openSvc('gold'); await clickBtn(/立货栈契据/);
await openSvc('bank');
await clickBtn(/典当.*货栈契据/);
ok(!await hasBtn(/兑付.*货栈契据/), '典当后没有可兑付的同一张契据');
eq(await p.evaluate(() => (__MOSS__.exploreState().pledges || []).length), 1, '在押之物记 1 条');
const pledgeCount = await p.evaluate(() => (__MOSS__.exploreState().pledges || []).length);
await openSvc('bank');
await clickBtn(/典当.*货栈契据/).catch(() => { });
eq(await p.evaluate(() => (__MOSS__.exploreState().pledges || []).length), pledgeCount, '没有实物时重复典当不会多记一笔');

/* ---------- 8. 幂等：连点不重复结算 ---------- */
console.log('\n【8】重复点击幂等');
await reset(20000, { plank: 12 });
await openSvc('gold'); await clickBtn(/立货栈契据/);
await openSvc('bank');
const idemCoins = await coins();
await p.locator('.win-body button', { hasText: '典当货栈契据' }).first().click();
await p.waitForTimeout(120);
await p.locator('.win-body button', { hasText: '典当货栈契据' }).first().click().catch(() => { });
await p.waitForTimeout(200);
eq(await p.evaluate(() => (__MOSS__.exploreState().pledges || []).length), 1, '连点两次典当仍只成立一笔');
eq(await coins(), idemCoins + deed.pledge, '只支取一次典当款');

/* ---------- 9. 交易记录可追溯 ---------- */
console.log('\n【9】票据流水');
const tx = await p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.exploreState().billTx || [])));
ok(tx.length >= 2, `流水有记录（${tx.length} 条）`);
ok(tx.every(t => t.tx && t.item && t.kind && Number.isFinite(t.amt)), '每条流水带事务 ID、票据、处置方式与金额');
ok(tx.some(t => t.kind === 'issue' && t.item === 'warehouse_deed' && /板材/.test(t.src)), '立契记录来源与成本口径');
ok(tx.some(t => t.kind === 'pledge'), '典当留痕');
await openSvc('bank');
await clickBtn(/赎回.*货栈契据/);
const tx2 = await p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.exploreState().billTx || [])));
ok(tx2.some(t => t.kind === 'unpledge'), '赎回留痕');
await clickBtn(/兑付.*货栈契据/);
const tx3 = await p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.exploreState().billTx || [])));
ok(tx3.some(t => t.kind === 'redeem'), '兑付留痕');
ok(tx3.length <= 40, '流水有上限，不会把存档撑爆');

/* ---------- 10. 存档往返 ---------- */
console.log('\n【10】存档往返');
await reset(20000, { plank: 12 });
await openSvc('gold'); await clickBtn(/立货栈契据/);
await p.evaluate(() => { __MOSS__.state.totalDay = 40; __MOSS__.saveNow(); });
const beforeSave = await p.evaluate(() => ({
  coins: __MOSS__.state.coins, deed: __MOSS__.state.inventory.warehouse_deed,
  lots: (__MOSS__.exploreState().billLots || []).filter(L => L.item === 'warehouse_deed')
}));
await reload();
const afterSave = await p.evaluate(() => ({
  coins: __MOSS__.state.coins, deed: __MOSS__.state.inventory.warehouse_deed,
  lots: (__MOSS__.exploreState().billLots || []).filter(L => L.item === 'warehouse_deed')
}));
eq(afterSave, beforeSave, '重载后金币、票据与批次完全一致');
ok(Array.isArray(await p.evaluate(() => __MOSS__.exploreState().billLots)), '缺批次字段时归一化为数组');

/* ---------- 11. 旧档：没有批次记录的票据视为已满期 ---------- */
console.log('\n【11】旧档兼容');
await p.evaluate(() => {
  const M = __MOSS__, s = M.state;
  s.inventory = { bond: 2 };
  const e = M.exploreState();
  e.billLots = []; e.billTx = []; e.pledges = [];
  /* 老存档里在押的公债按旧口径记账，且没有 hold 字段 */
  e.pledges = [{ id: 'bond', amt: 420, day: 0 }];
  M.saveNow();
});
await reload();
const legacy = await p.evaluate(() => ({
  pledge: (__MOSS__.exploreState().pledges || [])[0],
  redeemable: __MOSS__.billRedeemable('bond'),
  lots: (__MOSS__.exploreState().billLots || []).length
}));
eq(legacy.pledge.amt, 420, '旧档在押金额原样保留，不按新价重算');
eq(legacy.pledge.hold, null, '旧档在押记录补出 hold 字段');
eq(legacy.redeemable, 2, '查不到取得日的老票据按已满期，可兑付');
ok(legacy.lots > 0, '批次按背包数量多退少补');
await openSvc('bank');
const legacyCoins = await coins();
await clickBtn(/赎回.*公债/);
eq(await coins(), legacyCoins - 462, '旧档赎回仍按旧本金加一成息：420 → 462');
eq(await inv('bond'), 3, '赎回后加上原有 2 张共 3 张');
await clickBtn(/兑付.*公债/);
eq(await coins(), legacyCoins - 462 + bond.face * 3, '旧档公债按当前票面全额兑付，老持有者不被赖账');

/* ---------- 12. 税额不是 NaN，金币不会被写坏 ---------- */
console.log('\n【12】市政厅税金');
await reset(3000, {});
await openSvc('civic');
const taxLabel = await clickBtn(/缴纳税金/);
ok(!/NaN/.test(taxLabel), `纳税金额是实数：「${taxLabel}」`);
eq(await coins(), 3000 - 60, '新档按 2% 缴税，金币仍是数字');
ok(Number.isFinite(await coins()), '金币没有被 NaN 污染');
ok(await p.evaluate(() => __MOSS__.exploreState().bankDeposit >= 0), '活期存折读数合法');

eq(r.errors, [], '全流程无浏览器异常');
await r.browser.close();
console.log(`R5-0 经济止血 ${checks} 项通过${single ? '（单文件）' : ''}`);
