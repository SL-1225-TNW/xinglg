/*
 * R3 natural-entry evidence.
 * Starts a fresh save and completes crop / bridge / mill / public engineering /
 * river freight / acceptance / maintenance through visible UI and real input.
 * __MOSS__ is read-only
 * here for assertions and map/path inspection; no gameplay state is written.
 */
import assert from 'node:assert/strict';
import {
  launch, boot, walkTo, walkAdjacent, clickTile, sleepAtFarmhouse,
  sleepViaMenu, dismissSettlement, interactWith, faceTowards,
  clickWin as clickWindow, closeWin, winOpen
} from './harness.mjs';

let p;
let checks = 0;
const ok = (condition, label) => {
  assert.ok(condition, label);
  checks++;
  console.log('PASS', label);
};
const read = (fn, arg) => p.evaluate(fn, arg);
const clickWin = text => clickWindow(p, text);
const go = async (x, y) => ok(await walkAdjacent(p, x, y), `真实走到 (${x},${y}) 旁`);
const clickTool = async (slot, x, y) => {
  await goFarm();
  await go(x, y);
  await p.locator('#hotbar button').nth(slot - 1).click();
  await clickTile(p, x, y);
};
const gatherNode = async (slot, x, y, hits) => {
  await goFarm();
  await go(x, y);
  await p.locator('#hotbar button').nth(slot - 1).click();
  for (let i = 0; i < hits; i++) await clickTile(p, x, y);
};
const chooseSeed = async name => {
  await p.locator('#hotbar button').nth(1).click();
  const button = p.locator('#typePick .typepick-btn', { hasText: name }).first();
  await button.waitFor({ state: 'visible' });
  await button.click();
};
const goTown = async () => {
  if (await read(() => __MOSS__.state.sceneId) === 'town') return;
  ok(await walkTo(p, 31, 10, 20000), '沿农场东侧出口实际步行');
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'town');
};
const goFarm = async () => {
  const scene = await read(() => __MOSS__.state.sceneId);
  if (scene === 'farm') return;
  if (scene === 'house') {
    ok(await walkTo(p, 7, 11, 12000), '从农舍正门实际步行回农场');
  } else {
    ok(await walkTo(p, 0, 10, 20000), '沿小镇西侧出口实际步行回农场');
  }
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'farm');
};
const interact = async (x, y) => {
  if (await winOpen(p)) await closeWin(p);
  ok(await interactWith(p, x, y), `到 (${x},${y}) 按交互键打开设施`);
};
const harvestCrop = async ([x, y]) => {
  await clickTool(4, x, y);
};
const waterDryCrops = async () => {
  await goFarm();
  const data = await read(() => ({
    rain: __MOSS__.state.weather.today === 'rain',
    plots: Object.entries(__MOSS__.state.plots).filter(([, q]) => q.crop && !q.mature && !q.water)
      .map(([key]) => key.split(',').map(Number))
  }));
  if (data.rain) {
    console.log('INFO 当天下雨，依游戏规则由雨水照料作物');
    return;
  }
  for (const [x, y] of data.plots) {
    await clickTool(3, x, y);
    ok(await read(([a, b]) => !!__MOSS__.state.plots[a + ',' + b].water, [x, y]), `真实浇水 (${x},${y})`);
  }
};
const sleepOneNight = async () => {
  const before = await read(() => __MOSS__.state.totalDay);
  let slept = await sleepAtFarmhouse(p);
  if (!slept) {
    const afterAttempt = await read(() => __MOSS__.state.totalDay);
    slept = afterAttempt > before || await sleepViaMenu(p);
  }
  ok(slept, '通过游戏内睡觉界面确认结束今天');
  await dismissSettlement(p);
  await p.waitForFunction(day => __MOSS__.state.totalDay > day, before);
  ok(await read(() => __MOSS__.state.totalDay) === before + 1, '游戏内自然跨过一夜');
};
const turnInQuest = async (site, x, y) => {
  await goTown();
  await interact(x, y);
  await clickWin('主线');
  await clickWin('交付材料');
  await closeWin(p);
  return read(() => __MOSS__.state.questProgress[site]);
};
const runRookieTrade = async () => {
  const positions = { board: [14, 9], shop: [8, 7], workshop: [20, 7] };
  const steps = [
    ['board', '报名本地货单核验'],
    ['shop', '向芽芽核对包裹来源'],
    ['workshop', '向阿栎核对收件数量'],
    ['shop', '领取已核验的封包'],
    ['workshop', '交付封包并取得回执'],
    ['board', '提交回执并领取报酬']
  ];
  await p.keyboard.press('j');
  await clickWin('小镇入门');
  await closeWin(p);
  for (let i = 0; i < steps.length; i++) {
    const [site, label] = steps[i];
    await interact(...positions[site]);
    if (site === 'board') await clickWin('小镇入门');
    await clickWin(label);
    await closeWin(p);
    const progress = await read(() => ({
      step: __MOSS__.rookieState().trade,
      energy: __MOSS__.state.energy,
      day: __MOSS__.state.totalDay
    }));
    ok(progress.step === i + 1, `商旅入门真实完成：${label}（当前步骤 ${progress.step}，体力 ${progress.energy}，第 ${progress.day} 天）`);
  }
  ok(await read(() => __MOSS__.routeInfo().r.trade === 2 && __MOSS__.rookieState().trade === 6),
    '商旅入门只通过公开货单取得两项路线记录');
};
const enterDoor = async (x, y, room) => {
  await go(x, y);
  await faceTowards(p, x, y);
  await p.keyboard.press('e');
  await p.waitForFunction(want => __MOSS__.state.sceneId === want, room, { timeout: 7000 });
  ok(await read(want => __MOSS__.state.sceneId === want, room), `实际通过门进入 ${room}`);
};
const exitSceneTo = async target => {
  const info = await read(want => {
    const exits = __MOSS__.MAPS[__MOSS__.state.sceneId].exits || [];
    const exit = exits.find(e => e.to === want);
    return { scene: __MOSS__.state.sceneId, exit };
  }, target);
  assert.ok(info.exit, `${info.scene} 应有通往 ${target} 的门/出口`);
  ok(await walkTo(p, info.exit.x, info.exit.y, 20000), `实际步行离开 ${info.scene}`);
  await p.waitForFunction(want => __MOSS__.state.sceneId === want, target, { timeout: 7000 });
  ok(await read(want => __MOSS__.state.sceneId === want, target), `通过场景出口抵达 ${target}`);
};
const doMillAction = async (x, y, button, field, expected = true) => {
  await interact(x, y);
  await clickWin(button);
  await closeWin(p);
  ok(await read(([key, want]) => __MOSS__.state.millLife?.[key] === want, [field, expected]),
    `磨坊现场操作生效：${button}`);
};
const runMillPractice = async () => {
  // Repair materials are bought at the public workshop through its visible UI.
  const beforePurchase = await read(() => ({
    coins: __MOSS__.state.coins,
    wood: __MOSS__.state.inventory.wood || 0,
    stone: __MOSS__.state.inventory.stone || 0
  }));
  await interact(20, 7);
  let missingWood = Math.max(0, 12 - beforePurchase.wood);
  let missingStone = Math.max(0, 6 - beforePurchase.stone);
  while (missingWood >= 10) { await clickWin('买 10 个 · 60 金'); missingWood -= 10; }
  while (missingWood-- > 0) await clickWin('买 1 个 · 6 金');
  while (missingStone-- > 0) await clickWin('买 1 个 · 4 金');
  await closeWin(p);
  ok(await read(() => (__MOSS__.state.inventory.wood || 0) >= 12 && (__MOSS__.state.inventory.stone || 0) >= 6),
    '在阿栎木工作坊按标价真实购买磨坊维修材料');

  await interact(22, 22);
  await clickWin('前往风铃磨坊与麦田村');
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_village');
  ok(await read(() => __MOSS__.state.sceneId === 'mill_village'), '从小镇东南乡道首次步行进入磨坊村');

  await doMillAction(31, 20, '记录进水渠 · 10分钟', 'intake');
  await enterDoor(29, 16, 'mill_workshop');
  await doMillAction(13, 7, '记录齿轮磨损 · 10分钟', 'gear');
  await doMillAction(9, 6, '更换木桨 · 木材12／石头6／60分钟', 'repair', 'paddles');
  await exitSceneTo('mill_village');

  await doMillAction(11, 25, '记录农田意见 · 10分钟', 'farmOpinion');
  await enterDoor(10, 17, 'mill_bakery');
  await doMillAction(9, 6, '记录面包房意见 · 10分钟', 'breadOpinion');
  await exitSceneTo('mill_village');
  await enterDoor(19, 11, 'mill_hall');
  await doMillAction(9, 5, '轮流取水 · 每天磨3批', 'allocation', 'balanced');
  await doMillAction(9, 5, '启动试运行 · 20分钟', 'trialDay', await read(() => __MOSS__.state.totalDay));

  // Return by the actual village road, sleep at the farmhouse, then walk back.
  await exitSceneTo('mill_village');
  await exitSceneTo('town');
  await goFarm();
  await sleepOneNight();
  await goFarm();
  await goTown();
  await interact(22, 22);
  await clickWin('前往风铃磨坊与麦田村');
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_village');
  await enterDoor(19, 11, 'mill_hall');
  await doMillAction(9, 5, '验收试运行 · 奖励90金', 'inspected');
  ok(await read(() => __MOSS__.state.millLife?.inspected && __MOSS__.state.millLife?.repair === 'paddles'),
    '磨坊自然实践验收完成，水利站路线由游戏状态开放');
};
const enterByKeyboard = async (x, y, scene) => {
  await go(x, y);
  await faceTowards(p, x, y);
  await p.keyboard.press('e');
  await p.waitForFunction(want => __MOSS__.state.sceneId === want, scene, { timeout: 10000 });
  ok(await read(want => __MOSS__.state.sceneId === want, scene), `按交互键实际进入 ${scene}`);
};
const walkTransition = async (x, y, scene, label) => {
  ok(await walkTo(p, x, y, 25000), label);
  await p.waitForFunction(want => __MOSS__.state.sceneId === want, scene, { timeout: 10000 });
  ok(await read(want => __MOSS__.state.sceneId === want, scene), `抵达 ${scene}`);
};
const gateTransition = async (x, y, button, scene) => {
  await interact(x, y);
  await clickWin(button);
  await p.waitForFunction(want => __MOSS__.state.sceneId === want, scene, { timeout: 10000 });
  ok(await read(want => __MOSS__.state.sceneId === want, scene), `通过游戏路线进入 ${scene}`);
};
const doR3Action = async (x, y, button, readback, label = button, readbackArg) => {
  await interact(x, y);
  await clickWin(button);
  await closeWin(p);
  ok(await read(readback, readbackArg), `R3现场结算：${label}`);
};
const enterMillVillage = async () => gateTransition(22, 22,
  '前往风铃磨坊与麦田村', 'mill_village');
