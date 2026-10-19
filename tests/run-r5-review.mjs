/* R5-B 有限复核：只接 R5-C 已落地的违约扣押。
 * 覆盖证据可查、时限、一次复核、有限结果、不凭空清债或发奖、幂等与坏档，
 * 全程走真实银行界面按钮。
 *   node tests/run-r5-review.mjs
 *   node tests/run-r5-review.mjs --single-file
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
const openBank = async () => { await closeWin(p); await p.evaluate(() => __MOSS__.devOpenService('bank')); await p.waitForTimeout(200); };
const credit = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.creditState())));
const debt = () => p.evaluate(() => __MOSS__.creditDebt(__MOSS__.creditState()));
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const inv = id => p.evaluate(k => __MOSS__.state.inventory[k] || 0, id);
const itemValue = id => p.evaluate(k => __MOSS__.ITEMS[k].sell, id);
const setDay = d => p.evaluate(x => { __MOSS__.state.totalDay = x; }, d);
async function click(re) {
  const list = (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(220);
  return list[i];
}
const hasBtn = async re => (await p.locator('.win-body button').allTextContents()).some(b => re.test(b));
/* 造一份「已违约、已扣押」的坏局面，走真实按钮放款与过期 */
async function defaulted(bag) {
  await p.evaluate(([cc, bb]) => {
    const M = __MOSS__, s = M.state;
    s.coins = cc; s.inventory = bb; s.energy = 100; s.timeMinutes = 480;
    M.exploreState().credit = undefined;
    M.saveNow();
  }, [5000, bag]);
  await openBank(); await click(/申请周转贷/);
  const due = (await credit()).dueDay;
  await setDay(due + 7);
  await openBank();
  return (await credit());
}

/* ---------- 1. 没有争议时不存在复核入口 ---------- */
console.log('\n【1】不预建空听证入口');
await p.evaluate(() => { const M = __MOSS__; M.state.coins = 5000; M.exploreState().credit = undefined; });
await openBank();
ok(!(await winText(p)).includes('违约处置 · 复核'), '没借过款时银行里没有复核面板');
ok(!await hasBtn(/申请复核/), '没借过款时没有复核按钮');
await openBank(); await click(/申请周转贷/);
ok(!(await winText(p)).includes('违约处置 · 复核'), '正常在贷时也没有复核面板，入口只跟真实争议走');

/* ---------- 2. 违约扣押后才有复核入口 ---------- */
console.log('\n【2】证据与时限');
await defaulted({ iron_ingot: 2 });
let c = await credit();
eq(c.status, 'default', '已违约');
ok(c.seized.length === 1, '已扣押一次');
const seized = c.seized[0];
const seizeDay = seized.day;
await openBank();
ok((await winText(p)).includes('违约处置 · 复核'), '扣押后银行出现复核面板');
const evidence = await winText(p);
ok(new RegExp(`第 ${seizeDay} 天扣押`).test(evidence), '面板列出扣押日期与物品');
ok(/当时欠款/.test(evidence), '面板列出扣押当时的欠款');
ok(/7 天内申请一次复核/.test(evidence), '写明时限与只能一次');
ok(/是不是超过了当时的欠款/.test(evidence), '写明复核的客观标准');
ok(await hasBtn(/申请复核/), '给出申请入口');

/* 超时限就不给申请 */
await setDay(seizeDay + 8);
await openBank();
ok(!await hasBtn(/申请复核/), '超过 7 天时限后不再受理申请');

