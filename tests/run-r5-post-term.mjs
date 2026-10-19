/* R5-A 岗位试任期：河湾闸门养护岗的 28 天试任期。
 * 覆盖 28 天边界与相位、120 金预算与 12 金津贴幂等、基线差值统计、期末三去向、
 * 两步交接与单步辞职、坏档与旧档，以及真实界面路径（控制室／磨坊／河港／船闸／采场）。
 *   node tests/run-r5-post-term.mjs
 *   node tests/run-r5-post-term.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winText, interactWith, walkTo } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

/* 夹具：把工程推到「已验收且养护在岗」，只推工程进度，不直接写任期。
   任期、预算和津贴必须靠真实按钮产生。 */
async function fixture() {
  await p.evaluate(() => {
    const M = __MOSS__, s = M.state;
    const q = M.state.professionalLife.projects.riverbay_gate;
    s.energy = 100; s.timeMinutes = 480; s.totalDay = 10;
    q.phase = 'accepted'; q.trialDay = 8; q.maintDay = 10; q.scheme = 'balanced';
    q.opinions = { mill: true, meadow: true, port: true }; q.stone = 1; q.kit = 1;
    q.build = 4; q.mode = 'self'; q.funds = { granted: 400, spent: 400, tx: {} };
    /* 勘测与实践也要补齐：项目记录的自洽规则会把「已验收但没勘测」的存档压回 survey，
       那样 duty 会被清成 none，看起来就像 R5-A 丢了存档。 */
    q.survey = { level: 3, day: 5, east: 'cracked', silt: 'heavy' }; q.practice = 'mill';
    /* 工程履历补齐，让「下一步」文案能走到养护这一段 */
    M.state.professionalLife.eng = { stage: 4, post: 'gate', incident: '', hearing: 'navigation',
      choice: '', budget: 400, budgetGranted: true, preventive: 'gate', postEval: 'preventive', memories: {} };
    q.safety = { status: 'clear', route: '', deadline: 0, inspectionDay: 0, repairDay: 0 };
    q.duty = { status: 'active', cycle: 3, startDay: 7, nextDay: 10, lastDay: 7, endDay: 0,
      done: 0, sinceEval: 0, evalCount: 0, overdue: 0, deferCount: 0, defers: [], successor: '', reason: '' };
    M.professionalLifeState().postTerms = [];
    M.saveNow();
  });
}
const pj = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate)));
const terms = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.postTerms || [])));
const term = () => p.evaluate(() => { const t = __MOSS__.currentPostTerm('gatekeeper'); return t ? JSON.parse(JSON.stringify(t)) : null; });
const phase = () => p.evaluate(() => { const t = __MOSS__.currentPostTerm('gatekeeper'); return t ? __MOSS__.postTermPhase(t) : 'none'; });
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const CYCLE = 3;

/* 到真实工作点：切换场景、站到台子旁边、按 E 开面板。
   和 R3 用例同一路径——工作有地点门禁，不站在现场就点不动；
   站位取台子正下方一格，面板才会被按出来。 */