const enterWaterworks = async () => gateTransition(4, 15,
  '前往 水库堤坝与水利站', 'waterworks');
const enterMeadow = async () => gateTransition(2, 18,
  '前往石楠草甸', 'meadow');
const enterPort = async () => gateTransition(7, 10,
  '前往 下游河港与船闸', 'port');
const runNaturalR3Project = async () => {
  // Open and read all three actual dam sites before entering the control room.
  await exitSceneTo('mill_village');
  await enterWaterworks();
  await doR3Action(20, 18, '读水尺并取样 · 15分钟',
    () => __MOSS__.engProjectInfo().survey.level > 0, '坝顶水尺读数');
  await doR3Action(21, 20, '探查东岸坡脚 · 25分钟',
    () => !!__MOSS__.engProjectInfo().survey.east, '东岸坡脚勘测');
  await doR3Action(21, 16, '测量下游淤积 · 30分钟',
    () => !!__MOSS__.engProjectInfo().survey.silt, '下游淤积勘测');
  ok(await read(() => __MOSS__.engProjectInfo().phase === 'certify' &&
    __MOSS__.engProjectInfo().practiceRoute === 'mill'),
  '现场读数齐全，磨坊实践路线可领取基础工程认证');

  await enterDoor(9, 9, 'waterworks_control');
  await doR3Action(8, 6, '领取基础工程认证 · 30分钟',
    () => __MOSS__.engProjectInfo().practice === 'mill' && __MOSS__.engProjectInfo().scope === 'survey');
  await doR3Action(8, 6, '签署第一份独立工程报告 · 40分钟',
    () => __MOSS__.engInfo().stage === 1, '签署工程报告并进入独立项目阶段');
  await exitSceneTo('waterworks');
  await doR3Action(20, 18, '旧闸预防性巡检加固（不用材料）· 120分钟',
    () => __MOSS__.engInfo().stage === 2 && !__MOSS__.engInfo().incident,
    '汛前预防性考核，不制造事故');
  await enterDoor(9, 9, 'waterworks_control');
  await doR3Action(8, 6, '接受正式工程岗位 · 60分钟',
    () => __MOSS__.engInfo().post === 'waterworks_engineer');
  const coinsBeforeGrant = await p.evaluate(() => __MOSS__.engInfo().playerCoins);
  await doR3Action(8, 6, '申请机构工程拨付 · 150金',
    coins => __MOSS__.engProjectInfo().funds.granted === 150 && __MOSS__.engInfo().playerCoins === coins,
    '一次性机构拨付进入项目账，不从个人钱包扣款', coinsBeforeGrant);

  // Record the three stakeholder opinions at their real locations.
  await exitSceneTo('waterworks');
  await exitSceneTo('mill_village');
  await doR3Action(17, 25, '记录上下游意见 · 10分钟',
    () => __MOSS__.engProjectInfo().opinions.mill, '记录磨坊与麦田意见');
  await exitSceneTo('town');
  await enterMeadow();
  await doR3Action(18, 18, '记录上下游意见 · 10分钟',
    () => __MOSS__.engProjectInfo().opinions.meadow, '记录牧场供水意见');
  await exitSceneTo('town');
  await walkTransition(31, 10, 'riverside', '从小镇东桥步行前往河湾');
  await enterPort();
  await enterDoor(34, 14, 'port_lockhouse');
  await doR3Action(14, 6, '记录上下游意见 · 10分钟',
    () => __MOSS__.engProjectInfo().opinions.port, '记录河港航运意见');
  await exitSceneTo('port');
  await enterDoor(23, 9, 'port_office');
  await doR3Action(10, 6, '核验封签与装卸簿 · 20分钟',
    () => __MOSS__.state.professionalLife.port.manifestChecked, '河港核验货单');
  await doR3Action(10, 6, '补运两箱并维护合作 · 消耗10金',
    () => __MOSS__.state.professionalLife.port.choice === 'reship', '选择补运维护合作');
  await exitSceneTo('port');
  await exitSceneTo('riverside');
  await exitSceneTo('town');
  await enterMillVillage();
  await enterWaterworks();
  await enterDoor(9, 9, 'waterworks_control');
  await doR3Action(8, 6, '定案：兼顾通航',
    () => __MOSS__.engProjectInfo().scheme === 'balanced' &&
      __MOSS__.engProjectInfo().phase === 'scheme', '三方意见与拨付齐全后定案');
  await exitSceneTo('waterworks');
  await exitSceneTo('mill_village');
  await exitSceneTo('town');

  // Normal quest rewards, surplus crops and daily allowances finance materials.
  const saleBefore = await read(() => ({ coins: __MOSS__.state.coins,
    radish: __MOSS__.state.inventory.radish || 0, potato: __MOSS__.state.inventory.potato || 0 }));
  await interact(8, 7);
  await clickWin('出售全部可售物品');
  await closeWin(p);
  ok(await read(before => __MOSS__.state.coins > before,
    saleBefore.coins), '在种子铺出售已完成委托后的剩余收成');

  await goFarm();
  await sleepOneNight();
  await goFarm();
  await goTown();
  await interact(20, 7);
  for (let i = 0; i < 3; i++) await clickWin('买 10 个 · 60 金');
  for (let i = 0; i < 9; i++) await clickWin('买 1 个 · 6 金');
  await clickWin('买 10 个 · 40 金');
  for (let i = 0; i < 6; i++) await clickWin('买 1 个 · 4 金');
  for (let i = 0; i < 3; i++) await clickWin('买 1 个 · 60 金');
  await clickWin('买 1 个 · 24 金');
  await closeWin(p);
  ok(await read(() => (__MOSS__.state.inventory.wood || 0) >= 39 &&
    (__MOSS__.state.inventory.stone || 0) >= 16 &&
    (__MOSS__.state.inventory.iron_ore || 0) >= 3 &&
    (__MOSS__.state.inventory.coal || 0) >= 1),
    '通过工作坊按标价购买森林入口、采场支护和熔炼所需材料');
  await interact(20, 7);
  await clickWin('个人刀剑 / 熔炼 / 水泵分析');
  await clickWin('熔炼铁锭 · 铁矿3 + 煤1');
  await closeWin(p);
  ok(await read(() => (__MOSS__.state.inventory.iron_ingot || 0) === 1),
    '实际熔炼闸件安装所需铁锭');

  // Walk the forest and mine gates, then produce inspected stone in the quarry.
  await interact(14, 1);
  const forestRepairBefore = await read(() => ({ wood: __MOSS__.state.inventory.wood || 0,
    coins: __MOSS__.state.coins }));
  await clickWin('确认修复 / 升级');
  await closeWin(p);
  ok(await read(before => (__MOSS__.state.inventory.wood || 0) === before.wood - 15 &&
    __MOSS__.state.coins === before.coins - 80, forestRepairBefore), '真实支付森林入口修复成本');
  await enterByKeyboard(14, 1, 'forest');
  await interact(30, 4);
  const mineRepairBefore = await read(() => ({ wood: __MOSS__.state.inventory.wood,
    stone: __MOSS__.state.inventory.stone }));
  await clickWin('确认修复 / 升级');
  await closeWin(p);
  ok(await read(before => __MOSS__.state.inventory.wood === before.wood - 20 &&
    __MOSS__.state.inventory.stone === before.stone - 10, mineRepairBefore), '真实修复矿山支撑梁与轨道');
  await enterByKeyboard(30, 4, 'mine1');
  await gateTransition(2, 14, '前往 石灰采场与材料工地', 'quarry');
  await doR3Action(18, 18, '测量裂隙 · 20分钟',
    () => __MOSS__.state.professionalLife.quarry.surveyed, '先调查采场裂隙');
  await doR3Action(18, 18, '石灰层采区 · 石头 ×6',
    () => __MOSS__.state.professionalLife.quarry.face === 'carbonate', '选择石灰层采区');
  await doR3Action(18, 18, '支护采区 · 木材 ×4',
    () => __MOSS__.state.professionalLife.quarry.props, '先支护后采掘');
  await doR3Action(18, 18, '采掘石灰岩料 ×8 · 25分钟',
    () => __MOSS__.state.professionalLife.quarry.extracted === 8, '按日采掘八份石灰岩料');
  await enterDoor(8, 15, 'quarry_shed');
  await doR3Action(8, 7, '切割工程石料 ×3 · 石灰岩 ×4',
    () => __MOSS__.state.professionalLife.quarry.cut === 3, '切割并编号第一批工程石料');
  await doR3Action(8, 7, '切割工程石料 ×3 · 石灰岩 ×4',
    () => __MOSS__.state.professionalLife.quarry.cut === 6, '切割并编号第二批工程石料');
  ok(await read(() => (__MOSS__.state.inventory.stone_block || 0) === 6),
    '采场原料实际转为六块验收石料');
  await exitSceneTo('quarry');
  await exitSceneTo('mine1');
  await exitSceneTo('forest');
  await exitSceneTo('town');
  await goFarm();
  await sleepOneNight();
  await goFarm();
  await goTown();
  await walkTransition(31, 10, 'riverside', '沿东桥返回河湾运输路线');
  await enterPort();
  await enterDoor(23, 9, 'port_office');
  await doR3Action(10, 6, '装运验收石料至水利站 · 石料 ×3',
    () => __MOSS__.state.professionalLife.port.shipment === 'waterworks' &&
      !__MOSS__.state.professionalLife.port.settled &&
      (__MOSS__.state.inventory.cargo_manifest || 0) === 1,
    '河港装运石料并取得随货核验运单');
  await exitSceneTo('port');
  await exitSceneTo('riverside');
  await exitSceneTo('town');
  await enterMillVillage();
  await enterWaterworks();
  await doR3Action(20, 18, '签收石料运单 · 消耗核验运单',
    () => __MOSS__.engProjectInfo().stone &&
      (__MOSS__.state.inventory.cargo_manifest || 0) === 0,
    '水利站現場签收随货石料');
  await doR3Action(20, 18, '安装闸件套装 · 铁锭 ×1',
    () => __MOSS__.engProjectInfo().phase === 'materials' &&
      __MOSS__.engProjectInfo().kit === 1 &&
      (__MOSS__.state.inventory.iron_ingot || 0) === 0,
    '安装套装并消耗亲自熔炼的铁锭');

  await interact(22, 14);
  await clickWin('亲自施工（不用工钱）');
  await closeWin(p);
  ok(await read(() => __MOSS__.engProjectInfo().mode === 'self'), '选择亲自施工并使用同一份工程进度');
  const steps = await read(() => __MOSS__.engProjectInfo().steps);
  for (let i = 0; i < steps.length; i++) {
    await doR3Action(22, 14, `亲自完成：${steps[i]} · 90分钟`,
      expected => __MOSS__.engProjectInfo().build === expected, `完成现场工序 ${i + 1}/${steps.length}`, i + 1);
  }
  await doR3Action(22, 14, '封闸并启动试运行 · 30分钟',
    () => __MOSS__.engProjectInfo().phase === 'trial', '在闸基封闸并启动跨日试运行');
  const safety = await read(() => __MOSS__.engProjectInfo().safety);
  if (safety.status === 'watch') {
    await doR3Action(22, 14, '现场检查销钉与渗水 · 20分钟',
      () => __MOSS__.engProjectInfo().safety.inspectionDay > 0,
      '自然勘测形成预警后实际到闸基检查');
    await doR3Action(22, 14, '自行加固（不用材料）· 90分钟',
      () => __MOSS__.engProjectInfo().safety.status === 'clear' &&
        __MOSS__.engProjectInfo().outcome === 'prevented',
      '在预警期现场加固，未漏检');
  }
  ok(await read(() => __MOSS__.engProjectInfo().safety.status === 'clear'),
    '试运行安全状态可跨夜复核');

  // The trial cannot be accepted until an actual night has passed.
  await exitSceneTo('mill_village');
  await exitSceneTo('town');
  await goFarm();
  await sleepOneNight();
  await goFarm();
  await goTown();
  await enterMillVillage();
  await enterWaterworks();
  await doR3Action(20, 18, '复核试运行并签署验收 · 报酬 90 金',
    () => __MOSS__.engProjectInfo().phase === 'accepted' &&
      __MOSS__.engProjectInfo().scope === 'works' &&
      __MOSS__.engProjectInfo().duty.status === 'active',
    '跨夜复核后验收工程并正式接下养护责任');
  ok(await read(() => __MOSS__.engProjectInfo().allocation === 'navigation' &&
    __MOSS__.engProjectInfo().shipping === 50),
    '兼顾通航方案在验收后落实供水与货运效果');

  // Complete the post-acceptance river contract by carrying its real manifest.
  await exitSceneTo('mill_village');
  await exitSceneTo('town');
  await walkTransition(31, 10, 'riverside', '从小镇再次步行前往下游河港');
  await enterPort();
  await enterDoor(23, 9, 'port_office');
  await doR3Action(10, 6, '接受河湾闸件复检合同 · 15分钟',
    () => __MOSS__.state.professionalLife.port.riverContract.status === 'active',
    '按已验收方案签订河港闸件复检运输合同');
  await doR3Action(10, 6, '备一套闸件复检包 · 消耗15金',
    () => (__MOSS__.state.inventory.sluice_kit || 0) === 1,
    '按合同真实备货');
  await doR3Action(10, 6, '装运闸件复检包至水利站 · 闸件 ×1',
    () => __MOSS__.state.professionalLife.port.riverContract.status === 'in_transit' &&
      __MOSS__.state.professionalLife.port.shipment === 'river_contract' &&
      (__MOSS__.state.inventory.cargo_manifest || 0) === 1,
    '河港发出闸件复检包，随货运单进入在途状态');
  await exitSceneTo('port');
  await exitSceneTo('riverside');
  await exitSceneTo('town');
  await enterMillVillage();
  await enterWaterworks();
  await doR3Action(20, 18, '签收闸件复检包 · 消耗核验运单',
    () => __MOSS__.state.professionalLife.port.riverContract.status === 'delivered' &&
      __MOSS__.state.professionalLife.port.settled,
    '水利站实地签收并结清闸件复检运单');

  // Let the duty's three-day cycle mature, then perform one physical inspection.
  await exitSceneTo('mill_village');
  await exitSceneTo('town');
  await goFarm();
  const dutyDue = await read(() => __MOSS__.engProjectInfo().duty.nextDay);
  while (await read(() => __MOSS__.state.totalDay) < dutyDue) {
    await sleepOneNight();
    await goFarm();
  }
  await goTown();
  await enterMillVillage();
  await enterWaterworks();
  await doR3Action(20, 18, '闸门养护检视 · 45分钟',
    () => __MOSS__.engProjectInfo().duty.done === 1 &&
      __MOSS__.engProjectInfo().maintCount === 1,
    '到期后实地完成一个养护周期检视');

  // Reload only through the game's normal continue flow to check persistence.
  const beforeReload = await read(() => ({
    coins: __MOSS__.state.coins,
    phase: __MOSS__.engProjectInfo().phase,
    dutyDone: __MOSS__.engProjectInfo().duty.done,
    route: __MOSS__.engProjectInfo().outcome,
    contract: __MOSS__.state.professionalLife.port.riverContract.status
  }));
  await p.reload();
  await p.locator('.boot-actions button', { hasText: '继续游戏' }).click();
  await p.waitForFunction(() => !!__MOSS__.state && document.getElementById('boot').hidden);
  ok(await read(before => {
    const pj = __MOSS__.engProjectInfo();
    return __MOSS__.state.coins === before.coins && pj.phase === before.phase &&
      pj.duty.done === before.dutyDone && pj.outcome === before.route &&
      __MOSS__.state.professionalLife.port.riverContract.status === before.contract;
  }, beforeReload), '正常读档保留工程、预防记录、河港合同与养护，不重复结算');
  ok(run.errors.length === 0, '完整自然路线没有浏览器报错');
};
const runRookieEngineering = async () => {
  const positions = { board: [14, 9], workshop: [20, 7] };
  const steps = [
    ['board', '报名公共水泵维修'],
    ['workshop', '检查手柄与固定栓'],
    ['board', '核对居民用水记录'],
    ['workshop', '借用扳手紧固并试水'],
    ['board', '提交维修记录并领取报酬']
  ];
  await p.keyboard.press('j');
  await clickWin('小镇入门');
  await closeWin(p);
  ok(await read(() => __MOSS__.state.sceneId === 'town'), '在小镇开始工程入门，不尝试越过未修小桥');
  for (let i = 0; i < steps.length; i++) {
    const [site, label] = steps[i];
    await interact(...positions[site]);
    if (site === 'board') await clickWin('小镇入门');
    await clickWin(label);
    await closeWin(p);
    ok(await read(n => __MOSS__.rookieState().engineering === n, i + 1), `工程入门真实完成：${label}`);
  }
  const result = await read(() => ({
    route: __MOSS__.routeInfo().r.engineering,
    coins: __MOSS__.state.coins,
    bridge: __MOSS__.state.bridgeRepaired,
    cert: __MOSS__.engProjectInfo().practiceRoute
  }));
  ok(result.route === 2 && !result.bridge && !result.cert,
    '工程入门仅取得路线记录，未借用修桥或工程实践证书');
};

