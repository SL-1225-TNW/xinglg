/* R5 触屏证据：390×844 竖屏 + 触摸输入（docs/r5-takeover-review-2026-10-19.md 第五节第 4 条）
 *
 * 与 run-r5-natural-entry.mjs 同一套夹具边界，但**所有 R5 界面都靠触摸操作**：
 *   · 方向键 = 触屏 dpad 的 pointerdown/pointerup（长按），不是键盘
 *   · 交互 = #touchAct（触屏「交互」键），不是 E
 *   · 地图 = #touchMap（触屏「地图」键），不是 M
 *   · 窗口按钮 = .tap()（真实触摸事件），不是 click()
 * 只有跨城镇的长距离赶路仍用键盘 walkTo 辅助（等同玩家按住方向键），
 * 这一点在下面每条断言之前都写明，免得把「辅助走路」误读成「产品靠键盘」。
 *
 *   node tests/run-r5-mobile-touch.mjs
 *   node tests/run-r5-mobile-touch.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winTitle, winText, walkTo, walkAdjacent, faceTowards, lastToast } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (n, a, b) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (n, c, d) => { assert.ok(c, d === undefined ? n : n + ' — ' + d); checks++; console.log('PASS', n); };

const MOBILE = { width: 390, height: 844 };
const r = await launch(Object.assign({ touch: true, viewport: MOBILE },
  single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}));
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const scene = () => p.evaluate(() => __MOSS__.state.sceneId);
const coins = () => p.evaluate(() => __MOSS__.state.coins);
const btns = async () => (await p.locator('.win button').allTextContents()).map(s => s.trim()).filter(Boolean);

/* 触屏「交互」键：等同手指点一下屏幕右下角的交互按钮 */
async function tapAct() {
  await p.locator('#touchAct').tap();
  await p.waitForTimeout(320);
}
/* 触屏方向键长按：pointerdown 按住 ms 毫秒再抬起，movement 由游戏主循环推进 */
async function holdDir(dir, ms) {
  const sel = '[data-dir="' + dir + '"]';
  await p.locator(sel).dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  await p.waitForTimeout(ms);
  await p.locator(sel).dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true });
  await p.waitForTimeout(160);
}
/* 触摸点窗口按钮（真实 touch 事件，不是鼠标 click） */
async function tapWin(re) {
  const list = await btns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win button').nth(i).tap();
  await p.waitForTimeout(340);
  return list[i];
}
/* 触屏地图：#touchMap → 地点 → 「传送过去」 */
async function mapTo(name) {
  await closeWin(p);
  await p.locator('#touchMap').tap();
  await p.waitForTimeout(300);
  let node = p.getByRole('button', { name: new RegExp('^' + name) });
  if (!(await node.count())) {
    const zoom = p.getByRole('button', { name: '全境总图' });
    if (await zoom.count()) { await zoom.first().tap(); await p.waitForTimeout(320); }
    node = p.getByRole('button', { name: new RegExp('^' + name) });
  }
  assert.ok(await node.count(), '触屏地图上没有「' + name + '」；当前窗口「' + (await winTitle(p)) + '」');
  await node.first().tap();
  await p.waitForTimeout(240);
  const blocked = (await p.locator('.travel-blocked').allTextContents().catch(() => [])).join(' ').trim();
  const go = p.getByRole('button', { name: '传送过去', exact: true });
  assert.ok(await go.count(), '「' + name + '」不能传送：' + (blocked || '无传送按钮'));
  await go.first().tap();
  await p.waitForTimeout(360);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(220);
  return blocked;
}
async function settleScene(want) {
  await p.waitForFunction(w => window.__MOSS__ && __MOSS__.state.sceneId === w, want, { timeout: 9000 }).catch(() => { });
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(200);
  return scene();
}
/* 走到目标旁边、正对它、再点触屏交互键（等同：走到柜台前，手指点「交互」） */
async function tapNear(x, y) {
  const spot = await walkAdjacent(p, x, y);
  if (!spot) return false;
  await faceTowards(p, x, y);
  await tapAct();
  return winOpen(p);
}

