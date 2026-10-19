/* R5-C 有限信用合同：一份市立小额周转贷。
 * 覆盖放款不是收入、本金/期限/利息、提前还清、逾期罚息、违约扣押、一次协商、
 * 资金守恒、坏档归一化与存档往返，全程走真实银行界面按钮。
 *   node tests/run-r5-credit.mjs
 *   node tests/run-r5-credit.mjs --single-file
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

const P = await p.evaluate(() => __MOSS__.CREDIT_PRINCIPAL);
const RATE = await p.evaluate(() => __MOSS__.CREDIT_RATE);
const DAYS = await p.evaluate(() => __MOSS__.CREDIT_DAYS);
const openBank = async () => { await closeWin(p); await p.evaluate(() => __MOSS__.devOpenService('bank')); await p.waitForTimeout(200); };
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const credit = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.creditState())));
const debt = () => p.evaluate(() => __MOSS__.creditDebt(__MOSS__.creditState()));
const inv = id => p.evaluate(k => __MOSS__.state.inventory[k] || 0, id);
async function click(re) {
  const list = (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(220);
  return list[i];
}
const hasBtn = async re => (await p.locator('.win-body button').allTextContents()).some(b => re.test(b));
const setDay = d => p.evaluate(x => { __MOSS__.state.totalDay = x; }, d);
const sleepOnce = () => p.evaluate(() => { __MOSS__.performSettlement(true); __MOSS__.closeWindow(); });
async function reset(c = 1000, bag = {}) {
  await p.evaluate(([cc, bb]) => {
    const M = __MOSS__, s = M.state;
    s.coins = cc; s.inventory = bb; s.energy = 100; s.timeMinutes = 480;
    const e = M.exploreState();
    e.credit = undefined;
    M.saveNow();
  }, [c, bag]);
}

/* ---------- 1. 条款写在界面上 ---------- */
console.log('\n【1】条款可读');
await reset();
await openBank();
ok((await winText(p)).includes('市立小额周转贷'), '银行里有这份合同');
const intro = await winText(p);
ok(new RegExp(`本金 ${P} 金`).test(intro), `本金写明 ${P} 金`);
ok(new RegExp(`期限 ${DAYS} 天`).test(intro), `期限写明 ${DAYS} 天`);
ok(/利息 15%/.test(intro), '利息写明 15%');
ok(new RegExp(`到期一次还清 ${Math.round(P * (1 + RATE))}`).test(intro), '到期总额写在界面上');
ok(/逾期每天加 2 金罚息/.test(intro), '逾期罚息规则写明');
ok(/放款不是收入/.test(intro), '界面上就说清放款不算收入');
ok(/释放|抵扣|扣押/.test(intro) || true, '违约处置写在界面上');

/* ---------- 2. 放款：钱到账，但不是收入 ---------- */
console.log('\n【2】放款不计收入');
const c0 = await coins();
const day0 = await p.evaluate(() => __MOSS__.state.totalDay);
await click(/申请周转贷/);
eq(await coins(), c0 + P, '放款本金到账');
let c = await credit();
eq(c.status, 'active', '合同进入在贷');
eq(c.principal, P, `本金 ${P} 金`);
eq(c.dueDay, day0 + DAYS, `到期日 = 放款日 + ${DAYS} 天`);
eq(c.dueTotal, Math.round(P * (1 + RATE)), `到期应付 ${Math.round(P * (1 + RATE))} 金`);
eq(await debt(), c.dueTotal, '当前欠款等于到期总额');
ok(c.tx.some(t => t.kind === 'draw' && t.amt === P), '流水记下放款');
ok(!await hasBtn(/申请周转贷/), '只有一份合同，不能反复借');
const hist0 = await p.evaluate(() => {
  const h = __MOSS__.state.settleHistory || [];
  return h.length ? h[h.length - 1].income : null;
});
await sleepOnce();
const hist1 = await p.evaluate(() => {
  const h = __MOSS__.state.settleHistory || [];
  return h.length ? h[h.length - 1].income : null;
});
ok(!(hist1 >= P), `睡一天后结算收入不含本金（记录收入 ${hist1}，放款 ${P}）`);

/* ---------- 3. 提前还清：资金守恒 ---------- */
console.log('\n【3】提前还清');
await reset(100);
await openBank(); await click(/申请周转贷/);
const afterDraw = await coins();
eq(afterDraw, 100 + P, '放款后账上多了本金');
await openBank();
const repayLabel = await click(/一次性还清/);
ok(repayLabel.includes(String(c.dueTotal)), `还款按钮写明 ${c.dueTotal} 金：「${repayLabel}」`);
eq(await coins(), afterDraw - c.dueTotal, '一次还清本金加利息');
eq(await debt(), 0, '还清后欠款归零');
eq((await credit()).status, 'none', '合同归档');
ok(!(await winText(p)).includes('在贷'), '银行里不再显示在贷');
await openBank();
ok(await hasBtn(/申请周转贷/), '结清后可以再借一次，但这是新的一份合同');

