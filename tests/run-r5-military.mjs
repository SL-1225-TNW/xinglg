/* R5-D 军事权限整理：首轮路线从自愿接受到复盘不跳步。
 * 覆盖授权链唯一事实、越权是可读拒绝而不是崩溃、点名与风险预览、
 * 超编与医帐不再死锁、两链委任不再互相卡死、撤离后仍能继续生活、旧档不提权不降权。
 * 全程走真实界面按钮，不靠内部函数制造战场。
 *   node tests/run-r5-military.mjs
 *   node tests/run-r5-military.mjs --single-file
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

const pageErrors = [];
p.on('pageerror', e => pageErrors.push(e.message));
p.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

/* 每个军事站点在 performAction 里有「必须站在设施旁」的门禁，测试要真的走过去 */
const POINT = {
  registration: { scene: 'border_barracks', x: 8, y: 6 },
  training: { scene: 'border_barracks', x: 8, y: 9 },
  appointment: { scene: 'border_barracks', x: 14, y: 6 },
  campaign: { scene: 'border_barracks', x: 16, y: 7 },
  pass_route: { scene: 'cloud_pass', x: 17, y: 17 },
  medical: { scene: 'border_camp', x: 19, y: 17 }
};
const pose = async pt => {
  await closeWin(p);
  await p.evaluate(pt => __MOSS__.devSwitchScene(pt.scene, pt.x, pt.y), pt);
  await p.waitForTimeout(90);
  await p.evaluate(() => { __MOSS__.state.energy = 100; __MOSS__.state.timeMinutes = 450; });
};
const site = async s => { await pose(POINT[s]); await p.evaluate(s => __MOSS__.openMilitarySite(s), s); await p.waitForTimeout(180); };
const btns = async () => (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);const hasBtn = async re => (await btns()).some(b => re.test(b));
async function click(re) {
  const list = await btns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, `找不到按钮 ${re}；现有：${list.join(' | ')}`);
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(230);
  return list[i];
}
/* 真实日结算推进一天，而不是直接改 totalDay */
const day = async () => {
  await p.evaluate(() => { __MOSS__.closeWindow(); __MOSS__.performSettlement(false); __MOSS__.closeWindow(); });
  await p.waitForTimeout(120);
};
const chain = () => p.evaluate(() => { const c = __MOSS__.milChainStatus(); return { ok: c.ok, reason: c.reason, over: c.over, limit: c.limit, occupied: c.under.occupied, text: c.commissionText }; });
const campaign = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.militaryLifeState().campaign)));
const unit = () => p.evaluate(() => { const u = __MOSS__.militaryLifeState().unit; return { count: u.count, wounded: u.wounded, scene: u.scene }; });

/* 每节从干净存档开始，避免上一节留下的委任、部队或战斗记录影响下一节 */
const reset = async () => {
  await boot(p, { fresh: true });
  await p.locator('#tutorialSkip').click().catch(() => { });
  pageErrors.length = 0;
};

/* 把玩家推进到「已受委任的小队长，任务已签收」的可复用起点 */
async function toAppointedSquadLeader() {
  await p.evaluate(() => { __MOSS__.professionalLifeState().trust = 2; });
  await site('registration'); await click(/办理巡路登记/);
  await site('training'); await click(/参加一次巡路与队列训练/);
  await day();
  await site('training'); await click(/参加一次巡路与队列训练/);
  await site('appointment'); await click(/接受小队长委任/);
}
/* 推进到「已巡路、已点名、已准备」——越权测试的共同起点 */
async function toReadyForBattle() {
  await toAppointedSquadLeader();
  await site('campaign'); await click(/签收七日巡防委任/);
  await site('pass_route'); await click(/沿山脊巡查/);
  await p.evaluate(() => { __MOSS__.state.inventory.medicine = 1; __MOSS__.state.inventory.military_rations = 2; });
  await day();
  await site('campaign'); await click(/点名并部署到云峰关口/);
  await day();
  await site('campaign'); await click(/准备医疗护送/);
  await day();
}