/* ================= 一、竖屏布局与触屏控件 ================= */
console.log('\n【1】390×844 竖屏布局与触屏控件');
const layout = await p.evaluate(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const box = sel => { const n = document.querySelector(sel); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const ids = ['touchUse', 'touchAct', 'touchBag', 'touchCraft', 'touchQuest', 'touchMap', 'touchChar'];
  const sizes = {};
  ids.forEach(id => { const b = box('#' + id); sizes[id] = b ? { w: Math.round(b.w), h: Math.round(b.h), visible: b.w > 0 && b.y + b.h <= vh + 1 } : null; });
  const dirs = Array.prototype.map.call(document.querySelectorAll('[data-dir]'), b => {
    const x = b.getBoundingClientRect();
    return { dir: b.getAttribute('data-dir'), w: Math.round(x.width), h: Math.round(x.height) };
  });
  return {
    vw, vh,
    scrollW: document.documentElement.scrollWidth,
    canvas: box('#world'),
    sizes, dirs,
    touchVisible: !!document.querySelector('#touch') && document.querySelector('#touch').getBoundingClientRect().width > 0,
    hotbarSlots: document.querySelectorAll('#hotbar .slot').length,
    hotbarLabels: Array.prototype.map.call(document.querySelectorAll('#hotbar .slot'), b => b.getAttribute('aria-label') || '')
  };
});
eq('390×844 视口没有横向溢出', layout.scrollW <= layout.vw + 1, true);
eq('触屏控件组可见', layout.touchVisible, true);
eq('画布宽度不超出竖屏', layout.canvas && layout.canvas.w <= layout.vw + 1, true);
eq('触屏方向键四向齐全', layout.dirs.map(d => d.dir).sort(), ['-1,0', '0,-1', '0,1', '1,0']);
ok('四个方向键都是手指可点的尺寸', layout.dirs.every(d => d.w >= 36 && d.h >= 36), JSON.stringify(layout.dirs));
const touchIds = ['touchUse', 'touchAct', 'touchBag', 'touchCraft', 'touchQuest', 'touchMap', 'touchChar'];
ok('七个触屏功能键都在屏幕内', touchIds.every(id => layout.sizes[id] && layout.sizes[id].visible), JSON.stringify(layout.sizes));
ok('触屏功能键不小于 36×24', touchIds.every(id => layout.sizes[id] && layout.sizes[id].w >= 36 && layout.sizes[id].h >= 24), JSON.stringify(layout.sizes));
eq('竖屏里快捷栏工具齐全（含小铲子与施肥）', layout.hotbarSlots, 10);
ok('竖屏快捷栏第 9、10 格是小铲子与施肥',
  layout.hotbarLabels.some(t => /小铲子/.test(t)) && layout.hotbarLabels.some(t => /施肥/.test(t)),
  layout.hotbarLabels.join(' | '));

/* 触屏方向键真的能走一格（长按 320ms ≈ 一格多的距离） */
const startPos = await p.evaluate(() => ({ x: __MOSS__.state.player.x, y: __MOSS__.state.player.y }));
await holdDir('0,1', 320);
const afterDir = await p.evaluate(() => ({ x: __MOSS__.state.player.x, y: __MOSS__.state.player.y }));
ok('长按触屏「▼」人物向下走', afterDir.y > startPos.y, JSON.stringify(startPos) + ' → ' + JSON.stringify(afterDir));
eq('长按触屏方向键不会横向漂移', afterDir.x, startPos.x);

/* ================= 二、触屏打开的几个基础窗口 ================= */
console.log('\n【2】触屏窗口：背包 / 任务 / 地图');
await p.locator('#touchBag').tap();
await p.waitForTimeout(280);
ok('触屏「背包」开窗', await winOpen(p), await winTitle(p));
await closeWin(p);
await p.locator('#touchQuest').tap();
await p.waitForTimeout(280);
ok('触屏「任务」开窗', await winOpen(p), await winTitle(p));
await closeWin(p);
await p.locator('#touchMap').tap();
await p.waitForTimeout(300);
ok('触屏「地图」开窗', await winOpen(p), await winTitle(p));
const winBox = await p.locator('.win').first().boundingBox();
ok('窗口宽度收在竖屏内', winBox && winBox.width <= layout.vw, winBox && Math.round(winBox.width));
await closeWin(p);

/* ================= 三、夹具：只给 R3/R4 既有成果 ================= */
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
  M.millLifeState().inspected = true;
  ['waterworks.reservoir', 'pass.cloud_peak', 'camp.frontier'].forEach(k => { s.travel.discovered[k] = true; });
  M.saveNow();
});

/* ================= 四、银行：触屏办证 → 触屏开柜台 → 触屏点放款 ================= */
console.log('\n【3】R5-C／R5-B 银行：竖屏触屏操作');
const blockedTown = await mapTo('芽芽小镇');
eq('触屏地图抵达小镇', await settleScene('town'), 'town');
eq('到镇上不需要额外前置', blockedTown, '');
ok('走到城驿路点触屏「交互」', await tapNear(14, 21));
eq('通行证窗口标题', await winTitle(p), '白蔷薇城 · 城市通行证');
const townCoins = await coins();
await tapWin(/办理通行证/);
eq('触屏办证扣 150 金', townCoins - (await coins()), 150);
ok('办证提示向南走', /向南走|通行证/.test(await lastToast(p)));
/* 长距离赶路用键盘 walkTo 辅助（等同按住方向键），界面仍全部靠触摸 */
ok('沿南方驿路走出小镇（键盘辅助赶路）', await walkTo(p, 14, 23, 25000));
eq('踏上驿路进入白蔷薇城', await settleScene('city'), 'city');
const door = await p.evaluate(() => {
  const b = __MOSS__.CITY_BUILDINGS.filter(x => x.id === 'bank')[0];
  return { x: b.door.x, y: b.door.y };
});
ok('走到银行门口（键盘辅助赶路）', await walkTo(p, door.x, door.y + 1, 90000));
await tapAct();
await p.waitForTimeout(400);
eq('触屏交互键推门进银行', await settleScene('city_bank'), 'city_bank');
ok('走到柜台点触屏「交互」', await tapNear(16, 5));
ok('银行窗口由柜台打开', /白蔷薇国立银行/.test(await winTitle(p)), await winTitle(p));
const bankBtns = await btns();
ok('窗口里有申请周转贷按钮', bankBtns.some(t => /申请周转贷/.test(t)), bankBtns.join(' | '));
const bankWinBox = await p.locator('.win').first().boundingBox();
ok('银行窗口不超出竖屏宽度', bankWinBox && bankWinBox.width <= MOBILE.width, bankWinBox && Math.round(bankWinBox.width));
const beforeLoan = await coins();
await tapWin(/申请周转贷/);
const credit = await p.evaluate(() => {
  const c = __MOSS__.exploreState().credit;
  return { status: c.status, principal: c.principal };
});
eq('触屏点击后合同生效', credit.status, 'active');
eq('本金来自规则常量', credit.principal, 300);
eq('放款真的进到金币', (await coins()) - beforeLoan, 300);
ok('提示写明放款不是收入', /不算收入/.test(await lastToast(p)));

