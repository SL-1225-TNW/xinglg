/* R3：河湾闸门工程闭环验收
   勘测 → 认证 → 说明会定方案 → 材料交接 → 施工 → 跨日试运行 → 验收 → 养护

   验收重点：
   · 关键工序都在坝体真实位置完成，远处点不动
   · 两个方案在供水／货运上产生可测量的差异
   · 机构经费、个人自愿补记与个人钱包三本账分开且守恒
   · 缺料、钱不足、远程操作都不留下半笔事务
   · 重开面板、重载存档都不重复结算、不叠加效果 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, interactWith, walkTo, clickWin, sleepViaMenu, dismissSettlement, lastToast } from './harness.mjs';

let checks = 0;
const ok = (name, actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), name);
  checks++; console.log('PASS', name);
};
const btnCount = (page, text) => page.locator('.win button', { hasText: text }).count();
/* 控制台在水利站的室内控制室里：(9,9) 是门，进门后 (8,6) 才是控制台面板。
   说明会与认证都只能在这个房间里做，所以这里必须真的走进去。 */
async function gotoControlRoom(page) {
  const scene = await page.evaluate(() => __MOSS__.state.sceneId);
  if (scene !== 'waterworks_control') {
    await interactWith(page, 9, 9);
    await page.waitForTimeout(450);
    if (await page.evaluate(() => __MOSS__.state.sceneId) !== 'waterworks_control') return false;
  }
  await interactWith(page, 8, 6);
  return winOpen(page);
}