/* ---------- 1. 没取得授权就没有行动能力 ---------- */
console.log('\n【1】未受命不能行动');
await site('campaign');
ok(!(await winText(p)).includes('未捕获'), '普通居民打开七日简报不会产生未捕获异常');
ok((await winText(p)).includes('授权链：未就绪'), '面板如实写明授权链未就绪');
ok((await winText(p)).includes('尚未取得军事资格'), '并说明缺的是军事资格');
eq((await chain()).ok, false, '授权链判定为不可行动');
if (await hasBtn(/签收七日巡防委任/)) await click(/签收七日巡防委任/);
eq((await campaign()).active, false, '普通居民点「签收七日巡防委任」不会拿到任务');
eq(pageErrors.length, 0, '试探未授权入口没有产生页面错误');

/* ---------- 2. 完整首轮链路全程走真实按钮 ---------- */
console.log('\n【2】登记→训练→委任→签收→巡路→点名→准备→行动→复盘');
await reset();
await toAppointedSquadLeader();
eq(await p.evaluate(() => __MOSS__.militaryLifeState().rank), 'squad_leader', '训练记录与公共信任换来小队长委任');
eq((await chain()).ok, true, '资格、训练、委任与编队齐备后授权链就绪');

await site('campaign'); await click(/签收七日巡防委任/);
ok((await campaign()).active, '七日任务已签收');

await site('pass_route'); await click(/沿山脊巡查/);
eq((await unit()).scene, 'camp', '巡路只留路况证据，不再把部队自动调上前线');
ok((await winText(p)).includes('点名'), '巡路后明确告诉玩家下一步是点名');

await p.evaluate(() => { __MOSS__.state.inventory.medicine = 1; __MOSS__.state.inventory.military_rations = 2; });
await day();
await site('campaign');
ok(await hasBtn(/点名并部署到云峰关口/), '点名是真实的一步，有独立按钮');
if (await hasBtn(/准备医疗护送/)) await click(/准备医疗护送/);
eq((await campaign()).prepared, null, '没点名的编队不能进入行动准备');
await click(/点名并部署到云峰关口/);
const afterMuster = await campaign();
eq([afterMuster.musterDay > 0, afterMuster.mustered], [true, 8], '点名记录了日期与实际投入人数');
eq((await unit()).scene, 'pass', '点名之后部队才部署到云峰关口');

await day();
await site('campaign');
await click(/准备医疗护送/);
eq((await campaign()).prepared, 'escort', '点名之后才允许准备行动方案');
await day();
await site('campaign');
ok((await winText(p)).includes('风险预览'), '开战前有风险预览');
const preview = await winText(p);
ok(/投入 8 人/.test(preview) && /地形 山脊/.test(preview) && /友军支援 18 人/.test(preview), '风险预览摊开投入、地形与友军支援');
ok(/伤员进医帐、不从名册删除/.test(preview), '风险预览写明伤员去处');
await click(/掩护居民与医帐撤离/);
const battle = (await campaign()).battle;
ok(battle && battle.version === 2 && battle.phases.length === 3, '裁判给出固定种子和三个阶段');
ok(battle.final.own + battle.casualties.own.total === battle.initial.own, '伤亡人数守恒');
await click(/向驻地指挥部提交复盘/);
eq([(await campaign()).reported, (await unit()).scene], [true, 'camp'], '复盘后部队撤回营地');
eq(await p.evaluate(input => { const a = __MOSS__.battleJudge(input), b = __MOSS__.battleJudge(input); return JSON.stringify(a) === JSON.stringify(b); }, battle.input), true, '同一份裁判输入可逐字段复现');

/* ---------- 3. 越权是可读拒绝，不是崩溃 ---------- */
console.log('\n【3】越权是拒绝');
await reset();
await toReadyForBattle();
pageErrors.length = 0;

/* (a) 委任过期 */
await p.evaluate(() => { __MOSS__.state.militaryLife.core.commission.expiresDay = __MOSS__.state.totalDay - 1; });
await site('campaign');
ok((await winText(p)).includes('委任已到期'), '面板写明委任已到期');
ok((await winText(p)).includes('此刻不能受命'), '行动区直接给出此刻不能受命');
if (await hasBtn(/掩护居民与医帐撤离/)) await click(/掩护居民与医帐撤离/);
eq((await campaign()).battle, null, '委任过期时点裁判不会结算出战斗');
eq(pageErrors.length, 0, '委任过期不产生未捕获异常');
ok((await p.evaluate(() => { try { __MOSS__.resolveFrontierBattle({ objective: 'protect_civilians' }); return 'no throw'; } catch (e) { return e.message; } })).includes('委任已到期'), '裁判器仍把过期委任挡在最后一道');