/* ================= 五、岗位：触屏走进控制室并登记 ================= */
console.log('\n【4】R5-A 岗位试任期：竖屏触屏操作');
const blockedWater = await mapTo('水利站');
eq('触屏地图抵达水利站', await settleScene('waterworks'), 'waterworks');
eq('水利站不需要额外前置', blockedWater, '');
await walkAdjacent(p, 9, 9);
await faceTowards(p, 9, 9);
await tapAct();
eq('触屏交互键进入控制室', await settleScene('waterworks_control'), 'waterworks_control');
ok('走到控制台点触屏「交互」', await tapNear(8, 6));
ok('控制室面板带试任期入口', /登记 28 天岗位试任期/.test(await winText(p)), await winTitle(p));
const termsBefore = await p.evaluate(() => (__MOSS__.professionalLifeState().postTerms || []).length);
await tapWin(/登记 28 天岗位试任期/);
const term = await p.evaluate(() => {
  const t = __MOSS__.currentPostTerm('gatekeeper');
  return t ? { startDay: t.startDay, reviewDay: t.reviewDay, budget: t.budget.appropriated, phase: t.phase } : null;
});
ok('触屏按钮真的立起一份 28 天任期', !!term, JSON.stringify(term));
eq('任期从当天开始', term && term.startDay, 10);
eq('复核日在 28 天后', term && (term.reviewDay - term.startDay), 28);
eq('任期处于在岗相位', term && term.phase, 'active');
eq('任期数量加一', await p.evaluate(() => (__MOSS__.professionalLifeState().postTerms || []).length), termsBefore + 1);
eq('任期预算按规则发放', term && term.budget, 120);

/* ================= 六、军事：触屏进营地登记巡路 ================= */
console.log('\n【5】R5-D 军事权限：竖屏触屏操作');
const blockedPass = await mapTo('云峰山口');
eq('触屏地图抵达云峰山口', await settleScene('cloud_pass'), 'cloud_pass');
eq('云峰山口不需要额外前置', blockedPass, '');
ok('走到营地入口点触屏「交互」', await tapNear(22, 21));
ok('营地入口窗口可开', await winOpen(p), await winTitle(p));
await tapWin(/进入|前往|营地/);
eq('触屏进入边境营地', await settleScene('border_camp'), 'border_camp');
await walkAdjacent(p, 10, 9);
await faceTowards(p, 10, 9);
await tapAct();
eq('触屏交互键进入指挥室', await settleScene('border_barracks'), 'border_barracks');
ok('走到巡防登记点点触屏「交互」', await tapNear(8, 6));
const milText = await winText(p);
ok('登记面板写明巡路资格', /巡路资格/.test(milText), await winTitle(p));
eq('登记前确实没有军籍', await p.evaluate(() => __MOSS__.militaryLifeState().registered), false);
await tapWin(/办理巡路登记/);
const mil = await p.evaluate(() => {
  const m = __MOSS__.militaryLifeState();
  return { registered: m.registered, rank: m.rank, limit: m.commandLimit, fund: m.institutionFund };
});
eq('触屏按钮真的登记成功', mil.registered, true);
eq('登记后是巡路身份', mil.rank, 'patrol');
eq('指挥上限 1 人', mil.limit, 1);
eq('机构军费从头起算', mil.fund, 100);

/* ================= 七、复核：竖屏里三处事实同时成立 ================= */
console.log('\n【6】竖屏复核与无报错');
eq('三处 R5 事实都只由触摸按钮产生', await p.evaluate(() => {
  const M = __MOSS__;
  return [M.exploreState().credit.status, !!M.currentPostTerm('gatekeeper'), M.militaryLifeState().registered];
}), ['active', true, true]);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('走完三条路径仍无横向溢出', overflow <= 1, String(overflow));
if (r.errors.length) console.log('页面错误：\n  ' + r.errors.join('\n  '));
eq('整程无页面错误', r.errors, []);

console.log(`\nR5 触屏 390×844 ${checks} 项通过${single ? '（单文件版）' : ''}`);
await r.browser.close();