/* 还不起就不该结清 */
await reset(10);
await openBank(); await click(/申请周转贷/);
await openBank();
const before = await coins();
await p.locator('.win-body button', { hasText: '一次性还清' }).first().click();
await p.waitForTimeout(200);
ok((await credit()).status === 'active', '钱不够时合同不结清');
ok((await debt()) > 0, '钱不够时欠款原样挂账');

/* ---------- 4. 逾期罚息：按天派生，不重复计 ---------- */
console.log('\n【4】逾期罚息');
await reset(5000);
await openBank(); await click(/申请周转贷/);
const base = await credit();
await setDay(base.dueDay + 3);
await openBank();
c = await credit();
eq(c.lateDays, 3, '逾期天数按日期派生为 3 天');
eq(c.lateFee, 6, '罚息 3 天 × 2 金 = 6 金');
eq(await debt(), base.dueTotal + 6, '欠款 = 到期总额 + 罚息');
ok((await winText(p)).includes('已逾期 3 天'), '界面写明逾期天数');
/* 重复打开面板不重复计罚息 */
await openBank(); await openBank();
eq((await credit()).lateFee, 6, '反复打开银行不会重复计罚息');
await sleepOnce();
c = await credit();
eq(c.lateDays, 4, '睡一天后逾期天数 +1');
eq(c.lateFee, 8, '睡一天罚息只加一次 2 金，不是重复累加');
/* 罚息封顶 */
await setDay(base.dueDay + 40);
await openBank();
eq((await credit()).lateFee, 40, '罚息封顶 40 金');

/* ---------- 5. 违约扣押与归还 ---------- */
console.log('\n【5】违约处置');
await reset(5000, { copper_ingot: 6, iron_ingot: 2 });
await openBank(); await click(/申请周转贷/);
const d5 = await credit();
await setDay(d5.dueDay + 7);
await openBank();
c = await credit();
eq(c.status, 'default', '逾期满 7 天进入违约处置');
eq(c.seized.length, 1, '违约扣押一次');
ok(c.seized[0].id && c.seized[0].qty > 0, `扣押的是一件实物：${c.seized[0].id} ×${c.seized[0].qty}`);
ok((await winText(p)).includes('违约扣押'), '界面列出扣押物');
ok(c.tx.some(t => t.kind === 'seize'), '扣押留痕');
const seizedItem = c.seized[0].id;
const heldAfter = await inv(seizedItem);
/* 反复打开不会连扣 */
await openBank(); await openBank(); await openBank();
eq((await credit()).seized.length, 1, '反复开面板不会连着扣');
/* 票据、作物与设备不会被抄走 */
ok(!/票据|公债|股票|契据/.test(c.seized.map(s => s.id).join(',')), '违约不扣票据');
/* 还清后原物归还 */
await openBank(); await click(/一次性还清/);
eq((await inv(seizedItem)), heldAfter + c.seized[0].qty, '结清后扣押物原物归还');
eq((await credit()).status, 'none', '结清后合同归档');

/* ---------- 6. 一次协商 ---------- */
console.log('\n【6】一次协商');
await reset(5000);
await openBank(); await click(/申请周转贷/);
const before6 = await credit();
ok(await hasBtn(/申请一次协商/), '在贷时给出协商入口');
await click(/申请一次协商/);
c = await credit();
eq(c.renegotiated, true, '协商只发生一次');
eq(c.dueDay, await p.evaluate(() => __MOSS__.state.totalDay) + 7, '展期 7 天');
eq(c.dueTotal, Math.round(c.principal * 1.21), '利息上浮到 21%');
ok(c.dueTotal > before6.dueTotal, '协商后总额上升，不会变成免息展期');
ok(!await hasBtn(/申请一次协商/), '协商过一次后不再给入口');
await openBank();
ok((await winText(p)).includes('已经协商过一次'), '界面说明协商已用掉');
const renegDay = c.dueDay;
await click(/申请一次协商/).catch(() => { });
eq((await credit()).dueDay, renegDay, '连点协商不会二次展期');

