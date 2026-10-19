/* R5 自然入口证据（docs/r5-takeover-review-2026-10-19.md 第五节第 3 条）
 *
 * 三条路径都从玩家入口进：M 地图传送 → 真实走路 → 按 E 开窗 → 点真实按钮。
 * 不调用 devOpenService / devSwitchScene / devOpenBorder，也不直接写任期、合同、军籍。
 *
 * 夹具边界（只给「R3/R4 已验收之后本该存在的成果」，与 R5 的结论无关）：
 *   · state.bridgeRepaired=true      —— R3 修桥委托已交付（城市通行证的前置）
 *   · riverbay_gate 项目 phase=accepted / duty=active —— R3 河湾闸门工程已验收（岗位登记的前置）
 *   · professionalLifeState().trust=1 —— 验收通过的公共工程记录带来的信任（军事登记的前置）
 *   · travel.discovered 补 水利站／云峰山口／边境营地 —— R3/R4 期间走到过这些地方
 *   · coins=600 / energy=100 / totalDay=10 —— 让「办证 150 金」「走路体力」够用
 * 不写：岗位任期、信用合同、军事登记状态、指挥上限。这三样必须由按钮产生。
 *
 *   node tests/run-r5-natural-entry.mjs
 *   node tests/run-r5-natural-entry.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winTitle, winText, interactWith, walkTo, snap, lastToast } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (n, a, b) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (n, c) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const scene = () => p.evaluate(() => __MOSS__.state.sceneId);
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const settleScene = async want => {
  await p.waitForFunction(w => window.__MOSS__ && __MOSS__.state.sceneId === w, want, { timeout: 9000 }).catch(() => { });
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(200);
  return scene();
};
const btns = async () => (await p.locator('.win button').allTextContents()).map(s => s.trim()).filter(Boolean);
/* 点真实按钮；找不到就带着现有按钮列表报错，方便定位文案漂移 */
async function clickWin(re) {
  const list = await btns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win button').nth(i).click();
  await p.waitForTimeout(320);
  return list[i];
}
/* M 地图：点地点 → 点「传送过去」，返回面板上的阻塞说明（正常为空） */
async function travelTo(name) {
  await closeWin(p);
  await p.keyboard.press('m');
  await p.waitForTimeout(280);
  let node = p.getByRole('button', { name: new RegExp('^' + name) });
  if (!(await node.count())) {
    /* 在城里（或在室内）按 M 打开的是城市街区图，要先缩到全境总图才看得到其它地点 */
    const zoom = p.getByRole('button', { name: '全境总图' });
    if (await zoom.count()) { await zoom.first().click(); await p.waitForTimeout(300); }
    node = p.getByRole('button', { name: new RegExp('^' + name) });
  }
  assert.ok(await node.count(), 'M 地图上没有「' + name + '」；当前窗口「' + (await winTitle(p)) + '」按钮：' + (await btns()).join(' | '));
  await node.first().click();
  await p.waitForTimeout(220);
  const blocked = (await p.locator('.travel-blocked').allTextContents().catch(() => [])).join(' ').trim();
  const go = p.getByRole('button', { name: '传送过去', exact: true });
  assert.ok(await go.count(), '「' + name + '」不能传送：' + (blocked || '无传送按钮'));
  await go.first().click();
  await p.waitForTimeout(320);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(220);
  return blocked;
}
/* 只给 R3/R4 的既有成果，不碰 R5 的任何结论 */
async function seedLegit() {
  await p.evaluate(() => {
    const M = __MOSS__, s = M.state;
    s.energy = 100; s.coins = 600; s.timeMinutes = 480; s.totalDay = 10;
    s.bridgeRepaired = true;
    const q = s.professionalLife.projects.riverbay_gate;
    q.phase = 'accepted'; q.trialDay = 8; q.maintDay = 10; q.scheme = 'balanced';
    q.opinions = { mill: true, meadow: true, port: true }; q.stone = 1; q.kit = 1;
    q.build = 4; q.mode = 'self'; q.funds = { granted: 400, spent: 400, tx: {} };
    q.survey = { level: 3, day: 5, east: 'cracked', silt: 'heavy' }; q.practice = 'mill';
    s.professionalLife.eng = { stage: 4, post: 'gate', incident: '', hearing: 'navigation',
      choice: '', budget: 400, budgetGranted: true, preventive: 'gate', postEval: 'preventive', memories: {} };
    q.safety = { status: 'clear', route: '', deadline: 0, inspectionDay: 0, repairDay: 0 };
    q.duty = { status: 'active', cycle: 3, startDay: 7, nextDay: 10, lastDay: 7, endDay: 0,
      done: 0, sinceEval: 0, evalCount: 0, overdue: 0, deferCount: 0, defers: [], successor: '', reason: '' };
    M.professionalLifeState().postTerms = [];
    M.professionalLifeState().trust = 1;
    /* 实践路线已走通（R3 进场前置）：风铃磨坊水轮验收通过 */
    M.millLifeState().inspected = true;
    ['waterworks.reservoir', 'pass.cloud_peak', 'camp.frontier'].forEach(k => { s.travel.discovered[k] = true; });
    M.saveNow();
  });
}