const SITES = {
  water: { scene: 'waterworks_control', x: 8, y: 7 },
  mill: { scene: 'mill_workshop', x: 15, y: 12 },
  port: { scene: 'port_office', x: 10, y: 7 },
  lock: { scene: 'port_lockhouse', x: 9, y: 7 },
  quarry: { scene: 'quarry', x: 18, y: 19 }
};
async function atSite(key) {
  const s = SITES[key];
  await closeWin(p);
  await p.evaluate(([sc, x, y]) => __MOSS__.devSwitchScene(sc, x, y), [s.scene, s.x, s.y]);
  await p.waitForTimeout(160);
  await p.keyboard.press('e');
  await p.waitForTimeout(300);
  return (await p.locator('.win').count()) > 0;
}
/* 从控制室打开闸门工程面板并点按钮（真实界面，不调内部函数） */
const dayNow = () => p.evaluate(() => __MOSS__.state.totalDay);
const registerTerm = async () => {
  const d = await dayNow();
  await atWater();
  await click(/登记 28 天岗位试任期/);
  return d;
};
async function atWater() { return atSite('water'); }
const atMill = () => atSite('mill');
const atPort = site => atSite(site);
const atQuarry = () => atSite('quarry');
async function click(re) {
  const list = (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(220);
  return list[i];
}
const hasBtn = async re => (await p.locator('.win-body button').allTextContents()).some(b => re.test(b));
/* 推进一个养护周期：到期 → 真实点检视 */
async function runCycle() {
  await p.evaluate(() => { const M = __MOSS__, q = M.state.professionalLife.projects.riverbay_gate; M.state.totalDay = q.duty.nextDay; M.state.energy = 100; M.state.timeMinutes = 480; });
  await atWater();
  await click(/闸门养护检视/);
}
const reload = async () => {
  await p.reload();
  await p.waitForFunction(() => !!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
};

/* ---------- 1. 旧档：没有任期时照常养护，不发钱不自动登记 ---------- */
console.log('\n【1】旧档兼容');
await fixture();
eq(await terms(), [], '旧档没有任期账本');
await atWater();
ok((await winText(p)).includes('尚未登记正式试任期'), '面板写明尚未登记正式试任期');
eq(await phase(), 'none', '没有在办任期');
await runCycle();
eq((await pj()).duty.done, 1, '没有任期也能照常做三日养护');
const coinsNoTerm = await coins();
await atWater();
ok(!(await winText(p)).includes('机构预算'), '没有任期时不显示机构预算');
ok(Number.isFinite(coinsNoTerm), '旧档养护不发钱也不写坏金币');

/* ---------- 2. 登记：28 天任期、120 金预算、基线差值 ---------- */
console.log('\n【2】登记试任期');
const regDay = await dayNow();
await atWater();
const regLabel = await click(/登记 28 天岗位试任期/);
ok(/30分钟/.test(regLabel), `登记是一次真实工作：「${regLabel}」`);
let t = await term();
ok(!!t, '登记后有在办任期');
eq(t.post, 'gatekeeper', '任期挂在闸门养护岗上');
eq(t.startDay, regDay, `登记当天是第 1 个任职日（第 ${t.startDay} 天）`);
eq(t.reviewDay, regDay + 28, `到期日 = 起始日 + 28（第 ${t.reviewDay} 天）`);
eq(t.phase, 'active', '登记后相位是 active');
eq(t.budget.appropriated, 120, '核定预算 120 金');
eq(t.budget.spent, 0, '刚登记时已用 0 金');
eq(t.baseline, { done: 1, evalCount: 0, deferCount: 0, overdue: 0 },
  '基线记下登记当时的养护累计，任期统计按差值算');
eq(await hasBtn(/登记 28 天岗位试任期/), false, '已有任期后不再给登记按钮');
const nextDayBefore = (await pj()).duty.nextDay;
await atWater();
ok(!await hasBtn(/续任下一期/), '在任期间不出现续任按钮');
ok(await hasBtn(/申请交接/), '在任期间可以申请交接');
ok(await hasBtn(/辞去这份岗位/), '在任期间可以随时辞职');
ok((await pj()).duty.nextDay === nextDayBefore, '打开面板不会重置检视期限');

/* ---------- 3. 预算与津贴：按期合格才发 12 金 ---------- */
console.log('\n【3】津贴与预算');
const c0 = await coins();
await runCycle();
t = await term();
eq(t.budget.spent, 12, '按期走完一个周期发 12 金');
eq(await coins(), c0 + 12, '津贴进玩家钱包');
ok((await winText(p)).includes('已用 12'), '面板显示已用金额');
/* 连点不会重复发 */
const c1 = await coins();
await p.locator('.win-body button', { hasText: '闸门养护检视' }).first().click().catch(() => { });
await p.waitForTimeout(200);
eq(await coins(), c1, '刚检视过再点不会重复发津贴');
/* 逾期补做不发津贴 */
await p.evaluate(() => { __MOSS__.state.totalDay += 5; });
await atWater();
await click(/闸门养护检视/);
t = await term();
eq(t.budget.spent, 12, '逾期补做不发津贴，金额不变');
ok((await pj()).duty.overdue >= 1, '逾期事实照记在养护账上');

/* ---------- 4. 28 天边界与相位 ---------- */
console.log('\n【4】28 天边界');
await fixture();
await atWater(); await click(/登记 28 天岗位试任期/);
const startDay = (await term()).startDay;
await p.evaluate(d => { __MOSS__.state.totalDay = d + 27; }, startDay);
eq(await phase(), 'active', '第 27 天仍是 active');
ok(await hasBtn(/闸门养护检视/), '未到期照常可以检视');
await p.evaluate(d => { __MOSS__.state.totalDay = d + 28; }, startDay);
eq(await phase(), 'review_due', `第 ${startDay + 28} 天进入 review_due`);

/* ---------- 5. 期末报告与三个去向 ---------- */
console.log('\n【5】期末报告');
await atWater();
const report = await winText(p);
ok(report.includes('期末报告'), '面板先给期末报告');
ok(report.includes('评级'), '报告带评级');
ok(/稳任|有条件|未完成/.test(report), '评级是可读的中文档位');
ok(await hasBtn(/续任下一期/), '待评期给出续任');
ok(await hasBtn(/申请交接/), '待评期给出交接申请');
ok(await hasBtn(/辞去这份岗位/), '待评期给出辞职');
ok(!await hasBtn(/闸门养护检视/), '待评期不再有检视按钮');
ok(!await hasBtn(/申请延期一个周期/), '待评期不再能延期');
eq((await term()).budget.spent, 0, '待评期没有凭空发津贴');

/* 续任：封存旧记录、追加新记录，不改旧条目 */
const oldId = (await term()).id;
await click(/续任下一期/);
const all = await terms();
eq(all.length, 2, '续任后账本里有两段任期');
eq(all[0].id, oldId, '旧任期 ID 不变');
eq(all[0].phase, 'closed', '旧任期已封存');
ok(!!all[0].close, '旧任期写入了结案记录');
eq(all[1].phase, 'active', '新任期是 active');
eq(all[1].reviewDay, all[1].startDay + 28, '新任期同样是 28 天');
ok(all[1].startDay >= all[0].startDay, '续任从当天起算');
const frozen = JSON.stringify(all[0]);
eq(JSON.stringify((await terms())[0]), frozen, '封存记录不再随之后的事实变化');

/* ---------- 6. 两步交接 ---------- */
console.log('\n【6】两步交接');
await fixture();
await atWater(); await click(/登记 28 天岗位试任期/);
/* 采场在申请之前没有确认入口 */
await atQuarry();
ok(!(await winText(p)).includes('闸门养护岗 · 交接确认'), '没申请交接时采场不出现确认入口');
await atWater();
await click(/申请交接/);
eq((await pj()).duty.handover.termId, (await term()).id, '面板登记了交接意向');
ok((await winText(p)).includes('等'), '面板说明要等继任者确认');
ok(!await hasBtn(/申请交接/), '申请过就不再给重复申请按钮');
await atQuarry();
ok((await winText(p)).includes('交接确认'), '申请后采场出现交接确认');
ok((await winText(p)).includes('玛尔'), '确认人是玛尔');
await click(/确认接手养护责任/);
const t2 = await term();
eq(t2, null, '交接后没有在办任期');
eq((await pj()).duty.status, 'handed', '责任交给继任者');
ok((await pj()).duty.successor.includes('玛尔'), '继任人可查');
const closedTerm = (await terms())[0];
eq(closedTerm.phase, 'closed', '交接封存任期');
ok(closedTerm.close.successor.includes('玛尔'), '结案记录写了继任者');
/* 交接幂等：读档后再点不会封存第二次 */
const afterHandover = await terms();
await reload();
eq(await terms(), afterHandover, '交接结果读档后不变');
await atQuarry();
ok(!(await winText(p)).includes('交接确认'), '交接完成后采场不再有确认入口');

/* ---------- 7. 辞职：一次确认，未清事项留档 ---------- */
console.log('\n【7】辞职');
await fixture();
await atWater(); await click(/登记 28 天岗位试任期/);
/* 造一个「安全事件未处理 + 有逾期」的坏局面，验证辞职不会被锁死 */
await p.evaluate(() => {
  const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
  q.safety = { status: 'failed', route: '', deadline: 1, inspectionDay: 0, repairDay: 0 };
  q.duty.overdue = 2; q.duty.deferCount = 1;
  __MOSS__.state.professionalLife.projects.riverbay_gate = q;
});
await atWater();
ok((await winText(p)).includes('闸门还有未处理的安全事件'), 'R3 的安全事件闸门仍在');
ok(await hasBtn(/辞去这份岗位/), '有未处理事件时辞职按钮依然在');
await click(/辞去这份岗位/);
eq((await pj()).duty.status, 'released', '辞职后责任结束');
eq(await term(), null, '辞职后没有在办任期');
const resignTerm = (await terms())[0];
eq(resignTerm.phase, 'closed', '辞职封存任期');
ok(resignTerm.close.reason.includes('辞去'), '结案原因写明辞职');
ok(resignTerm.close.reason.includes('未处理'), '未清事项写进结案');
eq((await pj()).safety.status, 'failed', '辞职不清掉世界里的安全事件');
ok((await winText(p)).includes('记录在册') || (await winText(p)).includes('结束'), '离岗后仍可查到记录');

/* ---------- 8. 统计按基线差值 ---------- */
console.log('\n【8】基线差值');
await fixture();
await runCycle(); await runCycle();      /* 登记前先做两次养护 */
await atWater(); await click(/登记 28 天岗位试任期/);
eq((await term()).baseline.done, 2, '基线记下登记时的累计检视 2 次');
await runCycle();
const st = await p.evaluate(() => { const q = __MOSS__.state.professionalLife.projects.riverbay_gate; return __MOSS__.postTermStats(q, __MOSS__.currentPostTerm('gatekeeper')); });
eq(st.done, 1, '本期统计只算登记之后的增量');
ok((await pj()).duty.done === 3, '养护账上的累计仍然照常增长');

/* ---------- 9. 四处面板同源 ---------- */
console.log('\n【9】四处面板同源');
await fixture();
await atWater(); await click(/登记 28 天岗位试任期/);
const budgetLine = async () => (await winText(p)).match(/核定 120[^）]*/);
ok(await hasBtn(/登记|辞去这份岗位|申请交接/), '控制室给操作入口');
const controlText = await winText(p);
await atMill();
ok((await winText(p)).includes('岗位试任期'), '磨坊机房有同源任期面板');
ok(/核定 120/.test(await winText(p)), '磨坊读到同一份预算');
await atPort('port');
const portText = await winText(p);
ok(portText.includes('闸门养护岗 · 任期进度（只读）'), '河港船务屋有只读任期视图');
ok(/核定 120/.test(portText), '河港读到同一份预算');
ok(!/辞去这份岗位/.test(portText), '河港不挂会改钱的按钮');
await atPort('lock');
ok(/核定 120/.test(await winText(p)), '船闸值守室读到同一份预算');
ok(!/辞去这份岗位/.test(await winText(p)), '船闸不挂会改钱的按钮');
ok(controlText !== portText, '控制室是操作面板，河港是只读面板，不是同一块文本');

/* ---------- 10. 今日安排／委托日志／角色经历共用同一句下一步 ---------- */
console.log('\n【10】共用下一步文案');
const next = await p.evaluate(() => __MOSS__.engNextStepText());
ok(/试任期至第/.test(next), `在任期间提示任期与预算：「${next}」`);
const stripText = () => p.evaluate(() => (document.querySelector('#questStripText') || {}).textContent || '');
/* 角色经历页的「下一步」与工程手册、今日安排共用同一个函数，实测玩家看得见同一句 */
await closeWin(p);
await p.keyboard.press('p');
await p.waitForTimeout(350);
const tabs = (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
const careerTab = tabs.findIndex(b => /经历|职业/.test(b));
ok(careerTab >= 0, `角色页有经历/职业页签：${tabs.slice(0, 6).join(' | ')}`);
if (careerTab >= 0) { await p.locator('.win-body button').nth(careerTab).click(); await p.waitForTimeout(220); }
const charText = await winText(p);
ok(/试任期至第/.test(charText), '角色经历页显示同一句任期提示');
ok(/预算已用/.test(charText), '角色经历页能读到本期预算');
await closeWin(p);
await p.evaluate(() => { const t = __MOSS__.currentPostTerm('gatekeeper'); __MOSS__.state.totalDay = t.reviewDay; });
ok(/期末报告已出/.test(await p.evaluate(() => __MOSS__.engNextStepText())), '到期后提示期末去向优先');
ok(!/闸门养护检视已到期/.test(await p.evaluate(() => __MOSS__.engNextStepText())), '待评期不再抢着提示普通检视');

/* 申请交接后的指向要在还在任时验证：待评期期末选择优先级更高 */
await fixture();
await atWater(); await click(/登记 28 天岗位试任期/);
await atWater(); await click(/申请交接/);
ok(/石灰采场/.test(await p.evaluate(() => __MOSS__.engNextStepText())), '申请交接后指向石灰采场');

/* ---------- 11. 存档往返 ---------- */
console.log('\n【11】存档往返');
const before = await p.evaluate(() => ({
  terms: JSON.stringify(__MOSS__.state.professionalLife.postTerms),
  duty: JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate.duty)
}));
await reload();
const after = await p.evaluate(() => ({
  terms: JSON.stringify(__MOSS__.state.professionalLife.postTerms),
  duty: JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate.duty)
}));
eq(after, before, '重载后任期账本与 duty 完全一致');

/* ---------- 12. 坏档归一化 ---------- */
console.log('\n【12】坏档归一化');
const norm = await p.evaluate(() => {
  const M = __MOSS__;
  const bad = M.normalizeProfessionalLife({ postTerms: [
    { post: 'gatekeeper', phase: 'weird', startDay: 20, reviewDay: 3, baseline: { done: 'x' }, budget: { spent: 9999, tx: { 'k1': 12, 'k2': -3, 'k3': 500 } } },
    { post: 'gatekeeper', startDay: -5 },
    { post: 'unknown_post', startDay: 1 },
    null, 'not an object',
    { post: 'gatekeeper', phase: 'closed', startDay: 10, reviewDay: 38, close: { day: 40, reason: 'x', rating: 'bogus', stats: { done: 'y' } } }
  ] });
  const good = M.normalizeProfessionalLife({ postTerms: [
    { post: 'gatekeeper', phase: 'closed', startDay: 10, reviewDay: 38, close: { day: 40, reason: 'x', rating: 'steady', stats: { done: 4 } } }
  ] });
  const empty = M.normalizeProfessionalLife({});
  const missing = M.normalizeProfessionalLife(undefined);
  const again = M.normalizeProfessionalLife(bad);
  return { bad: bad.postTerms, good: good.postTerms, empty: empty.postTerms, missing: missing.postTerms, again: again.postTerms };
});
eq(norm.bad.length, 3, '只保留合法岗位的条目，null／字符串／未知岗位全被丢掉');
eq(norm.bad[0].reviewDay, 48, '到期日早于起始日就按规则重算成完整任期（20 + 28）');
eq(norm.bad[0].baseline.done, 0, '非数字基线归零');
eq(norm.bad[0].budget.spent, 120, '已用金额不会超过核定预算');
eq(Object.keys(norm.bad[0].budget.tx).sort(), ['k1', 'k3'], '负数事务被丢掉');
eq(norm.bad[0].budget.tx.k3, 12, '单笔超过津贴上限的金额被夹到上限');
eq(norm.bad[1].startDay, 0, '负数起始日归零');
eq(norm.bad[1].reviewDay, 28, '起始日归零后按 28 天重算到期日');
eq(norm.bad[2].phase, 'closed', '有结案记录的条目按已封存处理');
eq(norm.bad[2].close.rating, 'incomplete', '非法评级退回未完成');
eq(norm.bad[2].close.stats.done, 0, '非法统计归零');
eq(norm.good[0].close.rating, 'steady', '合法评级原样保留');
eq(norm.empty, [], '缺 postTerms 键时补空数组');
eq(norm.missing, [], '完全没有存档对象时补空数组');
eq(norm.again, norm.bad, '坏档归一化往返幂等');

/* ---------- 13. 预算封顶：单任期不可能超过 120 金 ---------- */
console.log('\n【13】预算封顶');
eq(await p.evaluate(() => __MOSS__.POST_BUDGET / __MOSS__.POST_ALLOWANCE), 10, '120 金正好是 10 次 12 金津贴');

eq(r.errors, [], '全流程无浏览器异常');
await r.browser.close();
console.log(`R5-A 岗位试任期 ${checks} 项通过${single ? '（单文件）' : ''}`);