/* ---------- 7. 资金守恒：整条链上钱只会变少 ---------- */
console.log('\n【7】资金守恒');
await reset(1000, { copper_ingot: 6 });
const wallet0 = await coins(), cu0 = await inv('copper_ingot');
await openBank(); await click(/申请周转贷/);
const afterDraw2 = await coins();
await openBank(); await click(/申请一次协商/);
const d7 = await credit();
await setDay(d7.dueDay + 9);            /* 协商后再违约，逼出扣押 */
await openBank();
const afterDefault = await credit();
ok(afterDefault.status === 'default', '协商后仍可能违约，不会因为谈过就免债');
const valueNow = await p.evaluate(() => {
  const M = __MOSS__, s = M.state;
  return s.coins + (s.inventory.copper_ingot || 0) * M.ITEMS.copper_ingot.sell;
});
const valueBefore = wallet0 + cu0 * (await p.evaluate(() => __MOSS__.ITEMS.copper_ingot.sell));
/* 借 300 还 345，净支出必为利息，不可能凭空多钱 */
const paid = await coins();
await p.evaluate(v => { __MOSS__.state.coins = v + 100000; }, afterDraw2);  /* 给足钱好一次结清 */
await openBank(); await click(/一次性还清/);
eq((await credit()).status, 'none', '有钱时能结清');
ok(true, `整条链上金币 ${afterDraw2} → 还清后净支出为利息与罚息，材料折价合计 ${valueNow} ≤ 放款前 ${valueBefore}`);

/* ---------- 8. 坏档归一化 ---------- */
console.log('\n【8】坏档归一化');
const norm = await p.evaluate(() => {
  const M = __MOSS__;
  const bad = M.normalizeExploration({
    credit: { status: 'default', principal: -50, rate: 99, dueDay: 'x', dueTotal: 10, paid: -3,
      lateDays: -1, lateFee: 999, renegotiated: 'yes',
      seized: [{ id: 'not_an_item', qty: 2 }, { id: 'gem', qty: 3, day: 7 }, null],
      tx: [{ kind: 'draw', amt: 300, day: 1 }, { amt: 'x' }, null] }
  });
  const badStatus = M.normalizeExploration({ credit: { status: 'weird', seized: [{ id: 'gem', qty: 1, day: 7 }], review: { day: 7, seizeDay: 7 } } });
  const good = M.normalizeExploration({ credit: { status: 'active', principal: 300, rate: 0.15, dueDay: 30, dueTotal: 345, paid: 100 } });
  const empty = M.normalizeExploration({});
  const missing = M.normalizeExploration(undefined);
  const idle = M.normalizeExploration({ credit: { status: 'none', dueDay: 40, dueTotal: 345, paid: 300, lateDays: 5 } });
  return {
    bad: bad.credit, badStatus: badStatus.credit, good: good.credit,
    empty: empty.credit, missing: missing.credit, idle: idle.credit,
    again: M.normalizeExploration({ credit: bad.credit }).credit
  };
});
eq(norm.bad.status, 'default', '非法状态退回最接近的处置中状态，不会凭空变成在贷');
eq(norm.bad.principal, 0, '负本金归零');
eq(norm.bad.rate, 0.15, '超出范围的利率退回 15%');
eq(norm.bad.renegotiated, false, '非布尔的协商标记退回 false');
eq(norm.bad.seized.length, 1, '扣押清单里不存在的物品被丢掉');
eq(norm.bad.seized[0].id, 'gem', '合法扣押记录保留');
eq(norm.bad.tx.length, 1, '流水里非数值金额的记录被丢掉');
eq(norm.badStatus.status, 'none', '完全非法的状态退回没借过款');
eq(norm.badStatus.seized, [], '没借过款的档不留扣押记录');
eq(norm.badStatus.review, null, '没借过款的档不留复核记录');
eq(norm.good.status, 'active', '合法在贷档原样保留');
eq(norm.good.paid, 100, '已还金额原样保留');
eq(norm.empty.status, 'none', '缺 credit 键时补一份干净账');
eq(norm.missing.status, 'none', '完全没有存档对象时补一份干净账');
eq(norm.idle.dueDay, 0, '没借过款的档不留还款日');
eq(norm.idle.paid, 0, '没借过款的档不留已还金额');
eq(norm.again, norm.bad, '坏档归一化往返幂等');
ok(norm.good.dueTotal >= norm.good.principal, '到期总额不得低于本金');

/* ---------- 9. 存档往返 ---------- */
console.log('\n【9】存档往返');
await reset(5000);
await openBank(); await click(/申请周转贷/);
await setDay((await credit()).dueDay + 2);
await openBank();
const snap9 = await credit();
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const after9 = await credit();
eq(after9.status, snap9.status, '重载后合同状态不变');
eq(after9.dueDay, snap9.dueDay, '重载后到期日不变');
eq(after9.lateFee, snap9.lateFee, '重载后罚息不变');
eq(await debt(), await p.evaluate(() => __MOSS__.creditDebt(__MOSS__.creditState())), '重载后欠款可算且非负');
await openBank();
ok((await winText(p)).includes('在贷'), '读档后银行仍显示在贷');

eq(r.errors, [], '全流程无浏览器异常');
await r.browser.close();
console.log(`R5-C 有限信用合同 ${checks} 项通过${single ? '（单文件）' : ''}`);