/* 门口：走到门前一格按 E（进门不开窗，直接换场景） */
async function enterDoor(x, y, want) {
  ok('走到「' + want + '」门口', await walkTo(p, x, y + 1, 60000));
  await p.keyboard.press('e');
  await p.waitForTimeout(420);
  return settleScene(want);
}
await seedLegit();

/* ================= 一、银行：从镇上办证进城，走进银行柜台 ================= */
console.log('\n【1】R5-C／R5-B 银行自然入口');
const blockedTown = await travelTo('芽芽小镇');
eq('新档已登记小镇，M 地图可直接到镇上', await settleScene('town'), 'town');
eq('到镇上不需要额外前置', blockedTown, '');

ok('走到城驿路按 E 打开通行证窗口', await interactWith(p, 14, 21));
eq('通行证窗口标题', await winTitle(p), '白蔷薇城 · 城市通行证');
ok('窗口说明要先修桥再交 150 金', /修好小镇桥梁/.test(await winText(p)));
const townCoins = await coins();
await clickWin(/办理通行证/);
eq('办证扣掉 150 金', townCoins - (await coins()), 150);
ok('办证后提示向南走', /向南走|通行证/.test(await lastToast(p)));
/* 按提示顺着南方驿路走出小镇：真走，不用传送 */
ok('沿南方驿路走出小镇', await walkTo(p, 14, 23, 25000));
eq('踏上驿路后进入白蔷薇城', await settleScene('city'), 'city');

const door = await p.evaluate(() => {
  const b = __MOSS__.CITY_BUILDINGS.filter(x => x.id === 'bank')[0];
  return { x: b.door.x, y: b.door.y, name: b.label };
});
eq('银行在城里的门牌', door.name, '白蔷薇国立银行');
ok('走到银行门口（沿街走，不传送）', await walkTo(p, door.x, door.y + 1, 90000));
await p.keyboard.press('e');
await p.waitForTimeout(400);
ok('在门口按 E 开门', await winOpen(p) || (await scene()) === 'city_bank');
eq('进入银行室内场景', await settleScene('city_bank'), 'city_bank');
ok('走到柜台按 E 打开银行服务', await interactWith(p, 16, 5));
const bankTitle = await winTitle(p);
ok('银行窗口由柜台打开', /白蔷薇国立银行/.test(bankTitle), bankTitle);
const bankBtns = await btns();
ok('窗口里有申请周转贷按钮', bankBtns.some(t => /申请周转贷/.test(t)), bankBtns.join(' | '));
const beforeLoan = await coins();
await clickWin(/申请周转贷/);
const credit = await p.evaluate(() => {
  const c = __MOSS__.exploreState().credit;
  return { status: c.status, principal: c.principal, dueDay: c.dueDay, rate: c.rate };
});
eq('柜台点击后合同生效', credit.status, 'active');
eq('本金来自规则常量', credit.principal, 300);
eq('放款真的进到金币', (await coins()) - beforeLoan, 300);
ok('提示写明放款不是收入', /不算收入/.test(await lastToast(p)));