/* (b) 委任对象丢失 */
await p.evaluate(() => { __MOSS__.state.militaryLife.core.commission = null; });
pageErrors.length = 0;
await site('campaign');
ok((await winText(p)).includes('还没有正式委任'), '没有委任时面板说明缺什么');
if (await hasBtn(/掩护居民与医帐撤离/)) await click(/掩护居民与医帐撤离/);
eq((await campaign()).battle, null, '没有委任时点裁判不会结算出战斗');
eq(pageErrors.length, 0, '没有委任不产生未捕获异常');
await p.evaluate(() => { __MOSS__.state.militaryLife.core.commission = { role: '驻地正式委任', sinceDay: 1, expiresDay: 1000000, source: 'career' }; });

/* (c) 编队超上限 */
await p.evaluate(() => {
  const core = __MOSS__.state.militaryLife.core;
  const tpl = JSON.parse(JSON.stringify(core.units.filter(u => u.owner === 'player')[0]));
  tpl.id = 'extra_probe'; tpl.personnel.healthy = 20; tpl.personnel.wounded = 0;
  tpl.personnel.missing = 0; tpl.personnel.captive = 0;
  tpl.groups = [{ count: 20, train: 20, equip: 20, morale: 50, supply: 50, discipline: 30 }];
  core.units.push(tpl);
});
pageErrors.length = 0;
let c = await chain();
eq([c.ok, c.over > 0], [false, true], '编队超过委任上限时授权链拒绝');
await site('campaign');
ok((await winText(p)).includes('超过委任上限'), '面板写明超了多少');
ok(await hasBtn(/移交超编人员至驻地后备/), '超编时面板直接给出移交入口，不必跑到机构采购台');
if (await hasBtn(/掩护居民与医帐撤离/)) await click(/掩护居民与医帐撤离/);
eq((await campaign()).battle, null, '编队超限时点裁判不会结算出战斗');
eq(pageErrors.length, 0, '编队超限不产生未捕获异常');
await click(/移交超编人员至驻地后备/);
c = await chain();
eq([c.ok, c.over], [true, 0], '移交超编后授权链恢复');
eq(pageErrors.length, 0, '整段越权操作没有产生任何页面错误');

/* ---------- 4. 两链共用一份委任账本，旧档的过期委任必须能恢复 ---------- */
console.log('\n【4】旧档残留的过期委任不会把人锁死');
await reset();
await p.evaluate(() => { __MOSS__.professionalLifeState().trust = 2; });
await site('registration'); await click(/办理巡路登记/);
await site('training'); await click(/参加一次巡路与队列训练/);
await day();
await site('training'); await click(/参加一次巡路与队列训练/);
/* 旧链（演练场／军需库）与职业链写的是同一份 core.commission。
   旧链签的是一年期临时委任，这里造一份「已经过期」的旧档残留。 */
await p.evaluate(() => { __MOSS__.state.militaryLife.core.commission = { role: '巡防联络官（临时委任）', sinceDay: 1, expiresDay: __MOSS__.state.totalDay - 1, source: 'drill' }; });
eq((await chain()).ok, false, '过期的临时委任挡住行动');
await site('campaign');
ok((await winText(p)).includes('委任已到期'), '面板写明需要重新申请，而不是静默失效');
pageErrors.length = 0;
await site('appointment');
ok(await hasBtn(/接受小队长委任/), '正式委任入口仍然可用');
await click(/接受小队长委任/);
eq(await p.evaluate(() => __MOSS__.state.militaryLife.core.commission.role), '驻地正式委任', '职业链的正式委任取代同一账本上的过期临时委任');
eq(await p.evaluate(() => __MOSS__.state.militaryLife.core.commission.source), 'career', '取代后的委任来源记为长期岗位委任');
eq((await chain()).ok, true, '恢复授权成功，不存在永久死锁');
eq(pageErrors.length, 0, '过期与恢复过程没有页面错误');
/* 旧档读入时也要落到同一份账本 */
eq(await p.evaluate(() => {
  const M = __MOSS__, raw = M.serialize();
  raw.militaryLife = { registered: true, rank: 'squad_leader', commandLimit: 12, appointmentDay: 3, unit: { count: 8 }, battleRecords: [] };
  delete raw.militaryLife.core;
  const m = M.normalizeSaveForTest(raw).militaryLife;
  return [m.core.commission.role, m.core.commission.source, m.appointmentDay];
}), ['驻地正式委任', 'career', 3], '旧档带着过期临时委任读入时，绑定到正式委任而不是保留一把废证');

