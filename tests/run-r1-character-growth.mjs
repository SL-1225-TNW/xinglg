// 第八版 R1：角色等级、五属性、经验、防重复、预算不变量与天赋真实生效。
//
// 规则验收和界面专项放在这里；自然新档只走真实劳动路径，不用注入等级。
// 需要把角色推到高等级时用 __MOSS__ 的测试接口，但会注明这是夹具。
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const run = await launch();
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; console.log('PASS', label); };
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('PASS', label); };

try {
  const p = run.page;
  await boot(p);
  await p.locator('#tutorialSkip').click();
  const v = (fn, arg) => p.evaluate(fn, arg);

  /* --- 规则：新档账本 --- */
  const fresh = await v(() => ({ ...__MOSS__.charState(), attr: { ...__MOSS__.charState().attr } }));
  eq([fresh.level, fresh.exp, fresh.attrPoints], [1, 0, 10], '新档为等级 1、0 经验、未分配创建点 10');
  eq(Object.values(fresh.attr), [5, 5, 5, 5, 5], '新档五项属性各为基础 5');
  eq(fresh.talentPoints, 0, '新档没有天赋点');

  /* --- 规则：经验升级给属性点，曲线按 60+15(L-1) --- */
  const lvl = await v(() => {
    const m = __MOSS__;
    m.grantCharExp(1000, 'test');
    const a = { level: m.charState().level, attrPoints: m.charState().attrPoints };
    m.resetCharForTest && m.resetCharForTest();
    return a;
  });
  ok(lvl.level >= 3, '经验足够时连续升级');
  eq(lvl.attrPoints - 10, lvl.level - 1, '每级恰好 1 点属性，点数守恒');

  /* --- 规则：阶段上限封顶，溢出经验不结转 --- */
  const capped = await v(() => {
    const m = __MOSS__;
    m.state.char.level = 10; m.state.char.exp = 0;
    const got = m.grantCharExp(99999, 'cap');
    return { got, level: m.charState().level, exp: m.charState().exp, paused: !!m.charState().expPausedAtCap };
  });
  eq(capped.got, 0, '达到阶段上限后不再发放经验');
  eq(capped.level, 10, '等级不超过阶段上限 10');
  ok(capped.paused, '记录已达上限，界面会说明暂停发放');

  /* --- 规则：一次性来源只发一次 --- */
  const once = await v(() => {
    const m = __MOSS__;
    m.state.char.level = 1; m.state.char.exp = 0; m.state.char.expGrants = {};
    const a = m.grantCharExpOnce('x.1', 60, 'test');
    const b = m.grantCharExpOnce('x.1', 60, 'test');
    return [a, b];
  });
  eq(once, [60, 0], '同一稳定 ID 只发一次经验');

  /* --- 规则：每日封顶只影响经验 --- */
  const daily = await v(() => {
    const m = __MOSS__;
    m.state.char.level = 1; m.state.char.exp = 0; m.state.char.expGrants = {}; m.state.char.expDaily = {}; m.state.char.expDailyDay = m.state.totalDay;
    let total = 0;
    for (let i = 0; i < 20; i++) total += m.grantCharExpDaily('farm', 2);
    return total;
  });
  eq(daily, 20, '农事类每日封顶 20 点');

  /* --- 规则：跨天自动重置计数 --- */
  const nextDay = await v(() => {
    const m = __MOSS__;
    m.state.totalDay += 1;
    return m.grantCharExpDaily('farm', 2);
  });
  eq(nextDay, 2, '跨天后封顶计数重置，劳动经验恢复发放');

  /* --- 规则：坏档不能造出满级满点 --- */
  const bad = await v(() => {
    const c = __MOSS__.normalizeChar({ level: 999, exp: 999999, attr: { int: 999, sense: -50 }, attrPoints: 99999, talentPoints: 999 }, 1);
    return {
      level: c.level, exp: c.exp, need: __MOSS__.charExpToNext(c.level),
      int: c.attr.int, sense: c.attr.sense, attrPoints: c.attrPoints, talentPoints: c.talentPoints
    };
  });
  eq(bad.level, 10, '坏档等级被夹到阶段上限 10');
  ok(bad.exp < bad.need, '坏档经验被夹到下一级阈值以下，不会在扩容时瞬间满级');
  eq([bad.int, bad.sense], [19, 5], '坏档属性夹在基础 5 与上限 20 之间');
  eq(bad.talentPoints, 3, '10 级只能获得 3 个天赋点');
  ok(bad.attrPoints >= 0 && bad.attrPoints <= 44, '坏档属性点不超出阶段预算');

  /* --- 规则：预算不变量，洗点后仍成立 --- */
  const budget = await v(() => {
    const m = __MOSS__;
    m.state.char.level = 5; m.state.char.exp = 0;
    m.state.char.attr = { int: 9, sense: 6, nerve: 5, body: 7, luck: 5 };
    /* 5 级额外属性预算 14：已分配 7 + 未分配 7；天赋预算单独为 1。 */
    m.state.char.attrPoints = 7; m.state.char.spentTalents = 1; m.state.char.talents = { save_strength: true }; m.state.char.talentPoints = 0;
    const before = m.charBudget();
    m.charApplyRespec();
    const after = m.charBudget();
    return { before, after, attr: { ...m.state.char.attr }, attrPoints: m.state.char.attrPoints, talents: { ...m.state.char.talents } };
  });
  eq(budget.before.spentTotal, budget.before.earned, '洗点前已分配 + 未分配 = 总产出');
  eq(budget.after.spentTotal, budget.after.earned, '洗点后预算仍然闭合，没有凭空多点');
  eq(Object.values(budget.attr), [5, 5, 5, 5, 5], '洗点后五项属性退回基础 5');
  eq(budget.attrPoints, budget.before.earned, '洗点后全部点数可重新分配，不多不少');
  eq(Object.keys(budget.talents).length, 0, '洗点清空已学天赋并返还点数');

  /* --- 规则：任务/关系/资格不随洗点删除 --- */
  const kept = await v(() => {
    const m = __MOSS__;
    m.state.questProgress[1] = 'done';
    m.state.npcFriendship.yaya = 42;
    m.charApplyRespec();
    return { quest: m.state.questProgress[1], friend: m.state.npcFriendship.yaya };
  });
  eq(kept, { quest: 'done', friend: 42 }, '洗点不删除已完成任务与关系');

  /* --- 规则：会话事务中不可洗点 --- */
  const busy = await v(() => {
    const m = __MOSS__;
    const before = JSON.stringify(m.state.char);
    m.Game.busy = 'settle';
    const err = m.charApplyRespec();
    m.Game.busy = null;
    return { err, unchanged: JSON.stringify(m.state.char) === before };
  });
  ok(!!busy.err && busy.unchanged, '结算事务进行中拒绝洗点且不改变账本');

  /* --- 界面专项：真实按键加点 --- */
  await p.locator('#btnCharacter').click();
  const addBefore = await v(() => ({ attr: { ...__MOSS__.charState().attr }, pts: __MOSS__.charState().attrPoints }));
  await p.locator('.win-body button', { hasText: '+1 点' }).first().click();
  const addAfter = await v(() => ({ attr: { ...__MOSS__.charState().attr }, pts: __MOSS__.charState().attrPoints }));
  eq(addAfter.pts, addBefore.pts - 1, '点击加点后未分配点数减 1');
  ok(addAfter.attr.int === addBefore.attr.int + 1, '智力实际提升 1 点');

  /* --- 天赋真实生效：节省力气 ---
     通过 charLearnTalent 正常学习，而不是直接写 talents 字段，
     免得测试绕过学习路径还误以为天赋已生效。 */
  const tal = await v(() => {
    const m = __MOSS__;
    m.state.char.level = 3; m.state.char.talentPoints = 1; m.state.char.attr = { int: 5, sense: 5, nerve: 5, body: 8, luck: 5 };
    m.state.char.talents = {}; m.state.char.spentTalents = 0;
    m.state.char.expDaily = {}; m.state.char.expDailyDay = m.state.totalDay;
    const learned = m.charLearnTalent('save_strength');
    m.state.energy = 100;
    m.charSpendEnergy(4);
    return { learned, spent: 100 - m.state.energy, has: m.hasTalent('save_strength') };
  });
  eq(tal.learned, '', '先通过正常学习路径学会「节省力气」');
  eq(tal.has, true, '学会后 hasTalent 为真');
  eq(tal.spent, 3, '节省力气体力：4 点实际只扣 3 点（每次最多减 1）');

  const talCap = await v(() => {
    const m = __MOSS__;
    m.state.char.expDaily = {}; m.state.char.expDailyDay = m.state.totalDay;
    m.state.energy = 100;
    let cuts = 0;
    for (let i = 0; i < 12; i++) { m.state.energy = 100; m.charSpendEnergy(4); if (100 - m.state.energy === 3) cuts++; }
    return cuts;
  });
  eq(talCap, 10, '节省力气每日最多减免 10 点');

  /* --- 天赋真实生效：均衡饮食 --- */
  const meal = await v(() => {
    const m = __MOSS__;
    m.state.char.level=6;m.state.char.talents={};m.state.char.spentTalents=0;m.state.char.talentPoints=2;
    if(m.charLearnTalent('balanced_meal'))throw Error('未能正常学习均衡饮食');
    const id = 'radish';
    m.state.inventory[id] = 1; m.state.energy = 0;
    const raw = m.ITEMS[id].food;
    m.eatItem(id);
    return { recovered: m.state.energy, raw };
  });
  eq(meal.recovered, Math.floor(meal.raw * 1.15), '通过正常学习后食物确实恢复 115%，而非仅不低于原值');

  /* --- 天赋点数守恒：学习消耗 1 点且计入 spentTalents --- */
  const learn = await v(() => {
    const m = __MOSS__;
    m.state.char.talentPoints = 1; m.state.char.spentTalents = 0; m.state.char.talents = {};
    /* 先加够健康，才能验证「条件满足时可学」这条正向路径 */
    m.state.char.attr = { int: 5, sense: 5, nerve: 5, body: 8, luck: 5 };
    const err = m.charLearnTalent('save_strength');
    return { err, talentPoints: m.state.char.talentPoints, spent: m.state.char.spentTalents, learned: !!m.state.char.talents.save_strength };
  });
  eq(learn.err, '', '满足条件时天赋可学');
  eq([learn.talentPoints, learn.spent, learn.learned], [0, 1, true], '学习消耗 1 点并计入已花天赋');

  /* 属性不足时必须拒绝，且不扣点 */
  const lowAttr = await v(() => {
    const m = __MOSS__;
    m.state.char.talents = {}; m.state.char.spentTalents = 0; m.state.char.talentPoints = 1;
    m.state.char.attr = { int: 5, sense: 5, nerve: 5, body: 5, luck: 5 };
    const err = m.charLearnTalent('save_strength');
    return { err, talentPoints: m.state.char.talentPoints, learned: !!m.state.char.talents.save_strength };
  });
  ok(!!lowAttr.err && lowAttr.talentPoints === 1 && !lowAttr.learned, '属性不足时拒绝学习且不扣点');

  const noDouble = await v(() => {
    const m = __MOSS__;
    m.state.char.attr.body=8;m.state.char.talentPoints=2;
    if(m.charLearnTalent('save_strength'))throw Error('首次学习失败');
    const err = m.charLearnTalent('save_strength');
    return { err, talentPoints: m.state.char.talentPoints };
  });
  ok(!!noDouble.err && noDouble.talentPoints === 1, '重复学习被拒绝且不扣点');

  const r2Locked = await v(() => {
    const m = __MOSS__;
    m.state.char.talentPoints = 8; m.state.char.attr = { int: 9, sense: 9, nerve: 9, body: 9, luck: 9 };
    const before = m.state.char.talentPoints;
    const err = m.charLearnTalent('果断反击');
    return { err, unchanged: m.state.char.talentPoints === before };
  });
  ok(!!r2Locked.err && r2Locked.unchanged, '后续十五节点仍不能学，且不扣点');

  /* --- 存读档往返：等级/属性/天赋/去重记录都保留 --- */
  await v(() => {
    const m = __MOSS__;
    m.state.char.level = 4; m.state.char.exp = 12; m.state.char.attr = { int: 8, sense: 7, nerve: 5, body: 8, luck: 5 };
    m.state.char.attrPoints = 5; m.state.char.talents = { save_strength: true }; m.state.char.spentTalents = 1; m.state.char.talentPoints = 0;
    m.state.char.expGrants = { 'quest.1': 1 };
    m.saveNow();
  });
  await p.reload();
  await p.locator('.boot-actions button').first().click();
  const round = await v(() => {
    const c = __MOSS__.charState();
    return { level: c.level, exp: c.exp, attr: { ...c.attr }, attrPoints: c.attrPoints, talents: { ...c.talents }, grants: Object.keys(c.expGrants || {}).length };
  });
  eq([round.level, round.exp, round.attrPoints], [4, 12, 5], '重载后等级、经验与未分配点数保留');
  eq(round.attr.int, 8, '重载后属性保留');
  eq(round.talents.save_strength, true, '重载后已学天赋保留');
  eq(round.grants, 1, '重载后经验去重记录保留，不会重发');

  const oldSave = await v(() => {
    const c = __MOSS__.normalizeChar(undefined, 1);
    return { level: c.level, attrPoints: c.attrPoints, attr: { ...c.attr } };
  });
  eq([oldSave.level, oldSave.attrPoints], [1, 10], '旧档首次迁移给等级 1 与未分配创建点 10');
  eq(Object.values(oldSave.attr), [5, 5, 5, 5, 5], '旧档迁移不按历史天数补发属性');

  eq(run.errors, [], '浏览器无未捕获错误');
} finally {
  await run.browser.close();
}
console.log(`第八版 R1 角色成长 ${checks} 项通过`);