/* ================= 二、岗位：从 R3 验收成果走到水利控制室登记 ================= */
console.log('\n【2】R5-A 岗位试任期自然入口');
const blockedWater = await travelTo('水利站');
eq('M 地图抵达水利站', await settleScene('waterworks'), 'waterworks');
eq('水利站不需要额外前置', blockedWater, '');
eq('进入控制室场景', await enterDoor(9, 9, 'waterworks_control'), 'waterworks_control');
ok('走到水位记录与控制台按 E', await interactWith(p, 8, 6));
const postTitle = await winTitle(p);
const postText = await winText(p);
ok('控制室面板带着试任期入口', /登记 28 天岗位试任期/.test(postText), postTitle);
const termsBefore = await p.evaluate(() => (__MOSS__.professionalLifeState().postTerms || []).length);
await clickWin(/登记 28 天岗位试任期/);
const term = await p.evaluate(() => {
  const t = __MOSS__.currentPostTerm('gatekeeper');
  return t ? { id: t.id, startDay: t.startDay, reviewDay: t.reviewDay, budget: t.budget.appropriated, phase: t.phase } : null;
});
ok('按钮真的立起一份 28 天任期',!!term, JSON.stringify(term));
eq('任期从当天开始', term && term.startDay, 10);
eq('任期的复核日在 28 天后', term && (term.reviewDay - term.startDay), 28);
eq('任期处于在岗相位', term && term.phase, 'active');
eq('任期数量加一', await p.evaluate(() => (__MOSS__.professionalLifeState().postTerms || []).length), termsBefore + 1);
eq('任期预算按规则发放', term && term.budget, 120);

/* ================= 三、军事：从云峰山口走到营地登记 ================= */
console.log('\n【3】R5-D 军事权限自然入口');
const blockedPass = await travelTo('云峰山口');
eq('M 地图抵达云峰山口', await settleScene('cloud_pass'), 'cloud_pass');
eq('云峰山口不需要额外前置', blockedPass, '');
ok('走到营地入口按 E', await interactWith(p, 22, 21));
ok('营地入口窗口可开', await winOpen(p), await winTitle(p));
const gateText = await winText(p);
await clickWin(/进入|前往|营地/);
eq('进入边境营地', await settleScene('border_camp'), 'border_camp');
eq('进入指挥室场景', await enterDoor(10, 9, 'border_barracks'), 'border_barracks');
ok('走到巡防登记点按 E', await interactWith(p, 8, 6));
const milTitle = await winTitle(p);
const milText = await winText(p);
ok('登记面板写明这里办的是巡路资格', /巡路资格/.test(milText), milTitle);
ok('面板给出办理巡路登记按钮', /办理巡路登记/.test(milText));
eq('登记前确实没有军籍', await p.evaluate(() => __MOSS__.militaryLifeState().registered), false);
await clickWin(/办理巡路登记/);
const mil = await p.evaluate(() => {
  const m = __MOSS__.militaryLifeState();
  return { registered: m.registered, rank: m.rank, limit: m.commandLimit, fund: m.institutionFund };
});
eq('按钮真的登记成功', mil.registered, true);
eq('登记后是巡路身份', mil.rank, 'patrol');
eq('指挥上限 1 人', mil.limit, 1);
eq('机构军费从头起算', mil.fund, 100);

/* ================= 四、三条路径都没有靠内部函数 ================= */
console.log('\n【4】同一条事实链的自洽检查');
eq('三处 R5 事实都只由按钮产生', await p.evaluate(() => {
  const M = __MOSS__;
  return [M.exploreState().credit.status, !!M.currentPostTerm('gatekeeper'), M.militaryLifeState().registered];
}), ['active', true, true]);
if (r.errors.length) console.log('页面错误：\n  ' + r.errors.join('\n  '));
eq('整程无页面错误', r.errors, []);

console.log(`\nR5 自然入口 ${checks} 项通过${single ? '（单文件版）' : ''}`);
await r.browser.close();
