import assert from 'node:assert/strict';
import {launch,boot,closeWin} from './harness.mjs';
let n=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);n++;console.log('PASS',msg);};
const r=await launch();const p=r.page;const v=f=>p.evaluate(f);
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 // 每个节点独立学习：使用等级/属性夹具，不把十个节点同时塞进三点预算。
 for(const id of ['focus_read','craft_grasp','read_tracks','read_ore','steady','stand_forward','save_strength','balanced_meal','lucky_find','good_meeting']){
  await p.evaluate(id=>{const m=__MOSS__;m.state.char={...m.normalizeChar(null,1),level:3,attr:{int:8,sense:8,nerve:8,body:8,luck:8},talentPoints:1};},id);
  eq(await p.evaluate(id=>__MOSS__.charLearnTalent(id),id),'','入门节点可按学习路径购买：'+id);
 }
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.attr.int=8;m.state.char.talentPoints=1;m.state.exploration.forest=true;m.state.exploration.mine=true;m.devSwitchScene('mine1',14,21);m.state.timeMinutes=600;});
 eq(await v(()=>__MOSS__.personalResearchMinutes()),30,'智力8的研究基础耗时向上取整30分钟');
 await v(()=>__MOSS__.charLearnTalent('focus_read'));
 eq(await v(()=>__MOSS__.personalResearchMinutes()),27,'专注研读产生真实30→27分钟变化');
 const t=await v(()=>__MOSS__.state.timeMinutes);eq(await v(()=>__MOSS__.personalStudy()),true,'矿样研究实际结算');
 eq(Math.round((await v(()=>__MOSS__.state.timeMinutes))-t),27,'研究确实扣27分钟');
 eq(await v(()=>__MOSS__.personalStudy()),false,'研究不能重复刷发现');
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.talentPoints=1;m.devSwitchScene('town',20,8);m.rookieState().engineering=1;m.state.timeMinutes=600;});
 eq(await v(()=>__MOSS__.personalAnalyze()),false,'智力8无工艺理解不能走额外路线');
 await v(()=>__MOSS__.charLearnTalent('craft_grasp'));
 eq(await v(()=>__MOSS__.personalAnalyze()),true,'工艺理解+2实际打开维修分析');
 eq(await v(()=>__MOSS__.rookieState().engineering),3,'分析推进核对记录，保留最后紧固和交付');
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.talentPoints=1;m.charLearnTalent('stand_forward');});
 eq(await v(()=>__MOSS__.personalDuty()),false,'水泵尚未紧固时不能声称安全值守');
 eq(await v(()=>__MOSS__.rookieStep('engineering',3)),true,'先实际紧固并试水');
 eq(await v(()=>__MOSS__.personalDuty()),true,'挺身而出接下有成本的实际值守');
 eq(await v(()=>__MOSS__.personalDuty()),false,'值守必须跨日，不能同天领奖');
 await v(()=>{const m=__MOSS__;m.charApplyRespec();m.state.totalDay++;m.state.timeMinutes=600;});
 eq(await v(()=>__MOSS__.personalDuty()),true,'洗点后仍须并能够履行已经接下的责任');
 eq(await v(()=>__MOSS__.personalDuty()),false,'值守奖励只结算一次');
 for(const id of ['read_tracks','read_ore']){
  await p.evaluate(id=>{const m=__MOSS__;m.state.char.talents={};m.state.char.attr.sense=8;m.state.char.talentPoints=1;m.charLearnTalent(id);},id);
  if(id==='read_tracks')await v(()=>{__MOSS__.openQuestLog(null);});else await v(()=>__MOSS__.openPersonalHollow());
  if(id==='read_tracks')await p.getByRole('button',{name:'小镇入门',exact:true}).click();
  eq(await p.evaluate(id=>!!__MOSS__.personalState().examples[id],id),true,id+'真实界面记录实际方向与线索');await closeWin(p);
 }
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.attr.nerve=8;m.state.char.talentPoints=1;m.charLearnTalent('steady');});
 eq(await v(()=>Number(__MOSS__.personalStunSeconds().toFixed(4))),.3045,'沉着与胆量合计13%硬直缩减');
 await v(()=>{__MOSS__.state.char.attr.nerve=20;});
 eq(await v(()=>__MOSS__.personalStunSeconds()),.26249999999999996,'硬直缩减封顶25%');
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.attr.body=8;m.state.char.talentPoints=1;m.charLearnTalent('balanced_meal');m.state.inventory.bread=1;m.personalState().hp=10;m.state.energy=m.CFG.maxEnergy;});
 eq(await v(()=>__MOSS__.eatItem('bread')),true,'均衡饮食支持受伤且体力满的情况');
 eq(await v(()=>__MOSS__.personalState().hp),23,'生命12×1.15向下取整为13');
 await v(()=>{const m=__MOSS__;m.state.char.talents={};m.state.char.attr={int:5,sense:5,nerve:5,body:5,luck:8};m.state.char.talentPoints=1;m.charLearnTalent('good_meeting');m.devSwitchScene('town',12,14);m.state.timeMinutes=600;});
 eq(await v(()=>__MOSS__.personalMeeting()),true,'好时相逢实际获得普通野莓');
 eq(await v(()=>__MOSS__.personalMeeting()),false,'偶遇当天不能重复');
 await v(()=>{__MOSS__.saveNow();});await p.reload();await p.locator('.boot-actions button').first().click();
 eq(await v(()=>__MOSS__.personalMeeting()),false,'重载不重置七日限制');
 await v(()=>{__MOSS__.state.totalDay+=6;});eq(await v(()=>__MOSS__.personalMeeting()),false,'六日仍不开放');
 await v(()=>{__MOSS__.state.totalDay++;});eq(await v(()=>__MOSS__.personalMeeting()),true,'七日后可再偶遇');
 await v(()=>{const m=__MOSS__;m.state.char.talents={lucky_find:true};m.state.char.attr.luck=20;});eq(await v(()=>__MOSS__.personalLuckyRate()),.17,'普通额外材料概率最多17%');
 // 使用公开确定性种子查找成功周期，再真实采完节点；不是伪造额外物品。
 const cycle=await v(()=>{for(let day=1;day<10000;day++)if(__MOSS__.personalLuckyRoll('forest:11,9',day)<.17)return day;});
 await p.evaluate(day=>{const m=__MOSS__;m.devSwitchScene('forest',11,10);m.state.totalDay=day;m.state.energy=100;m.state.inventory.mushroom=0;m.state.exploration.nodes['forest:11,9']={hp:1,day};},cycle);
 // 节点实际存档 key 与原采集函数一致。
 const gather=await v(()=>{const m=__MOSS__;const before=m.state.inventory.mushroom||0;m.gatherExplore('harvest',11,9);return (m.state.inventory.mushroom||0)-before;});
 eq(gather,3,'顺手所得在合格普通蘑菇采集多给1份');
 const after=await v(()=>__MOSS__.state.inventory.mushroom);eq(await v(()=>__MOSS__.gatherExplore('harvest',11,9)),false,'同周期采空节点不能重复检定');eq(await v(()=>__MOSS__.state.inventory.mushroom),after,'没有重复额外产物');
 const nextCycle=await p.evaluate(day=>{const m=__MOSS__;for(let d=day+1;d<day+1000;d++)if(m.personalLuckyRoll('forest:11,9',d)<.17)return d;},cycle);
 await p.evaluate(day=>{__MOSS__.state.totalDay=day;},nextCycle);
 const oldQty=await v(()=>__MOSS__.state.inventory.mushroom);eq(await v(()=>__MOSS__.gatherExplore('harvest',11,9)),true,'新再生周期可正常采集');eq(await v(()=>__MOSS__.state.inventory.mushroom),oldQty+3,'每个新周期独立检定，不永久锁住旧周期');
 eq(r.errors,[],'十节点浏览器无错误');
}finally{await r.browser.close();}
console.log('R2天赋实际效果 '+n+' 项通过');


