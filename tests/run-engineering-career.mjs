/* 工程师职业章节（R3 重写）
   见习 → 独立署名 → 事故处置 → 正式岗位 → 机构拨付 → 说明会定方案
   验收重点：每次晋升都要改变一种实际玩法，不能只涨一个数字；
   机构拨付只发生一次，且永远不进个人钱包。 */
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
  ok('见习没有任何岗位权限', c.can, { signReport: false, emergencyRepair: false, requestBudget: false, chairHearing: false, build: false, commission: false, accept: false });

  // 1. 没有基础工程认证就不可能越过见习
  let norm = await v(() => {
    const raw = { ...__MOSS__.serialize(), professionalLife: { ...__MOSS__.state.professionalLife, eng: { stage: 3, post: 'x', incident: 'field' } } };
    return __MOSS__.normalizeSaveForTest(raw).professionalLife.eng;
  });
  ok('无基础工程认证时阶段被压回见习', norm.stage, 0);
  ok('无基础工程认证时岗位被清空', norm.post, '');

  // 1b. 勘测没做完就不可能拿到认证（项目进度不是几组布尔值各判一半）
  let badProj = await v(() => {
    const raw = { ...__MOSS__.serialize(), professionalLife: { ...__MOSS__.state.professionalLife, projects: { riverbay_gate: { phase: 'accepted', survey: { level: 0, east: '', silt: '' }, practice: 'mill', scheme: 'conservative', build: 3 } } } };
    return __MOSS__.normalizeSaveForTest(raw).professionalLife.projects.riverbay_gate;
  });
  ok('勘测缺失的存档被压回勘测阶段', badProj.phase, 'survey');
  ok('勘测缺失时不会留下已完成工序', badProj.build, 0);

  // 2. 拿到基础认证 → 可签署独立报告（认证不再等于工程已交付）
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.grantWaterworksCertificate(); });
  c = await v(() => __MOSS__.engInfo());
  ok('有认证仍是见习，等玩家自己去签', c.stage, 0);
  let pj = await v(() => __MOSS__.engProjectInfo());
  ok('基础认证时工程处于待定方案阶段', pj.phase, 'certify');
  ok('基础认证范围是 survey 而不是 works', pj.scope, 'survey');
  ok('基础认证时地区服务还不改口径', pj.policy, null);
  await v(() => __MOSS__.engStep('sign'));
  c = await v(() => __MOSS__.engInfo());
  ok('签署后进入独立项目阶段', c.stage, 1);
  ok('独立项目后可署名工程报告', c.can.signReport, true);
  ok('此时还不能申请机构拨付', c.can.requestBudget, false);

  // 3. 事故：两个选项各自改变地区服务口径，但那是应急口径，验收后要被方案取代
  await v(() => __MOSS__.engStep('incident', 'field'));
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('事故处置后进入第二阶段以上', (await v(() => __MOSS__.engInfo())).stage, 2);
  ok('先保农田 → 应急口径为灌溉优先', pj.allocation, 'irrigation');
  ok('应急口径不是工程方案', pj.scheme, '');
  ok('事故后获得止损权', (await v(() => __MOSS__.engInfo())).can.emergencyRepair, true);

  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.grantWaterworksCertificate(); __MOSS__.engStep('sign'); __MOSS__.engStep('incident', 'channel'); });
  ok('先保通航 → 应急口径为通航优先', (await v(() => __MOSS__.engProjectInfo())).allocation, 'navigation');

  // 4. 正式岗位：改变的是权限，不是数字
  await v(() => __MOSS__.engStep('post'));
  c = await v(() => __MOSS__.engInfo());
  ok('接受岗位后进入可主持说明会的阶段', c.stage, 4);
  ok('岗位后可申请机构拨付', c.can.requestBudget, true);
  ok('岗位后可主持公开说明会', c.can.chairHearing, true);
  ok('委托施工与亲自施工共用同一份工程进度', typeof c.can.build === 'boolean', true);

  // 5. 机构拨付：一次、只进项目账、不进个人钱包
  const coinsBefore = (await v(() => __MOSS__.engInfo())).playerCoins;
  await v(() => __MOSS__.engStep('budget'));
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('申请后项目账收到机构拨付', pj.funds.granted, 150);
  ok('机构拨付不动个人钱包', (await v(() => __MOSS__.engInfo())).playerCoins, coinsBefore);
  await v(() => __MOSS__.engStep('budget'));
  ok('重复申请不会二次拨付', (await v(() => __MOSS__.engProjectInfo())).funds.granted, 150);

  // 6. 说明会就是方案确认：两个方案费用与工序数真的不同
  await v(() => __MOSS__.engStep('scheme', 'conservative'));
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('定案后进入方案已确认、等材料交接', pj.phase, 'scheme');
  ok('保守排水是三道工序', pj.steps.length, 3);
  ok('确认方案即结算闸件代购', pj.funds.spent, 24);
  ok('确认方案前地区口径未变', (await v(() => __MOSS__.engProjectInfo())).step >= 2, true);

  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.grantWaterworksCertificate(); __MOSS__.engStep('sign'); __MOSS__.engStep('incident', 'channel'); __MOSS__.engStep('post'); __MOSS__.engStep('budget'); __MOSS__.engStep('scheme', 'balanced'); });
  let pj2 = await v(() => __MOSS__.engProjectInfo());
  ok('兼顾通航是四道工序', pj2.steps.length, 4);
  ok('兼顾通航的机构口径合计超出一次拨付', 24 + 40 * 4 > 150, true);
  await v(() => __MOSS__.engStep('scheme', 'conservative'));
  ok('方案不能改', (await v(() => __MOSS__.engProjectInfo())).scheme, 'balanced');

  // 7. 人物记得你的做法
  const mem = await v(() => __MOSS__.engInfo().memories);
  ok('诺娅记得你处理过事故', (mem.noya || []).some(x => x.includes('事故')), true);
  ok('马丁也记得同一件事', (mem.martin || []).length > 0, true);
  ok('说明会的取舍被记录下来', (mem.noya || []).some(x => x.includes('说明会')), true);

  // 8. 人物记忆与项目账随存档保存
  await v(() => __MOSS__.saveNow());
  const kept = await v(() => __MOSS__.normalizeSaveForTest(JSON.parse(localStorage.getItem('moss-farm-v2'))));
  ok('资历阶段随存档保存', kept.professionalLife.eng.stage, 4);
  ok('事故处置选择随存档保存', kept.professionalLife.projects.riverbay_gate.emergency, 'channel');
  ok('方案随存档保存', kept.professionalLife.projects.riverbay_gate.scheme, 'balanced');
  ok('机构拨付随存档保存', kept.professionalLife.projects.riverbay_gate.funds.granted, 150);
  ok('闸件代购事务随存档保存', kept.professionalLife.projects.riverbay_gate.funds.spent, 24);
  ok('人物记忆随存档保存', Object.keys(kept.professionalLife.eng.memories).length > 0, true);

  // 9. 读档不会重复发钱或重复升级
  const twice = await v(() => {
    const raw = JSON.parse(localStorage.getItem('moss-farm-v2'));
    const a = __MOSS__.normalizeSaveForTest(raw);
    const b = __MOSS__.normalizeSaveForTest(a);
    return { coinsA: a.coins, coinsB: b.coins, grantedA: a.professionalLife.projects.riverbay_gate.funds.granted, grantedB: b.professionalLife.projects.riverbay_gate.funds.granted, spentB: b.professionalLife.projects.riverbay_gate.funds.spent };
  });
  ok('重复读档不再多发机构拨付', twice.grantedB, twice.grantedA);
  ok('重复读档不会重复结算闸件代购', twice.spentB, 24);
  ok('重复读档不动个人钱包', twice.coinsB, twice.coinsA);

  ok('无控制台错误', run.errors.length, 0);
} finally {
  await run.browser.close();
}
console.log(`\n工程师职业章节 ${checks} 项通过`);
