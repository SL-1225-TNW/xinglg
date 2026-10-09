import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let passed = 0;
function ok(name, value) { assert.ok(value, name); passed++; console.log('PASS', name); }
function eq(name, actual, expected) { assert.deepEqual(actual, expected, name); passed++; console.log('PASS', name); }

const run = await launch();
try {
  const page = run.page;
  await boot(page);
  await page.locator('#tutorialSkip').click();
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const pose = async (scene, x, y) => {
    await evaluate(() => __MOSS__.closeWindow());
    await page.evaluate(({ scene, x, y }) => __MOSS__.devSwitchScene(scene, x, y), { scene, x, y });
    await page.waitForTimeout(80);
  };
  const panel = async (method, arg) => {
    await page.evaluate(({ method, arg }) => __MOSS__[method](arg), { method, arg });
  };
  const night = async () => {
    await evaluate(() => { __MOSS__.closeWindow(); __MOSS__.performSettlement(false); __MOSS__.closeWindow(); });
    await page.waitForTimeout(80);
  };

  const legacy = await evaluate(() => __MOSS__.normalizeSaveForTest({ ...__MOSS__.serialize(), wetlandLife: undefined, professionalLife: undefined, militaryLife: undefined }));
  ok('旧存档可读且新增模块有默认值', legacy && !legacy.wetlandLife.permit && !legacy.professionalLife.waterworks.certified && !legacy.militaryLife.registered);
  eq('湿地未修桥前锁定', await evaluate(() => __MOSS__.extendedGateAllowed('wetland')), false);
  eq('湿地观察屋是真的室内地图', await evaluate(() => [__MOSS__.MAPS.wetland_observation.indoor, __MOSS__.isSolidTest('wetland_observation', 3, 3)]), [true, true]);
  eq('D 的八处真实室内均有碰撞家具', await evaluate(() => ['vineyard_press','vineyard_cellar','clinic_ward','clinic_archive','port_office','port_lockhouse','quarry_shed','waterworks_control'].every(id => __MOSS__.MAPS[id].indoor && __MOSS__.MAPS[id].solid.some(col => col.some(Boolean)))), true);
  eq('E 的营房、调查站和边城有独立内部', await evaluate(() => ['border_barracks','border_depot','oldroad_survey','neighbor_office','neighbor_exchange'].every(id => __MOSS__.MAPS[id].indoor && __MOSS__.MAPS[id].solid.some(col => col.some(Boolean)))), true);
  eq('湿地与河港入口在河湾地图内', await evaluate(() => __MOSS__.INTERACTABLES.riverside.filter(it => it.kind === 'extendedGate' && ['wetland','port'].includes(it.gate)).every(it => it.x >= 0 && it.y >= 0 && it.x < __MOSS__.MAPS.riverside.w && it.y < __MOSS__.MAPS.riverside.h)), true);
  eq('扩展地点交互点与室内返程落点均在地图内', await evaluate(() => {
    const maps = __MOSS__.MAPS, regions = __MOSS__.extendedRegionByScene, interactions = __MOSS__.INTERACTABLES;
    const badPoints = Object.entries(interactions).flatMap(([scene, list]) => list.filter(it => ['extendedGate','extendedDoor','extendedLife'].includes(it.kind) && (!maps[scene] || it.x < 0 || it.y < 0 || it.x >= maps[scene].w || it.y >= maps[scene].h)).map(it => scene + ':' + it.label));
    const badWorksites = Object.entries(interactions).flatMap(([scene, list]) => list.filter(it => it.kind === 'extendedLife' && maps[scene] && [[it.x,it.y],[it.x+1,it.y],[it.x-1,it.y],[it.x,it.y+1],[it.x,it.y-1]].every(([x,y]) => x < 0 || y < 0 || x >= maps[scene].w || y >= maps[scene].h || maps[scene].solid[x][y] === 1)).map(it => scene + ':' + it.label));
    const badExits = Object.entries(regions).flatMap(([scene]) => (maps[scene].exits || []).filter(exit => !maps[exit.to] || exit.tx < 0 || exit.ty < 0 || exit.tx >= maps[exit.to].w || exit.ty >= maps[exit.to].h).map(exit => scene + '→' + exit.to));
    return [badPoints, badWorksites, badExits];
  }), [[], [], []]);

  // Wetland: register, survey, collect separate source samples, verify cause, repair habitat.
  await evaluate(() => { __MOSS__.state.bridgeRepaired = true; __MOSS__.state.energy = 100; __MOSS__.state.timeMinutes = 450; });
  eq('修桥后湿地开放', await evaluate(() => __MOSS__.extendedGateAllowed('wetland')), true);
  await pose('wetland', 17, 14); await panel('openWetlandSite', 'wetland_survey');
  await click('登记巡护许可 · 10分钟');
  await click('巡护并记录水鸟 · 15分钟');
  eq('巡护登记与首份调查入档', await evaluate(() => [__MOSS__.wetlandLifeState().permit, __MOSS__.wetlandLifeState().surveyCount, __MOSS__.wetlandLifeState().birdCount]), [true, 1, 2]);
  await pose('wetland', 24, 15); await panel('openWetlandSite', 'wetland_reeds'); await click('采集许可芦苇 ×2 · 10分钟');
  eq('许可采集有上限且记录产量', await evaluate(() => [__MOSS__.state.inventory.marsh_reed, __MOSS__.wetlandLifeState().plantSamples]), [2, 2]);
  const reedEnergy = await evaluate(() => __MOSS__.state.energy);
  await click('采集许可芦苇 ×2 · 10分钟');
  eq('同日重复采芦苇不扣体力', await evaluate(() => __MOSS__.state.energy), reedEnergy);
  await pose('wetland', 26, 19); await panel('openWetlandSite', 'wetland_sample'); await click('采集封存水样 ×1 · 15分钟');
  await pose('wetland', 33, 15); await panel('openWetlandSite', 'wetland_outfall'); await click('采集封存水样 ×1 · 15分钟');
  eq('上游和溢流口各记一份样本', await evaluate(() => [__MOSS__.wetlandLifeState().upstreamSample, __MOSS__.wetlandLifeState().outfallSample, __MOSS__.wetlandLifeState().waterSamples]), [true, true, 2]);
  await pose('wetland_observation', 9, 6); await panel('openWetlandSite', 'wetland_cause');
  await click('辨认水草样本 · 芦苇 ×1');
  await click('对照水样与旧水道图 · 30分钟');
  eq('原因由两个点位与调查共同确认', await evaluate(() => [__MOSS__.wetlandLifeState().causeFound, __MOSS__.state.inventory.marsh_sample, __MOSS__.professionalLifeState().access.clinic]), [true, 1, true]);
  await evaluate(() => { __MOSS__.state.inventory.wood = 10; __MOSS__.state.inventory.stone = 10; });
  await click('清理溢流口 · 木材 ×2／石头 ×4');
  eq('修复后水鸟增加且结果保留', await evaluate(() => [__MOSS__.wetlandLifeState().habitat, __MOSS__.wetlandLifeState().birdCount]), ['open_water', 4]);
  await pose('wetland', 17, 14); await panel('openWetlandSite', 'wetland_survey');
  const surveyEnergy = await evaluate(() => __MOSS__.state.energy); await click('巡护并记录水鸟 · 15分钟');
  eq('每日调查不能重复结算', await evaluate(() => [__MOSS__.wetlandLifeState().surveyCount, __MOSS__.state.energy]), [1, surveyEnergy]);

  // D: harvest grapes, press them, move real cargo through the port, and treat the patient.
  await evaluate(() => { __MOSS__.state.millLife.inspected = true; __MOSS__.state.coins = 500; __MOSS__.state.energy = 100; __MOSS__.state.timeMinutes = 450; __MOSS__.state.weather.today = 'sun'; });
  eq('完成磨坊验收后开放葡萄园', await evaluate(() => __MOSS__.extendedGateAllowed('vineyard')), true);
  await pose('vineyard', 21, 17); await panel('openProfessionSite', 'vineyard'); await click('接受计划：压汁供应医舍 · 20分钟'); await click('按计划采收葡萄 ×6');
  eq('采收计划生成真实葡萄', await evaluate(() => [__MOSS__.professionalLifeState().vineyard.plan, __MOSS__.state.inventory.grape]), ['juice', 6]);
  await pose('vineyard_press', 8, 7); await panel('openProfessionSite', 'press'); await click('压榨葡萄汁 ×3 · 葡萄 ×4');
  eq('压榨消耗葡萄并产出饮料', await evaluate(() => [__MOSS__.state.inventory.grape, __MOSS__.state.inventory.grape_juice]), [2, 3]);
  await evaluate(() => { __MOSS__.state.exploration.mine = true; __MOSS__.state.inventory.wood = 20; __MOSS__.state.inventory.stone = 20; __MOSS__.state.inventory.iron_ingot = 1; });
  eq('湿地原因和采收共同开放医舍', await evaluate(() => __MOSS__.extendedGateAllowed('clinic')), true);
  eq('湿地原因开放河港', await evaluate(() => __MOSS__.extendedGateAllowed('port')), true);
  await pose('port_office', 10, 6); await panel('openProfessionSite', 'port'); await click('核验封签与装卸簿 · 20分钟'); await click('补运两箱并维护合作 · 消耗10金'); await click('装运葡萄汁至白鸢医舍 · 葡萄汁 ×2');
  eq('葡萄汁经河港成为待签收货物', await evaluate(() => [__MOSS__.professionalLifeState().port.shipment, __MOSS__.state.inventory.cargo_manifest, __MOSS__.state.inventory.grape_juice]), ['clinic', 1, 1]);
  await pose('clinic_archive', 8, 7); await panel('openProfessionSite', 'archive'); await click('核对湿地水草样本 · 15分钟');
  eq('档案核验样本来源后才开放诊断', await evaluate(() => __MOSS__.professionalLifeState().clinic.sampleVerified), true);
  await pose('clinic_ward', 9, 7); await panel('openProfessionSite', 'clinic'); await click('签收医舍葡萄汁运单 · 运单 ×1'); await click('辨认药材并建立病历 · 15分钟'); await click('配制草药包 ×2 · 芦苇样本与葡萄汁'); await click('照护病人并记录复诊 · 草药包 ×1');
  const followUpDay = await evaluate(() => __MOSS__.state.totalDay + 1);
  eq('诊断、签收、配药、照护分别记账', await evaluate(() => [__MOSS__.professionalLifeState().clinic.diagnosed, __MOSS__.professionalLifeState().clinic.receivedJuice, __MOSS__.professionalLifeState().clinic.medicine, __MOSS__.professionalLifeState().clinic.patientDay]), [true, true, 1, followUpDay]);
  await night(); await pose('clinic_ward', 9, 7); await panel('openProfessionSite', 'clinic'); await click('复诊并更新病历 · 10分钟');
  eq('隔夜复诊后病历结案', await evaluate(() => __MOSS__.professionalLifeState().clinic.recovered), true);

  // Quarry and waterworks: quarry face, support, extraction, cutting, port receipt, three stakeholder choices.
  eq('修复矿入口后石灰采场开放', await evaluate(() => __MOSS__.extendedGateAllowed('quarry')), true);
  await pose('quarry', 18, 17); await panel('openProfessionSite', 'quarry'); await click('测量裂隙 · 20分钟'); await click('避开裂隙 · 木材 ×6'); await click('支护采区 · 木材 ×4'); await click('采掘稳定石灰岩料 ×6 · 20分钟');
  eq('采场调查后采出有来源的石灰岩', await evaluate(() => [__MOSS__.professionalLifeState().quarry.surveyed, __MOSS__.professionalLifeState().quarry.props, __MOSS__.state.inventory.limestone]), [true, true, 6]);
  await pose('quarry_shed', 8, 7); await panel('openProfessionSite', 'shed'); await click('切割工程石料 ×3 · 石灰岩 ×4');
  eq('测量棚将原石加工为验收石料', await evaluate(() => [__MOSS__.state.inventory.stone_block, __MOSS__.professionalLifeState().quarry.cut]), [3, 3]);
  eq('采场调查與河港核单开放水利站', await evaluate(() => __MOSS__.extendedGateAllowed('waterworks')), true);
  await pose('port_office', 10, 6); await panel('openProfessionSite', 'port'); await click('装运验收石料至水利站 · 石料 ×3');
  await pose('waterworks', 20, 18); await panel('openProfessionSite', 'gauge'); await click('读水尺并取样 · 15分钟'); await click('签收石料运单 · 消耗核验运单');
  eq('货物在水利站实物签收', await evaluate(() => [__MOSS__.professionalLifeState().waterworks.receivedStone, __MOSS__.professionalLifeState().watershedContract]), [true, 1]);
  await pose('waterworks_control', 8, 6); await panel('openProfessionSite', 'water'); await click('安装闸件并封存石料 · 铁锭 ×1');
  await pose('mill_village', 17, 24); await panel('openProfessionSite', 'opinion_mill'); await click('记录上下游意见 · 10分钟');
  await pose('meadow', 18, 17); await panel('openProfessionSite', 'opinion_meadow'); await click('记录上下游意见 · 10分钟');
  await pose('port_lockhouse', 14, 5); await panel('openProfessionSite', 'opinion_port'); await click('记录上下游意见 · 10分钟');
  await pose('waterworks_control', 8, 6); await panel('openProfessionSite', 'water'); await click('优先灌溉 · 保住田水，限制大型船只');
  await night(); await pose('waterworks_control', 8, 6); await panel('openProfessionSite', 'water'); await click('隔夜验收并发放工程证书 · 90金');
  eq('跨采场、河港、磨坊和牧场的水利合同验收', await evaluate(() => [__MOSS__.professionalLifeState().waterworks.certified, __MOSS__.professionalLifeState().waterworks.allocation, __MOSS__.professionalLifeState().watershedContract]), [true, 'irrigation', 3]);

  // E: signed authority, separate institutional funds, real deployment, three reproducible battle phases, and neighbor settlement.
  eq('水利证书开放云峰与营地', await evaluate(() => [__MOSS__.extendedGateAllowed('cloud_pass'), __MOSS__.extendedGateAllowed('border_camp')]), [true, true]);
  await evaluate(() => { __MOSS__.state.energy = 100; __MOSS__.state.timeMinutes = 450; });
  await pose('border_barracks', 8, 6); await panel('openMilitarySite', 'registration'); await click('办理巡路登记 · 15分钟');
  eq('登记才产生一级指挥权限和独立军费', await evaluate(() => [__MOSS__.militaryLifeState().rank, __MOSS__.militaryLifeState().commandLimit, __MOSS__.militaryLifeState().institutionFund]), ['patrol', 1, 100]);
  await pose('border_barracks', 8, 9); await panel('openMilitarySite', 'training'); await click('参加一次巡路与队列训练 · 20分钟');
  await night(); await pose('border_barracks', 8, 9); await panel('openMilitarySite', 'training'); await click('参加一次巡路与队列训练 · 20分钟');
  await pose('border_barracks', 14, 6); await panel('openMilitarySite', 'appointment'); await click('接受小队长委任 · 组建8人巡防队');
  eq('训练记录满足委任且小队受12人上限', await evaluate(() => [__MOSS__.militaryLifeState().qualification, __MOSS__.militaryLifeState().unit.count, __MOSS__.militaryLifeState().commandLimit]), [2, 8, 12]);
  await pose('border_depot', 8, 7); await panel('openMilitarySite', 'supply'); await click('用机构军费10金领巡防口粮 ×4');
  eq('机构军费与个人金币分账', await evaluate(() => [__MOSS__.militaryLifeState().institutionFund, __MOSS__.state.inventory.military_rations]), [90, 4]);
  await pose('border_barracks', 16, 7); await panel('openMilitarySite', 'campaign'); await click('签收七日巡防委任 · 开始任务');
  await pose('cloud_pass', 17, 17); await panel('openMilitarySite', 'pass_route'); await click('沿山脊巡查 · 记录高处桥面 · 20分钟');
  eq('侦察后部队真实部署在关口且保留审计路簿', await evaluate(() => [__MOSS__.militaryLifeState().unit.scene, __MOSS__.state.inventory.route_evidence]), ['pass', 2]);
  await night(); await pose('border_barracks', 16, 7); await panel('openMilitarySite', 'campaign'); await click('准备医疗护送 · 草药包 ×1／口粮 ×2');
  await night(); await pose('border_barracks', 16, 7); await panel('openMilitarySite', 'campaign'); await click('掩护居民与医帐撤离 · 规则裁判');
  const battle = await evaluate(() => __MOSS__.militaryLifeState().campaign.battle);
  ok('裁判给出固定种子和三个阶段', battle && battle.version === 1 && battle.seed > 0 && battle.phases.length === 3);
  ok('伤亡人数守恒、无永久删除人员', battle.wounded.own <= battle.initial.own && battle.final.own + battle.wounded.own === battle.initial.own);
  await click('向驻地指挥部提交复盘 · 完成章节');
  eq('任务提交后部队回到营地', await evaluate(() => [__MOSS__.militaryLifeState().campaign.reported, __MOSS__.militaryLifeState().unit.scene, __MOSS__.militaryLifeState().battleRecords.length]), [true, 'camp', 1]);
  const replay = await evaluate(input => [__MOSS__.battleJudge(input), __MOSS__.battleJudge(input)], battle.input);
  eq('裁判以相同种子可逐字段复现', replay[0], replay[1]);
  const overLimit = await evaluate(() => { try { __MOSS__.battleJudge({own:[{type:'guard',count:13}],enemy:[{type:'scout',count:2}],commandLimit:12,seed:1}); return false; } catch (e) { return /委任上限/.test(e.message); } });
  eq('超出签发人数的编队被拒绝', overLimit, true);
  eq('报告前旧路未授权邻领', await evaluate(() => __MOSS__.extendedGateAllowed('neighbor')), false);
  await pose('old_road', 23, 16); await panel('openOldRoadSite', 'oldroad_marker'); await click('记录旧界碑两种读法 · 20分钟');
  await pose('oldroad_survey', 8, 7); await panel('openOldRoadSite', 'oldroad_station'); await click('比对拓片与两省旧驿册 · 路况簿 ×1');
  eq('古道的界碑记录和驿册分开核验', await evaluate(() => [__MOSS__.militaryLifeState().neighbor.oldroadVerified, __MOSS__.state.inventory.route_evidence]), [true, 1]);
  eq('完成巡防和两份档案复核后邻领开放', await evaluate(() => __MOSS__.extendedGateAllowed('neighbor')), true);
  await pose('neighbor_office', 8, 7); await panel('openNeighborSite', 'neighbor_case'); await click('交换双方驿路记录 · 20分钟');
  await pose('neighbor_exchange', 8, 7); await panel('openNeighborSite', 'neighbor_exchange'); await click('试签一季互市合同 · 15分钟');
  await night(); await pose('neighbor_exchange', 8, 7); await panel('openNeighborSite', 'neighbor_exchange'); await click('隔夜后交换签章 · 完成邻领章节');
  eq('隔夜签章只批准互市，不会凭空结算货物', await evaluate(() => [__MOSS__.militaryLifeState().neighbor.settled, __MOSS__.militaryLifeState().neighbor.tradeReceived, __MOSS__.militaryLifeState().neighbor.localContract]), [true, false, false]);
  await pose('port_office', 10, 6); await panel('openProfessionSite', 'port'); await click('装运葡萄汁至邻领互市行栈 · 葡萄汁 ×1');
  eq('互市货物必须经河港装运', await evaluate(() => [__MOSS__.professionalLifeState().port.shipment, __MOSS__.state.inventory.cargo_manifest, __MOSS__.state.inventory.grape_juice||0]), ['neighbor', 1, 0]);
  await pose('neighbor_exchange', 8, 7); await panel('openNeighborSite', 'neighbor_exchange'); await click('签收互市葡萄汁运单 · 运单 ×1'); await click('结清已签收的互市货单 · 35金');
  eq('边城签收真实运单后才结清合同', await evaluate(() => [__MOSS__.militaryLifeState().neighbor.tradeReceived, __MOSS__.militaryLifeState().neighbor.localContract, __MOSS__.state.inventory.neighbor_seal]), [true, true, 1]);
  await night();
  await pose('border_barracks', 16, 7); await panel('openMilitarySite', 'campaign'); await click('复核互市道路护送 · 固定裁判复盘');
  eq('第二场护送行动也生成独立可审计战斗记录', await evaluate(() => [__MOSS__.militaryLifeState().battleRecords.length, __MOSS__.militaryLifeState().battleRecords[1].audit.phases.length, __MOSS__.militaryLifeState().unit.count + __MOSS__.militaryLifeState().unit.wounded]), [2, 3, 8]);
  await pose('border_barracks', 14, 6); await panel('openMilitarySite', 'appointment'); await click('接受驻地连队代理委任 · 上限40人');
  eq('完成七日巡防和邻领协定才扩大委任', await evaluate(() => [__MOSS__.militaryLifeState().rank, __MOSS__.militaryLifeState().commandLimit]), ['captain', 40]);
  await click('接受地区任务指挥委任 · 上限150人');
  eq('两场可重放裁判与公共信任开放最高委任', await evaluate(() => [__MOSS__.militaryLifeState().rank, __MOSS__.militaryLifeState().commandLimit]), ['field_commander', 150]);
  const forceBefore = await evaluate(() => __MOSS__.militaryLifeState().unit.count); await click('增补地区行动队员 ×10 · 机构军费 25金');
  eq('最高委任按机构军费扩编且人数不超上限', await evaluate(before => { const m=__MOSS__.militaryLifeState(); return [m.unit.count-before, m.unit.count+m.unit.wounded<=m.commandLimit, m.institutionFund]; }, forceBefore), [10, true, 65]);

  const saved = await evaluate(() => __MOSS__.serialize());
  const normalized = await evaluate(raw => __MOSS__.normalizeSaveForTest(raw), saved);
  const zeroUnit = await evaluate(raw => {
    const fields = ['training','equipment','morale','supply','discipline'];
    fields.forEach(key => { raw.militaryLife.unit[key] = 0; });
    const restored = __MOSS__.normalizeSaveForTest(raw);
    return fields.map(key => restored.militaryLife.unit[key]);
  }, saved);
  eq('零训练、装备、士气、补给与纪律不会被存档重载恢复', zeroUnit, [0,0,0,0,0]);
  const invalidUnit = await evaluate(raw => {
    raw.militaryLife.unit.morale = 'corrupt';
    raw.militaryLife.unit.supply = -10;
    raw.militaryLife.unit.equipment = 99;
    const restored = __MOSS__.normalizeSaveForTest(raw).militaryLife.unit;
    return [restored.morale, restored.supply, restored.equipment];
  }, saved);
  eq('损坏和越界军队存档数值仍使用默认值或限制到合法范围', invalidUnit, [70,0,5]);
  eq('湿地、职业、邻领、裁判审计在重载后保留', await page.evaluate(s => [s.wetlandLife.habitat,s.professionalLife.waterworks.certified,s.militaryLife.neighbor.settled,s.militaryLife.neighbor.tradeReceived,s.militaryLife.battleRecords.length,s.militaryLife.battleRecords[1].audit.phases.length], normalized), ['open_water',true,true,true,2,3]);
  await evaluate(() => { __MOSS__.saveNow(); }); await page.reload(); await click('继续游戏');
  eq('浏览器存档重载保留阶段 E 与室内场景', await evaluate(() => [__MOSS__.state.sceneId,__MOSS__.militaryLifeState().rank,__MOSS__.professionalLifeState().waterworks.certified]), ['border_barracks','field_commander',true]);
  eq('无浏览器控制台错误', run.errors, []);
  console.log(`阶段 C 湿地、D、E ${passed}/${passed} PASS`);
} finally {
  await run.browser.close();
}
