/* 工程师职业章节（规划建议 3：先做透一条职业线）
   见习 → 独立项目 → 事故处置 → 正式岗位 → 主持争议工程
   验收重点：每次晋升都要改变一种实际玩法，不能只涨一个数字。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
const ok = (name, actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), name);
  checks++; console.log('PASS', name);
};

const run = await launch();
try {
  const p = run.page;
  await boot(p);
  const v = (fn, a) => p.evaluate(fn, a);

  // 0. 起步：没有岗位权限
  await v(() => __MOSS__.resetCareerForTest());
  let c = await v(() => __MOSS__.engInfo());
  ok('起步为见习阶段', c.stage, 0);
  ok('见习没有任何岗位权限', c.can, { signReport: false, emergencyRepair: false, requestBudget: false, delegate: false, chairHearing: false });

  // 1. 没有工程证书时不可能越过见习
  await v(() => { __MOSS__.state.professionalLife.waterworks.certified = false; __MOSS__.state.professionalLife.waterworks.repair = null; });
  let norm = await v(() => {
    const raw = { ...__MOSS__.serialize(), professionalLife: { ...__MOSS__.state.professionalLife, eng: { stage: 3, post: 'x', incident: 'field' } } };
    return __MOSS__.normalizeSaveForTest(raw).professionalLife.eng;
  });
  ok('无工程证书时阶段被压回见习', norm.stage, 0);
  ok('无工程证书时岗位被清空', norm.post, '');

  // 2. 拿到证书 → 可签署独立报告
  // 注意：水利「已验收」在游戏里要求 repair/allocation/receivedStone 三位一体，
  // 夹具必须写成自洽状态，否则会被归一化里的自洽规则正确地否掉。
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.grantWaterworksCertificate(); });
  c = await v(() => __MOSS__.engInfo());
  ok('有证书仍是见习，等玩家自己去签', c.stage, 0);
  await v(() => __MOSS__.engStep('sign'));
  c = await v(() => __MOSS__.engInfo());
  ok('签署后进入独立项目阶段', c.stage, 1);
  ok('独立项目后可署名工程报告', c.can.signReport, true);
  ok('此时还不能申请机构预算', c.can.requestBudget, false);

  // 3. 事故：两个选项各自改到真实水系状态
  await v(() => __MOSS__.engStep('incident', 'field'));
  c = await v(() => ({ e: __MOSS__.engInfo(), alloc: __MOSS__.routeInfo().waterAllocation }));
  ok('处置事故后进入第二阶段以上', c.e.stage, 2);
  ok('保农田 → 水系改为优先灌溉', c.alloc, 'irrigation');
  ok('事故后获得止损权', c.e.can.emergencyRepair, true);

  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.grantWaterworksCertificate(); __MOSS__.engStep('sign'); __MOSS__.engStep('incident', 'channel'); });
  c = await v(() => ({ e: __MOSS__.engInfo(), alloc: __MOSS__.routeInfo().waterAllocation }));
  ok('保通航 → 水系改为优先通航', c.alloc, 'navigation');

  // 4. 正式岗位：改变的是权限，不是数字
  await v(() => __MOSS__.engStep('post'));
  c = await v(() => __MOSS__.engInfo());
  ok('接受岗位后进入可主持说明会的阶段', c.stage, 4);
  ok('岗位后可申请机构预算', c.can.requestBudget, true);
  ok('未实现的施工委托不伪装成可用权限', c.can.delegate, false);
  ok('岗位后可主持公开说明会', c.can.chairHearing, true);
  ok('机构预算与个人金币分开记', typeof c.budget === 'number' && typeof c.playerCoins === 'number', true);

  // 5. 主持争议工程：预算只有一头，另一头要解释
  await v(() => __MOSS__.engStep('budget'));
  ok('申请后拿到机构预算', (await v(() => __MOSS__.engInfo())).budget > 0, true);
  const beforeBudget = (await v(() => __MOSS__.engInfo())).budget;
  await v(() => __MOSS__.engStep('hearing', 'navigation'));
  c = await v(() => ({ e: __MOSS__.engInfo(), alloc: __MOSS__.routeInfo().waterAllocation }));
  ok('主持说明会后阶段封顶', c.e.stage, 4);
  ok('说明会后可主持公开说明', c.e.can.chairHearing, true);
  ok('说明会确实花掉预算', c.e.budget < beforeBudget, true);
  ok('说明会改变了水系分配', c.alloc, 'navigation');

  // 6. 人物记得你的做法
  const mem = await v(() => __MOSS__.engInfo().memories);
  ok('诺娅记得你处理过事故', (mem.noya || []).some(x => x.includes('事故')), true);
  ok('马丁也记得同一件事', (mem.martin || []).length > 0, true);
  ok('说明会的取舍被记录下来', (mem.noya || []).some(x => x.includes('说明会')), true);

  // 7. 人物记忆会随存档保存
  await v(() => __MOSS__.saveNow());
  const kept = await v(() => {
    const n = __MOSS__.normalizeSaveForTest(JSON.parse(localStorage.getItem('moss-farm-v2')));
    return n.professionalLife.eng;
  });
  ok('资历阶段随存档保存', kept.stage, 4);
  ok('事故处置选择随存档保存', kept.choice, 'channel');
  ok('说明会结果随存档保存', kept.hearing, 'navigation');
  ok('人物记忆随存档保存', Object.keys(kept.memories).length > 0, true);

  // 8. 读档不会重复发钱或重复升级
  const twice = await v(() => {
    const raw = JSON.parse(localStorage.getItem('moss-farm-v2'));
    const a = __MOSS__.normalizeSaveForTest(raw);
    const b = __MOSS__.normalizeSaveForTest(a);
    return { coinsA: a.coins, coinsB: b.coins, budgetA: a.professionalLife.eng.budget, budgetB: b.professionalLife.eng.budget };
  });
  ok('重复读档不再多发机构预算', twice.budgetB, twice.budgetA);

  ok('无控制台错误', run.errors.length, 0);
} finally {
  await run.browser.close();
}
console.log(`\n工程师职业章节 ${checks} 项通过`);