const run = await launch();
try {
  p = run.page;
  // Explicit fresh-save setup: browser storage only. All following changes use game UI/input.
  await boot(p, { fresh: true });
  const initial = await read(() => ({
    day: __MOSS__.state.totalDay, scene: __MOSS__.state.sceneId,
    coins: __MOSS__.state.coins, inventory: Object.assign({}, __MOSS__.state.inventory),
    quest: Object.assign({}, __MOSS__.state.questProgress),
    practice: __MOSS__.engProjectInfo().practiceRoute
  }));
  ok(initial.day === 1 && initial.scene === 'farm' && initial.coins === 50,
    '使用全新存档起点，无沿用位置或物资');
  ok(initial.inventory.seed_radish === 8 && initial.inventory.seed_potato === 2 &&
    initial.quest[1] === 'unlocked' && initial.practice === '',
    '全新存档只有开局种子，工程实践尚未完成');

  const radishPlots = [[8, 8], [9, 8], [10, 8], [11, 8], [8, 9], [9, 9], [10, 9], [11, 9]];
  const potatoPlots = [[12, 8], [12, 9]];
  for (const [x, y] of [...radishPlots, ...potatoPlots]) await clickTool(1, x, y);
  await chooseSeed('萝卜');
  for (const [x, y] of radishPlots) await clickTool(2, x, y);
  await chooseSeed('土豆');
  for (const [x, y] of potatoPlots) await clickTool(2, x, y);
  await waterDryCrops();
  ok(await read(() => Object.keys(__MOSS__.state.plots).length === 10 &&
    Object.values(__MOSS__.state.plots).filter(q => q.crop === 'radish').length === 8 &&
    Object.values(__MOSS__.state.plots).filter(q => q.crop === 'potato').length === 2),
  '实际翻土、播种 8 株萝卜和 2 株土豆');

  for (let i = 0; i < 8; i++) {
    const ready = await read(() => ({
      radish: Object.values(__MOSS__.state.plots).filter(q => q.crop === 'radish' && q.mature).length,
      potato: Object.values(__MOSS__.state.plots).filter(q => q.crop === 'potato' && q.mature).length,
      day: __MOSS__.state.totalDay
    }));
    if (ready.radish === 8 && ready.potato === 2) break;
    await sleepOneNight();
    await waterDryCrops();
  }
  const maturePlots = await read(() => Object.entries(__MOSS__.state.plots)
    .filter(([, q]) => q.mature).map(([key]) => key.split(',').map(Number)));
  ok(maturePlots.length === 10, '自然等待至萝卜与土豆成熟');
  for (const tile of maturePlots) await harvestCrop(tile);
  const cropInventory = await read(() => ({ radish: __MOSS__.state.inventory.radish || 0,
    potato: __MOSS__.state.inventory.potato || 0 }));
  ok(cropInventory.radish >= 8 && cropInventory.potato >= 2,
    `实际收获满足两次委托材料（萝卜 ${cropInventory.radish}，土豆 ${cropInventory.potato}）`);

  await goTown();
  await interact(14, 9);
  await clickWin('主线');
  await clickWin('交付材料');
  await closeWin(p);
  ok(await read(() => __MOSS__.state.questProgress[1] === 'done' &&
    __MOSS__.state.questProgress[2] === 'unlocked'), '在任务板真实交付第一份收成并解锁木匠委托');
  await runRookieEngineering();

  const treeNodes = await read(() => __MOSS__.MAPS.farm.trees.map(([x, y]) => [x, y]));
  const rockNodes = await read(() => __MOSS__.MAPS.farm.rocks.map(([x, y]) => [x, y]));
  await goFarm();
  for (const [x, y] of treeNodes.slice(0, 3)) await gatherNode(5, x, y, 3);
  for (const [x, y] of rockNodes.slice(0, 3)) await gatherNode(6, x, y, 2);
  const firstMaterials = await read(() => ({ wood: __MOSS__.state.inventory.wood || 0,
    stone: __MOSS__.state.inventory.stone || 0 }));
  ok(firstMaterials.wood >= 15 && firstMaterials.stone >= 9,
    '真实砍树采石凑齐木匠委托，不直接改背包');
  await goTown();
  await interact(14, 9);
  await clickWin('主线');
  await clickWin('交付材料');
  await closeWin(p);
  ok(await read(() => __MOSS__.state.questProgress[2] === 'done' &&
    __MOSS__.state.questProgress[3] === 'unlocked'), '真实交付木匠材料并解锁修桥委托');

  // Finish collecting the bridge materials through the farm's real tree and stone nodes.
  await goFarm();
  await sleepOneNight();
  for (const [x, y] of treeNodes.slice(3, 8)) await gatherNode(5, x, y, 3);
  for (const [x, y] of rockNodes.slice(3, 8)) await gatherNode(6, x, y, 2);
  await waterDryCrops();
  // By the fifth watered night, the two potato crops must be mature. Harvest only
  // those still present; the radish plots were already cleared for the first quest.
  const remainingMature = await read(() => Object.entries(__MOSS__.state.plots)
    .filter(([, q]) => q.crop && q.mature).map(([key]) => key.split(',').map(Number)));
  for (const tile of remainingMature) await harvestCrop(tile);

  let inv = await read(() => ({ wood: __MOSS__.state.inventory.wood || 0,
    stone: __MOSS__.state.inventory.stone || 0, radish: __MOSS__.state.inventory.radish || 0,
    potato: __MOSS__.state.inventory.potato || 0 }));
  if (inv.wood < 25 || inv.stone < 15 || inv.radish < 5 || inv.potato < 2) {
    throw new Error(`自然材料链未凑齐修桥材料：${JSON.stringify(inv)}`);
  }
  await goTown();
  await interact(26, 9);
  await clickWin('主线');
  await clickWin('交付材料');
  await closeWin(p);
  ok(await read(() => __MOSS__.state.bridgeRepaired &&
    __MOSS__.state.questProgress[3] === 'done'), '小桥施工点真实验收：木料、石料、萝卜与土豆齐备');
  ok(await read(() => __MOSS__.state.coins >= 75 &&
    __MOSS__.routeInfo().r.engineering === 2), '报酬来自真实任务，工程入门证据已留存');

  // Complete the public trade introduction so later natural-route evidence can
  // reach the harbor without injecting a route or travel permit.
  await sleepOneNight();
  await goFarm();
  await goTown();
  await runRookieTrade();
  await runMillPractice();
  await runNaturalR3Project();

  ok(run.errors.length === 0, '自然前置路线没有浏览器报错');
} catch (error) {
  console.error('自然路线失败时状态', await read(() => ({ scene: __MOSS__.state.sceneId,
    day: __MOSS__.state.totalDay, time: __MOSS__.state.timeMinutes, energy: __MOSS__.state.energy,
    coins: __MOSS__.state.coins, inventory: __MOSS__.state.inventory, project: __MOSS__.engProjectInfo() })).catch(() => null));
  throw error;
} finally {
  await run.browser.close();
}
console.log(`R3 自然新档完整路线 ${checks} 项通过`);