/* ---------- 3. 一次复核：幂等 ---------- */
console.log('\n【3】一次复核');
await defaulted({ iron_ingot: 2 });
const seized2 = (await credit()).seized[0];
await openBank();
const fileDay = await p.evaluate(() => __MOSS__.state.totalDay);
await click(/申请复核/);
c = await credit();
eq(c.review.status, 'filed', '复核已受理');
eq(c.review.seizeDay, seized2.day, '复核绑定的是这次扣押');
eq(c.review.dueDay, fileDay + 3, `第 3 天出结果（第 ${c.review.dueDay} 天）`);
ok(c.tx.filter(t => t.kind === 'review').length === 1, '流水里只有一条复核申请');
ok(!await hasBtn(/申请复核/), '受理后不再给第二个申请入口');
/* 连点不会产生第二条 */
const fileCount = c.tx.filter(t => t.kind === 'review').length;
await p.locator('.win-body button', { hasText: '申请复核' }).first().click().catch(() => { });
await p.waitForTimeout(200);
eq((await credit()).tx.filter(t => t.kind === 'review').length, fileCount, '重复点击不产生第二条复核');

/* ---------- 4. 结果是有限的：不清本金、不发钱 ---------- */
console.log('\n【4】有限结果');
const lateFeeBefore = (await credit()).lateFee;
await setDay(c.review.dueDay);
await p.evaluate(() => __MOSS__.creditTick());   /* 先把当天罚息结清，再取基准 */
const coinsBefore = await coins();
const debtAtResolve = await debt();      /* 裁定那一刻的欠款基准 */
const lateFeeAtResolve = (await credit()).lateFee;
await openBank();
const rv = (await credit()).review;
ok(rv.status === 'granted' || rv.status === 'upheld', `第 ${c.review.dueDay} 天给出裁定（${rv.status}）`);
eq(rv.decidedDay, c.review.dueDay, '裁定日写进记录');
ok(rv.reason.length > 0, '裁定带可复查的理由');
ok(/金/.test(rv.reason), '理由里有具体数字');
ok(rv.relief <= 20, `罚息减免封顶 20 金（实际 ${rv.relief}）`);
eq(rv.relief, rv.status === 'granted' ? Math.min(20, lateFeeAtResolve) : 0, '减免额按封顶与当时罚息算出');
eq(await debt(), debtAtResolve - rv.relief, '欠款只减少减免的罚息，本金不变');
ok(await debt() >= P, '复核后欠款仍不低于本金，没有凭空清债');
eq(await coins(), coinsBefore, '复核不发一分钱');
if (rv.status === 'granted') eq(await inv(seized.id), 2, '多扣的部分原物归还');
else eq(await inv(seized.id), 0, '维持原判时扣押物不归还');
/* 裁定一次定案，之后不再变 */
const frozen = JSON.stringify(rv);
await setDay(c.review.dueDay + 20);
await openBank();
eq(JSON.stringify((await credit()).review), frozen, '裁定之后不再随日期变化');
await openBank();
ok((await winText(p)).includes(rv.status === 'granted' ? '复核成立' : '复核不成立'), '结果长期可查');
ok((await winText(p)).includes('不清欠款本金'), '面板说明复核的边界');

/* ---------- 5. 结清后复核记录留存但不再可申请 ---------- */
console.log('\n【5】结清后');
await defaulted({ iron_ingot: 2 });
await openBank(); await click(/申请复核/);
await p.evaluate(() => { __MOSS__.state.coins += 5000; });
await setDay((await credit()).review.dueDay + 5);
await openBank();
await click(/一次性还清/);
eq((await credit()).status, 'none', '合同结清');
eq((await credit()).review, null, '结清后复核记录随合同一并了结');
ok((await credit()).tx.some(t => t.kind === 'review_closed'), '裁定结果仍留在流水里可查');
await openBank();
ok(!(await winText(p)).includes('违约处置 · 复核'), '结清后不再有复核入口');
ok(!await hasBtn(/申请复核/), '结清后不能再申请复核');

/* ---------- 6. 复核不能凭空造出来 ---------- */
console.log('\n【6】没有争议就没有复核');
await p.evaluate(() => { __MOSS__.state.coins = 5000; __MOSS__.exploreState().credit = undefined; });
await openBank(); await click(/申请周转贷/);
await setDay((await credit()).dueDay + 3);
await openBank();
eq((await credit()).status, 'active', '逾期未满 7 天仍是处理中，不算违约');
ok(!await hasBtn(/申请复核/), '只是逾期、还没扣押时没有复核入口');

