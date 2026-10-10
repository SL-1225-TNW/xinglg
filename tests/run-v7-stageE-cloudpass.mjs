/* Canonical destinations and migration; full E gameplay is in run-phase-cde. */
import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
let passed=0;const eq=(n,a,b)=>{assert.deepEqual(a,b,n);passed++;console.log('PASS',n);};
const run=await launch();
try {
 const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
 const aliases={millvillage:'mill_village',heath:'meadow',cloudpass:'cloud_pass',oldroad:'old_road',bordertown:'neighbor_border'};
 eq('五个旧重复场景移除',await p.evaluate(ids=>ids.every(id=>!__MOSS__.MAPS[id]),Object.keys(aliases)),true);
 eq('五个正式场景保留',await p.evaluate(ids=>ids.every(id=>!!__MOSS__.MAPS[id]),Object.values(aliases)),true);
 eq('五个D职业地点保留',await p.evaluate(()=>['vineyard','clinic','port','quarry','waterworks'].every(id=>!!__MOSS__.MAPS[id])),true);
 eq('所有物理出口目标存在',await p.evaluate(()=>Object.values(__MOSS__.MAPS).every(m=>(m.exits||[]).every(e=>!!__MOSS__.MAPS[e.to]))),true);
 const base=await p.evaluate(()=>__MOSS__.serialize());
 for(const [old,to] of Object.entries(aliases)){
  const r=await p.evaluate(({base,old})=>{
   const raw=JSON.parse(JSON.stringify(base));raw.sceneId=old;raw.player={x:16,y:20,face:'up'};raw.exploration.forest=true;raw.exploration.mine=true;
   raw.travel.discovered={'farm.home':true,'cloud.pass':true,'mill.square':true,'heath.ranch':true,'old.road':true,'border.town':true};
   delete raw.militaryLife;raw.exploration.military={rank:'captain',training:3,commission:{role:'联络官',sinceDay:1,expiresDay:112},units:[],battles:{old_report:{seed:9}},appliedEffectIds:{paid:true},frontier:{started:true,day:7,route:'escort',resolved:'旧章完成'}};
   raw.exploration.oldRoad={found:true,records:2,opened:true};const s=__MOSS__.normalizeSaveForTest(raw);__MOSS__.startGame(s);const again=__MOSS__.normalizeSaveForTest(__MOSS__.serialize());
   return {scene:s.sceneId,roundTrip:again.sceneId,safe:!__MOSS__.MAPS[s.sceneId].solid[s.player.x][s.player.y],nodes:Object.keys(s.travel.discovered).sort(),rank:s.militaryLife.core.rank,report:!!s.militaryLife.core.battles.old_report,flag:s.militaryLife.core.appliedEffectIds.paid,coins:s.coins,reported:s.militaryLife.campaign.reported};
  },{base,old});
  eq(old+'迁移到正式场景',r.scene,to);eq(old+'再次读档不退回小镇',r.roundTrip,to);eq(old+'落点可走',r.safe,true);eq(old+'不重复奖励',r.coins,base.coins);
  eq(old+'保留资格战报与标记',[r.rank,r.report,r.flag,r.reported],['captain',true,true,true]);
  eq(old+'传送记录迁移',r.nodes,['farm.home','meadow.pasture','mill.village','neighbor.market_town','pass.cloud_peak','road.ancient','town.square']);
 }
 const mixed=await p.evaluate(base=>{const raw=JSON.parse(JSON.stringify(base));delete raw.militaryLife.core;raw.militaryLife.registered=true;raw.militaryLife.rank='squad_leader';raw.militaryLife.commandLimit=12;raw.militaryLife.trainingDays=[1,2];raw.militaryLife.appointmentDay=1;raw.militaryLife.institutionFund=100;raw.militaryLife.unit.count=8;raw.militaryLife.unit.training=2;raw.militaryLife.unit.equipment=2;raw.exploration.institution={budget:3000,contracts:[{id:'pending',kind:'equip',cover:2,level:'70',day:1,cost:88,paid:true,delivered:false}]};raw.exploration.military={rank:'captain',training:3,commission:{role:'旧委任',sinceDay:1,expiresDay:112},units:[],battles:{local:{seed:4}},appliedEffectIds:{old_reward:true}};const s=__MOSS__.normalizeSaveForTest(raw);return [s.exploration.military===s.militaryLife.core,s.exploration.institution===s.militaryLife.institution,s.militaryLife.core.rank,s.militaryLife.institutionFund,s.militaryLife.institution.contracts.length,s.militaryLife.migrationArchive.localInstitution.budget,!!s.militaryLife.core.battles.local];},base);
 eq('两路旧军队合为一账，预算不相加且原账归档',mixed,[true,true,'captain',100,1,3000,true]);
 const soil=await p.evaluate(base=>{const raw=JSON.parse(JSON.stringify(base));raw.plots={'7,8':{tilled:true,water:false,crop:null,fertility:12},'8,8':{tilled:true,water:false,crop:null}};raw.soil={zones:{z3:28}};const s=__MOSS__.normalizeSaveForTest(raw);__MOSS__.startGame(s);return [s.plots['7,8'].fertility,s.plots['8,8'].fertility,__MOSS__.soilValue('z3'),__MOSS__.soilBand('z3')];},base);
 eq('地块优先，旧田区补缺并真实汇总',soil,[12,28,20,'低']);await p.keyboard.press('n');eq('田区UI字段有效',(await p.locator('.win-body').textContent()).includes('undefined'),false);await p.keyboard.press('Escape');
 const mill=await p.evaluate(base=>{const raw=JSON.parse(JSON.stringify(base));raw.exploration.millWorks={repaired:true,inspected:true,checked:true,waterTo:'field',plan:'channel'};raw.exploration.millTask={step:3};const s=__MOSS__.normalizeSaveForTest(raw);__MOSS__.startGame(s);return [s.millLife.inspected,s.millLife.delivery,__MOSS__.extendedGateAllowed('vineyard'),s.coins];},base);
 eq('旧磨坊验收衔接D且不再次奖励',mill,[true,true,true,base.coins]);
 await p.evaluate(base=>{const raw=JSON.parse(JSON.stringify(base));delete raw.meadowLife;raw.exploration.meadow={trough:true,sheared:1,sheepFed:3,eggs:4};raw.exploration.meadowTask={step:3};__MOSS__.replaceSave(raw);},base);
 eq('旧牧场验收与存蛋都保留',await p.evaluate(()=>{const m=__MOSS__.meadowLifeState();return [m.troughSeen,m.trough,m.produced,m.redeemed,m.contractDay>0,m.legacyEggs];}),[true,true,1,1,true,4]);
 await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq('旧牧场状态二次读档不失效',await p.evaluate(()=>{const m=__MOSS__.meadowLifeState();return [m.trough,m.produced,m.redeemed,m.legacyEggs];}),[true,1,1,4]);
 await p.evaluate(()=>__MOSS__.devSwitchScene('meadow',7,13));await p.keyboard.press('e');await p.getByRole('button',{name:'领取迁移前存蛋 ×4',exact:true}).click();
 eq('真实鸡舍领取旧存蛋',await p.evaluate(()=>[__MOSS__.meadowLifeState().legacyEggs,__MOSS__.invCount('egg')]),[0,4]);
 eq('已领取存蛋按钮消失',await p.getByRole('button',{name:'领取迁移前存蛋 ×4',exact:true}).count(),0);await p.keyboard.press('Escape');
 await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();eq('读档不复制存蛋',await p.evaluate(()=>[__MOSS__.meadowLifeState().legacyEggs,__MOSS__.invCount('egg')]),[0,4]);
 await p.keyboard.press('m');
 for(const name of ['风铃磨坊','石楠草甸','云峰山口','古道遗址','北境邻领边城'])eq(name+'只有一个地图按钮',await p.getByRole('button',{name:new RegExp('^'+name)}).count(),1);
 eq('浏览器无错误',run.errors,[]);console.log(`E 场景与迁移 ${passed}/${passed} PASS`);
}finally{await run.browser.close();}