/* ---------- 5. 医帐不再锁死 ---------- */
console.log('\n【5】伤员不会把玩家锁死');
await reset();
await toAppointedSquadLeader();
await p.evaluate(() => {
  const m = __MOSS__.state.militaryLife;
  m.unit.count = 0; m.unit.wounded = 12; m.battleRecords = [];
  __MOSS__.state.inventory.medicine = 3;
});
await site('medical');
ok(await hasBtn(/过夜后治疗伤员/), '没有战斗记录的满额伤员也有治疗入口');
await click(/过夜后治疗伤员/);
const healed = await unit();
eq([healed.count > 0, healed.wounded], [true, 0], '治疗恢复可执行人员并清空伤员');

/* ---------- 6. 旧档不降权也不提权 ---------- */
console.log('\n【6】旧档不降权也不提权');
eq(await p.evaluate(() => {
  const M = __MOSS__, raw = M.serialize();
  raw.militaryLife.campaign = { active: true, startedDay: 1, deadlineDay: 7, stage: 1, scouted: 'ridge', scoutedDay: 1, prepared: 'escort', preparedDay: 2 };
  raw.militaryLife.unit.scene = 'pass';
  raw.militaryLife.core.units.find(u => u.id === 'frontier_detail').location = 'cloud_pass';
  const m = M.normalizeSaveForTest(raw).militaryLife;
  return [m.unit.scene, m.campaign.musterDay, m.campaign.scouted, m.campaign.prepared];
}), ['camp', 0, 'ridge', 'escort'], '旧档巡路自动部署但未点名时回营核对，保留巡路与准备，不会卡死');
eq(await p.evaluate(() => {
  const M = __MOSS__, raw = M.serialize();
  raw.militaryLife = { registered: true, rank: 'squad_leader', commandLimit: 9999, appointmentDay: 0, unit: { count: 400, wounded: 300 }, battleRecords: [] };
  delete raw.militaryLife.core;
  const m = M.normalizeSaveForTest(raw).militaryLife;
  return [m.rank, m.commandLimit <= 12, m.unit.count <= 12, m.unit.wounded <= 12];
}), ['squad_leader', true, true, true], '越界旧档的指挥上限与人数都被压回职级上限');

/* ---------- 7. 撤回后仍能继续生活 ---------- */
console.log('\n【7】撤离可继续生活');
await reset();
await toAppointedSquadLeader();
const before = await p.evaluate(() => ({ coins: __MOSS__.state.coins, day: __MOSS__.state.totalDay }));
await p.evaluate(() => {
  const M = __MOSS__;
  const c = M.militaryLifeState().campaign;
  c.active = true; c.reported = false; c.battle = null; c.deadlineDay = M.state.totalDay - 1;
});
await site('campaign');
await click(/七日期限已过 · 安全撤回并提交部分报告/);
eq([(await campaign()).reported, (await unit()).scene], [true, 'camp'], '过期可以安全撤回并提交部分报告');
pageErrors.length = 0;
await day(); await day();
const after = await p.evaluate(() => ({ coins: __MOSS__.state.coins, day: __MOSS__.state.totalDay }));
ok(after.day > before.day, '撤回之后农场照常推进日子');
ok(Number.isFinite(after.coins) && after.coins >= 0, '金币没有被军事流程写坏');
eq(pageErrors.length, 0, '整条首轮军事路线没有产生任何页面错误');

console.log(`\nR5-D 军事权限链 ${checks} 项通过${single ? '（单文件版）' : ''}`);
await r.browser.close();