const run = await launch();
try {
  const p = run.page;
  await boot(p);
  const v = fn => p.evaluate(fn);

  /* ---------- 一、自然新档：前置链可达，且没有循环门槛 ---------- */
  let pj = await v(() => __MOSS__.engProjectInfo());
  ok('新档工程从勘测阶段起步', pj.phase, 'survey');
  ok('新档没有方案与工序', [pj.scheme, pj.build], ['', 0]);
  ok('新档项目账没有任何资金', [pj.funds.granted, pj.funds.spent, pj.funds.donated], [0, 0, 0]);
  ok('新档无基础认证，不能越过见习', await v(() => __MOSS__.engStep('sign')), false);
  ok('新档水利区尚未开放', await v(() => __MOSS__.gateAllowed('waterworks')), false);

  // 实践二选一：矿山排水或磨坊维修任一验收通过即可进场
  ok('两条实践都未完成时进不了水利区', await v(() => __MOSS__.gateAllowed('waterworks')), false);
  await v(() => { __MOSS__.exploreState().mineSurvey; const w = __MOSS__.mineWorks(); w.west = true; w.east = true; w.pump = true; w.inspected = true; });
  ok('矿山排水验收通过后水利区开放', await v(() => __MOSS__.gateAllowed('waterworks')), true);
  ok('实践路线读数为矿山', (await v(() => __MOSS__.engProjectInfo())).practiceRoute, 'mine');

  /* ---------- 二、勘测：坝体三个真实位置，逐处取读数 ---------- */
  await v(() => { __MOSS__.devSwitchScene('waterworks', 20, 17); __MOSS__.state.weather.today = 'clear'; });
  ok('走到坝顶水尺', await interactWith(p, 20, 18), true);
  ok('水尺处只提供读水尺', [await btnCount(p, '读水尺'), await btnCount(p, '探查东岸坡脚'), await btnCount(p, '测量下游淤积')], [1, 0, 0]);
  await clickWin(p, '读水尺');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('晴天读到 2 级水位', pj.survey.level, 2);
  ok('只读水尺不会顺带完成坡脚探查', pj.survey.east, '');
  await closeWin(p);

  // 远处不能替坡脚取读数
  ok('水尺处不能远程探查坡脚', (await v(() => __MOSS__.engRemoteProbe('riverbay_east'))).fired, false);
  ok('远处试探不改动项目记录', (await v(() => __MOSS__.engRemoteProbe('riverbay_east'))).unchanged, true);

  ok('走到东岸坡脚', await interactWith(p, 21, 20), true);
  ok('坡脚只提供坡脚勘测', [await btnCount(p, '探查东岸坡脚'), await btnCount(p, '读水尺')], [1, 0]);
  await clickWin(p, '探查东岸坡脚');
  await closeWin(p);
  ok('走到下游淤积段', await interactWith(p, 21, 16), true);
  await clickWin(p, '测量下游淤积');
  await closeWin(p);
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('三处读数齐全', [pj.survey.level, pj.survey.east, pj.survey.silt], [2, 'sound', 'light']);
  ok('晴天基础风险为 1 级', pj.risk, 1);
  ok('勘测读数齐全后进入待领认证阶段', pj.phase, 'certify');
  ok('拿到读数还不等于拿到认证', pj.scope, '');

  // 雨天的读数不同，风险确实来自已保存的读数
  await v(() => { __MOSS__.resetCareerForTest(); });
  await v(() => { __MOSS__.devSwitchScene('waterworks', 20, 17); __MOSS__.state.weather.today = 'rain'; });
  await interactWith(p, 20, 18); await clickWin(p, '读水尺'); await closeWin(p);
  await interactWith(p, 21, 20); await clickWin(p, '探查东岸坡脚'); await closeWin(p);
  await interactWith(p, 21, 16); await clickWin(p, '测量下游淤积'); await closeWin(p);
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('雨天读到 3 级水位', pj.survey.level, 3);
  ok('雨天坡脚开裂、淤积偏厚', [pj.survey.east, pj.survey.silt], ['cracked', 'heavy']);
  ok('雨天基础风险升到 4 级', pj.risk, 4);

  /* ---------- 三、控制室里领认证、定方案 ---------- */
  // 实践未完成也能进场：采场调查＋河港核验是另一条开口，两件事互相独立
  await v(() => {
    __MOSS__.mineWorks().inspected = false;
    __MOSS__.state.professionalLife.quarry.surveyed = true;
    __MOSS__.state.professionalLife.port.manifestChecked = true;
    __MOSS__.devSwitchScene('waterworks', 9, 10);
  });
  ok('没有实践也能凭采场与河港进场', await v(() => __MOSS__.gateAllowed('waterworks')), true);
  ok('走进闸门控制室', await gotoControlRoom(p), true);
  ok('缺实践时控制室不提供领认证按钮', await btnCount(p, '领取基础工程认证'), 0);
  ok('缺实践时明确写出两条可选路线', (await p.locator('.win-body').innerText()).includes('矿山'), true);
  await closeWin(p);

  await v(() => { __MOSS__.mineWorks().inspected = true; });
  ok('实践完成后可以领认证', [await gotoControlRoom(p), await btnCount(p, '领取基础工程认证')], [true, 1]);
  await clickWin(p, '领取基础工程认证');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('取得基础认证后进入待定方案阶段', pj.phase, 'certify');
  ok('认证范围是 survey', pj.scope, 'survey');
  ok('基础认证还不改地区口径', pj.policy, null);
  await closeWin(p);

  /* ---------- 三之补、资历阶梯：签报告 → 处置事故 → 接受岗位 → 申请拨付 ---------- */
  await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  ok('回控制室准备签署报告', await gotoControlRoom(p), true);
  ok('基础认证后可以签独立工程报告', await btnCount(p, '签署第一份独立工程报告'), 1);
  await clickWin(p, '签署第一份独立工程报告');
  ok('签署后进入独立项目阶段', (await v(() => __MOSS__.engInfo())).stage, 1);
  await closeWin(p);

  await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  ok('回控制室准备处置事故', await gotoControlRoom(p), true);
  await clickWin(p, '先堵缺口保麦田');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('事故处置后资历到第 2 阶段', (await v(() => __MOSS__.engInfo())).stage, 2);
  ok('先保农田 → 应急口径为灌溉优先', pj.policy, 'irrigation');
  await closeWin(p);

  await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  ok('回控制室准备接受岗位', await gotoControlRoom(p), true);
  await clickWin(p, '接受正式工程岗位');
  ok('接受岗位后资历到第 4 阶段', (await v(() => __MOSS__.engInfo())).stage, 4);
  await closeWin(p);

  // 定案按钮只在控制室里出现
  await v(() => __MOSS__.devSwitchScene('waterworks', 20, 17));
  ok('走出控制室回到坝顶', await interactWith(p, 20, 18), true);
  ok('坝顶水尺处没有方案确认按钮', await btnCount(p, '定案：'), 0);
  await closeWin(p);

  await v(() => { __MOSS__.state.professionalLife.projects.riverbay_gate.opinions = { mill: true, meadow: false, port: true }; });
  ok('回到控制室准备开说明会', await gotoControlRoom(p), true);
  ok('三方意见与拨付齐了才能定案', await btnCount(p, '定案：'), 0);
  await closeWin(p);

  await v(() => { __MOSS__.state.professionalLife.projects.riverbay_gate.opinions.meadow = true; });
  await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  ok('回到控制室申请机构拨付', await gotoControlRoom(p), true);
  const coinsAtGrant = await v(() => __MOSS__.state.coins);
  await clickWin(p, '申请机构工程拨付');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('机构拨付进入项目账', pj.funds.granted, 150);
  ok('申请拨付不动个人钱包', await v(() => __MOSS__.state.coins), coinsAtGrant);
  await closeWin(p);

  ok('拨付到账后回到控制室', await gotoControlRoom(p), true);
  ok('拨付到账后可以定案', [await btnCount(p, '定案：保守排水'), await btnCount(p, '定案：兼顾通航')], [1, 1]);
  const costText = await p.locator('.win-body').innerText();
  ok('定案前显示工序数与金费', costText.includes('3道工序') && costText.includes('144金'), true);
  await clickWin(p, '定案：保守排水');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('定案后进入等材料交接', pj.phase, 'scheme');
  ok('定案即结算闸件代购 24 金', pj.funds.spent, 24);
  ok('方案验收前地区口径仍是应急口径而不是工程方案', pj.policy, 'irrigation');
  await closeWin(p);

  /* ---------- 四、材料交接与施工（亲自施工，真实走到闸基） ---------- */
  // 石料的采掘与河港装运由既有 R2 用例覆盖；这里从「运单已到场」接手
  await v(() => {
    __MOSS__.state.professionalLife.projects.riverbay_gate.stone = true;
    __MOSS__.state.inventory.iron_ingot = 1;
    __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600;
    __MOSS__.devSwitchScene('waterworks', 20, 19);
  });
  ok('带着铁锭回到坝顶水尺', await interactWith(p, 20, 18), true);
  ok('石料到场后可以安装闸件', await btnCount(p, '安装闸件套装'), 1);
  await clickWin(p, '安装闸件套装');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('材料齐备后进入待施工', [pj.phase, pj.kit], ['materials', 1]);
  ok('安装闸件真实消耗铁锭', await v(() => __MOSS__.state.inventory.iron_ingot || 0), 0);
  await closeWin(p);

  ok('闸基工作面可以交互', await interactWith(p, 22, 14), true);
  await clickWin(p, '亲自施工');
  ok('选亲自施工后不再领工钱', (await v(() => __MOSS__.engProjectInfo())).mode, 'self');
  for (let i = 0; i < 3; i++) {
    await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
    await clickWin(p, '亲自完成');
    await closeWin(p);
    await interactWith(p, 22, 14);
  }
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('三道工序全部完成', [pj.build, pj.phase], [3, 'build']);
  ok('亲自施工不花机构经费', pj.funds.spent, 24);
  ok('工序完成后可以封闸试运行', await btnCount(p, '封闸并启动试运行'), 1);
  await clickWin(p, '封闸并启动试运行');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('封闸后进入跨日试运行', pj.phase, 'trial');
  ok('试运行封闸日已记录', pj.trialDay > 0, true);
  await closeWin(p);

  /* ---------- 五、验收必须跨过一个夜晚 ---------- */
  await interactWith(p, 20, 18);
  ok('同一天不能验收', await btnCount(p, '复核试运行并签署验收'), 0);
  await closeWin(p);
  ok('真的睡了一夜', await sleepViaMenu(p), true);
  await dismissSettlement(p);
  await v(() => { __MOSS__.devSwitchScene('waterworks', 20, 17); __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  const coinsPre = await v(() => __MOSS__.state.coins);
  await interactWith(p, 20, 18);
  ok('跨过一夜后可以复核验收', await btnCount(p, '复核试运行并签署验收'), 1);
  await clickWin(p, '复核试运行并签署验收');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('验收后工程结案', pj.phase, 'accepted');
  ok('认证范围升级为可主持公共工程', pj.scope, 'works');
  ok('验收后地区口径采用保守排水方案', pj.policy, 'irrigation');
  ok('保守排水让石料货运变慢', pj.shipping, 80);
  ok('验收报酬只发一次', await v(() => __MOSS__.state.coins) - coinsPre, 90);
  await closeWin(p);

  /* ---------- 六、幂等：重开面板、重载存档都不叠加 ---------- */
  await v(() => { __MOSS__.openEngineeringProjectLog(); });
  await v(() => __MOSS__.saveNow());
  const beforeReload = await v(() => ({ coins: __MOSS__.state.coins, policy: __MOSS__.professionalWaterPolicy(), spend: __MOSS__.engProjectInfo().funds.spent }));
  await p.reload();
  await p.locator('.boot-actions button').first().click();
  const afterReload = await v(() => ({ coins: __MOSS__.state.coins, policy: __MOSS__.professionalWaterPolicy(), spend: __MOSS__.engProjectInfo().funds.spent }));
  ok('重载后个人钱包不变', afterReload.coins, beforeReload.coins);
  ok('重载后地区口径不叠加', afterReload.policy, beforeReload.policy);
  ok('重载后工程支出不叠加', afterReload.spend, beforeReload.spend);
  await v(() => __MOSS__.openEngineeringProjectLog());
  await closeWin(p);
  ok('重复打开项目记录页不再改变任何账', await v(() => __MOSS__.state.coins), afterReload.coins);

  /* ---------- 七、另一个方案：供水／货运真的不同 ---------- */
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('balanced'); });
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('兼顾通航是四道工序', pj.steps.length, 4);
  ok('兼顾通航的机构口径合计 184 金', 24 + 40 * 4, 184);
  ok('184 金超出一次拨付 150 金', 184 > 150, true);

  /* ---------- 八、委托施工：同一份工程进度，经费不足会停工 ---------- */
  await v(() => {
    __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('balanced');
    const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
    q.kit = 1; q.phase = 'materials';          // 闸件已进场，与前面亲自施工那条对齐
    __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600;
    __MOSS__.devSwitchScene('waterworks', 21, 15);
  });
  ok('闸基工作面可以交互', await interactWith(p, 22, 14), true);
  await clickWin(p, '委托河湾施工队');
  ok('委托后与亲自施工共用同一份进度', (await v(() => __MOSS__.engProjectInfo())).mode, 'commission');
  for (let i = 0; i < 3; i++) {
    await v(() => { __MOSS__.engAdvanceDay(); __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
    await clickWin(p, '今日开工');
  }
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('委托三天推进三道工序', [pj.build, pj.crew.paid], [3, 120]);
  ok('工钱全部从机构余额支出', pj.funds.spent, 24 + 120);
  ok('委托施工不动个人钱包', await v(() => __MOSS__.state.coins) > 0, true);

  // 第四道工序发不出工钱
  await v(() => { __MOSS__.engAdvanceDay(); __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; });
  ok('停工原因写明是经费', (await p.locator('.win-body').innerText()).includes('因经费停工'), true);
  const buildBefore = (await v(() => __MOSS__.engProjectInfo())).build;
  await clickWin(p, '今日开工');
  ok('余额不足时点开工不推进工序', (await v(() => __MOSS__.engProjectInfo())).build, buildBefore);
  ok('余额不足时明说发不出工钱', (await lastToast(p)).includes('发不出工钱'), true);
  const coinsBeforeTopUp = await v(() => __MOSS__.state.coins);
  const spentBefore = (await v(() => __MOSS__.engProjectInfo())).funds.spent;
  await clickWin(p, '自愿补记');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('补记只出实际差额 34 金（余额 6 ＋ 差 34 ＝ 日薪 40）', coinsBeforeTopUp - await v(() => __MOSS__.state.coins), 34);
  ok('补记后工程支出不变（钱进了可支配余额）', pj.funds.spent, spentBefore);
  ok('自愿补记单独记账', [pj.funds.donated, pj.funds.granted], [34, 150]);
  ok('补记后余额正好够一天工钱', pj.fundsLeft, 40);
  ok('补记后恢复开工', await btnCount(p, '今日开工'), 1);
  await clickWin(p, '今日开工');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('第四道工序完成', pj.build, 4);
  ok('两条施工路径走完的都是同一份工序进度', pj.steps.length, pj.build);

  /* ---------- 九、失败边界：缺料、钱不足都不留半笔事务 ---------- */
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('conservative'); __MOSS__.state.inventory.iron_ingot = 0; });
  await v(() => { __MOSS__.devSwitchScene('waterworks', 20, 17); __MOSS__.state.timeMinutes = 600; });
  ok('带着空背包走到坝顶水尺', await interactWith(p, 20, 18), true);
  // 快照取在点击之前：走路本身要花时间，不能算进这次失败结算里
  const snapBefore = await v(() => JSON.stringify([__MOSS__.state.inventory, __MOSS__.state.coins, __MOSS__.state.timeMinutes, __MOSS__.engProjectInfo()]));
  await clickWin(p, '安装闸件套装');
  const snapAfter = await v(() => JSON.stringify([__MOSS__.state.inventory, __MOSS__.state.coins, __MOSS__.state.timeMinutes, __MOSS__.engProjectInfo()]));
  ok('缺铁锭时安装闸件完全不动账', snapAfter, snapBefore);
  ok('缺铁锭时明说材料不够', (await lastToast(p)).includes('铁锭'), true);
  await closeWin(p);

  // 钱包拿不出工钱时不能自愿补记
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('balanced'); __MOSS__.state.coins = 0; });
  await v(() => {
    const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
    q.kit = 1; q.mode = 'commission'; q.build = 3; q.phase = 'build';
    q.funds.spent = 24 + 120; q.crew = { day: 0, paid: 120 };
    __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600;
    __MOSS__.devSwitchScene('waterworks', 21, 15);
  });
  ok('停工现场仍能交互', await interactWith(p, 22, 14), true);
  ok('停工时仍可改为亲自施工接手，不把玩家堵死', await btnCount(p, '改为亲自施工'), 1);
  const beforeTopUpFail = await v(() => JSON.stringify([__MOSS__.state.coins, __MOSS__.engProjectInfo()]));
  await clickWin(p, '自愿补记');
  ok('钱包为零时补记被拒绝', await v(() => JSON.stringify([__MOSS__.state.coins, __MOSS__.engProjectInfo()])), beforeTopUpFail);
  ok('钱包为零时明说拿不出工钱', (await lastToast(p)).includes('拿不出工钱'), true);
  await closeWin(p);

  /* ---------- 十、验收后的养护与地区效果 ---------- */
  await v(() => { __MOSS__.resetCareerForTest(); __MOSS__.engFixtureToScheme('balanced'); });
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('兼顾通航下应急口径仍是通航优先', pj.policy, 'navigation');
  await v(() => {
    const q = __MOSS__.state.professionalLife.projects.riverbay_gate;
    q.kit = 1; q.build = 4; q.mode = 'self';
    q.trialDay = __MOSS__.state.totalDay - 1;   // 封闸日设在昨天，等价于真的睡过一夜
    q.phase = 'trial';
  });
  await v(() => { __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; __MOSS__.devSwitchScene('waterworks', 20, 17); });
  ok('走到坝顶准备复核', await interactWith(p, 20, 18), true);
  ok('跨过一夜后才能验收', await btnCount(p, '复核试运行并签署验收'), 1);
  await clickWin(p, '复核试运行并签署验收');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('兼顾通航验收后地区口径为通航优先', pj.policy, 'navigation');
  ok('通航优先让石料货运变快', pj.shipping, 50);
  ok('保守排水与兼顾通航的货运耗时确实不同', 80 - 50, 30);
  ok('验收当天不做养护检查', await btnCount(p, '闸门养护检查'), 0);
  await closeWin(p);

  await v(() => { __MOSS__.engAdvanceDay(); __MOSS__.state.energy = 80; __MOSS__.state.timeMinutes = 600; __MOSS__.devSwitchScene('waterworks', 20, 17); });
  ok('隔一天后可以养护', await interactWith(p, 20, 18), true);
  const maintBefore = (await v(() => __MOSS__.engProjectInfo())).maintCount;
  await clickWin(p, '闸门养护检查');
  pj = await v(() => __MOSS__.engProjectInfo());
  ok('养护次数真实累加', pj.maintCount, maintBefore + 1);
  ok('养护不改变已验收的地区口径', pj.policy, 'navigation');
  await closeWin(p);

  // 验收资金守恒：拨付 ＋ 自愿补记 ≥ 已支出，且不来自个人钱包
  const conservation = await v(() => {
    const f = __MOSS__.engProjectInfo().funds;
    return { granted: f.granted, donated: f.donated, spent: f.spent, ok: f.spent <= f.granted + f.donated };
  });
  ok('工程支出不超过拨付加补记', conservation.ok, true);
  ok('机构拨付只有一次 150 金', conservation.granted, 150);

  /* ---------- 十一、旧档迁移：已交付的不强迫重做，已领的钱不二次发 ---------- */
  const legacy = await v(() => {
    const m = __MOSS__.normalizeProfessionalLife;
    // 旧档一：闸门已交付并发证，机构预算当年已经领过 150
    const old1 = m({
      waterworks: { level: 3, repair: 'pending', receivedStone: true, millOpinion: true, meadowOpinion: true, portOpinion: true, allocation: 'navigation', testDay: 12, certified: true },
      eng: { stage: 4, post: 'waterworks_engineer', incident: 'channel', choice: 'channel', hearing: 'navigation', budget: 150, budgetGranted: true, memories: { noya: ['独立署名水利报告'] } }
    });
    // 旧档二：闸件已装、方案已定、还没过夜验收
    const old2 = m({
      waterworks: { level: 2, repair: 'pending', receivedStone: true, millOpinion: true, meadowOpinion: true, portOpinion: true, allocation: 'irrigation', testDay: 7 },
      eng: { stage: 4, post: 'waterworks_engineer', incident: 'field', choice: 'field' }
    });
    // 旧档三：只读过水尺
    const old3 = m({ waterworks: { level: 2 }, eng: { stage: 0 } });
    const round = x => m(x);
    return {
      d1: old1.projects.riverbay_gate, w1: old1.waterworks, e1: old1.eng,
      rt1: round(old1).projects.riverbay_gate,
      d2: old2.projects.riverbay_gate, w2: old2.waterworks,
      rt2: round(old2).projects.riverbay_gate,
      d3: old3.projects.riverbay_gate, rt3: round(old3).projects.riverbay_gate
    };
  });
  ok('旧档「已发证」迁移为已验收，不强迫重做', legacy.d1.phase, 'accepted');
  ok('旧档方案按 irrigation／navigation 对应回填', [legacy.d1.scheme, legacy.w1.allocation], ['balanced', 'navigation']);
  ok('旧档认证范围升级为可主持公共工程', legacy.w1.scope, 'works');
  ok('旧档已领取的预算记成已结算事务', legacy.d1.funds.granted, 150);
  ok('旧档预算事务带稳定 ID', Object.keys(legacy.d1.funds.tx), ['legacy:grant']);
  ok('旧档人物记忆保留', legacy.e1.memories.noya.length, 1);
  ok('旧档往返幂等', legacy.rt1, legacy.d1);
  ok('旧档「已装闸件未验收」迁移为试运行', legacy.d2.phase, 'trial');
  ok('旧档试运行封闸日保留', legacy.d2.trialDay, 7);
  ok('旧档未验收则不发放地区效果', legacy.w2.allocation, 'irrigation');
  ok('旧档未验收则认证范围仍是基础', legacy.w2.scope, 'survey');
  ok('旧档二往返幂等', legacy.rt2, legacy.d2);
  ok('旧档「只读水尺」迁移为勘测阶段', legacy.d3.phase, 'survey');
  ok('旧档三往返幂等', legacy.rt3, legacy.d3);

  const noDoubleGrant = await v(() => {
    const m = __MOSS__.normalizeProfessionalLife;
    const old = m({
      waterworks: { level: 3, repair: 'pending', receivedStone: true, millOpinion: true, meadowOpinion: true, portOpinion: true, allocation: 'navigation', testDay: 12, certified: true },
      eng: { stage: 4, post: 'waterworks_engineer', incident: 'channel', choice: 'channel', budget: 150, budgetGranted: true }
    });
    // 迁移后的档再走一次「申请拨付」，必须拿不到第二笔
    const pj = old.projects.riverbay_gate;
    return { granted: pj.funds.granted, spent: pj.funds.spent, txCount: Object.keys(pj.funds.tx).length };
  });
  ok('旧档迁移后不会产生第二笔拨付', noDoubleGrant, { granted: 150, spent: 0, txCount: 1 });

  ok('无控制台错误', run.errors, []);
} finally {
  await run.browser.close();
}
console.log(`\nR3 河湾闸门工程 ${checks} 项通过`);