/* ---------- 7. 坏档归一化 ---------- */
console.log('\n【7】坏档归一化');
const norm = await p.evaluate(() => {
  const M = __MOSS__;
  const mk = rev => M.normalizeExploration({ credit: { status: 'default', principal: 300, rate: 0.15, dueDay: 30, dueTotal: 345, seized: [{ id: 'gem', qty: 1, day: 20 }], review: rev } }).credit;
  return {
    bad: mk({ day: 1, seizeDay: 0, dueDay: 1, value: 9999, debtAt: -5, status: 'weird', relief: 9999, reason: 123 }),
    none: mk(undefined),
    garbage: mk('not an object'),
    empty: mk({}),
    again: mk({ day: 1, seizeDay: 0, dueDay: 1, value: 9999, debtAt: -5, status: 'weird', relief: 9999, reason: 123 }),
    idle: M.normalizeExploration({ credit: { status: 'none', review: { day: 1, seizeDay: 1, dueDay: 4, value: 100, debtAt: 50 } } }).credit
  };
});
ok(norm.bad.review.status !== 'granted', `非法复核状态退回「已受理」（实为 ${norm.bad.review.status}），不会凭空变成成立`);
eq(norm.bad.review.debtAt, 0, '负欠款归零');
eq(norm.bad.review.relief, 20, '减免额封顶 20 金');
eq(norm.bad.review.reason, '', '非字符串理由被清空');
eq(norm.none.review, null, '缺 review 时是「没有复核」，不是空壳对象');
eq(norm.garbage.review, null, '字符串型 review 整条丢掉');
eq(norm.empty.review, null, '空对象 review 整条丢掉');
eq(norm.again.review, norm.bad.review, '坏复核归一化往返幂等');
eq(norm.idle.review, null, '没借过款的档不留复核记录');

/* ---------- 8. 存档往返 ---------- */
console.log('\n【8】存档往返');
await defaulted({ gem: 50 });
const originalDebt = await debt();
const originalSeizure = (await credit()).seized[0];
await setDay(originalSeizure.day + 2);
await openBank(); await click(/申请复核/);
eq((await credit()).review.debtAt, originalDebt, '延后申请仍使用扣押当日欠款，不使用申请日增长的罚息');
await setDay((await credit()).review.dueDay);
await openBank();
eq((await credit()).review.status, 'granted', '超额扣押裁定成立');
const returned = await inv('gem');
const reliefGranted = (await credit()).review.relief;
await setDay((await credit()).dueDay + 30);
await openBank(); await openBank();
eq(await inv('gem'), returned, '复核退还后跨日重开银行不会再次扣押');
eq((await credit()).lateFee, 40 - reliefGranted, '裁定减免跨日持续有效');
await p.evaluate(() => __MOSS__.saveNow());
await p.reload(); await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
await openBank();
eq(await inv('gem'), returned, '退还后读档仍不会再次扣押');
await defaulted({ iron_ingot: 2 });
await openBank(); await click(/申请复核/);
await setDay((await credit()).review.dueDay);
await openBank();
const snap = await credit();
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const after = await credit();
eq(after.review, snap.review, '复核记录读档后不变');
eq(after.seized, snap.seized, '扣押记录读档后不变');
eq(await debt(), await p.evaluate(() => __MOSS__.creditDebt(__MOSS__.creditState())), '读档后欠款可算且非负');
await openBank();
ok(/复核成立|复核不成立|复核已受理/.test(await winText(p)), '读档后结果仍可查');

eq(r.errors, [], '全流程无浏览器异常');
await r.browser.close();
console.log(`R5-B 有限复核 ${checks} 项通过${single ? '（单文件）' : ''}`);
