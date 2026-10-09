import assert from 'node:assert/strict';
import {launch, boot, walkTo, faceTowards} from './harness.mjs';

let checks=0;
const eq=(name,a,b)=>{assert.deepEqual(a,b,name);checks++;console.log('PASS',name);};
const run=await launch();
try {
 const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
 const v=(fn,arg)=>p.evaluate(fn,arg);
 const click=name=>p.getByRole('button',{name,exact:true}).click();
 const pose=async(scene,x,y,site)=>{await v(()=>__MOSS__.closeWindow());await v(a=>{__MOSS__.devSwitchScene(a.scene,a.x,a.y);__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=450;if(a.site)__MOSS__.openProfessionSite(a.site);},{scene,x,y,site});};
 const night=async()=>{await v(()=>{__MOSS__.closeWindow();__MOSS__.performSettlement(false);__MOSS__.closeWindow();});};
 const reset=async()=>v(()=>{
   const m=__MOSS__,s=m.state;
   s.professionalLife=m.normalizeSaveForTest({...m.serialize(),professionalLife:undefined}).professionalLife;
   // Boundary fixture: C already completed; D production/results are earned below.
   s.millLife.inspected=true;s.millLife.allocation='balanced';s.exploration.mine=true;
   Object.assign(s.wetlandLife,{permit:true,causeFound:true,upstreamSample:true,outfallSample:true,surveyCount:1,plantSamples:2});
   s.inventory={wood:40,stone:40,iron_ingot:2,marsh_sample:1,grain:20};s.coins=500;s.weather.today='sun';
 });
 await reset();
 await pose('vineyard',21,17,'vineyard');await click('接受计划：封存酒窖批次 · 20分钟');await click('按计划采收葡萄 ×6');
 await pose('vineyard_press',8,7,'press');await click('压榨酒窖批次 · 葡萄 ×4');
 await pose('vineyard_cellar',8,7,'cellar');eq('酒窖不能当日封存',await p.getByRole('button',{name:'封存葡萄酒 ×2 · 隔夜熟成',exact:true}).count(),0);
 await night();await pose('vineyard_cellar',8,7,'cellar');await click('封存葡萄酒 ×2 · 隔夜熟成');
 eq('酒窖真实消耗葡萄并产酒，保留已加工来源计数',await v(()=>[__MOSS__.state.inventory.grape,__MOSS__.state.inventory.wine,__MOSS__.professionalLifeState().vineyard.pressed]),[2,2,4]);
 await pose('vineyard_press',8,7,'press');await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('不能用已加工的本批来源重复压汁',await v(()=>__MOSS__.state.inventory.grape_juice||0),0);
 await pose('vineyard',21,17,'vineyard');await click('安排下一轮采收 · 七天间隔');
 eq('不能提前刷新采收',await v(()=>__MOSS__.professionalLifeState().vineyard.harvested),6);
 for(let i=0;i<6;i++)await night();
 await v(()=>{__MOSS__.state.weather.today='sun';});
 await pose('vineyard',21,17,'vineyard');await click('安排下一轮采收 · 七天间隔');
 eq('医舍访问权限在轮换后保留',await v(()=>__MOSS__.extendedGateAllowed('clinic')),true);
 await click('接受计划：压汁供应医舍 · 20分钟');await click('按计划采收葡萄 ×6');
 await pose('vineyard_press',8,7,'press');await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('酿酒后正常跨日可转做医舍供货',await v(()=>__MOSS__.state.inventory.grape_juice),3);
 await pose('port_office',10,6,'port');await click('核验封签与装卸簿 · 20分钟');await click('封存差额证据并追索 · 35金');
 const ship=p.getByRole('button',{name:'装运葡萄汁至白鸢医舍 · 葡萄汁 ×2',exact:true});
 await ship.evaluate(b=>{window.__dTime=__MOSS__.state.timeMinutes;b.click();window.__dDelta=__MOSS__.state.timeMinutes-window.__dTime;b.click();});
 eq('追索分支增加封签复核耗时',await v(()=>window.__dDelta),50);
 eq('重复装运不覆盖运单或多扣货物',await v(()=>[__MOSS__.state.inventory.grape_juice,__MOSS__.state.inventory.cargo_manifest]),[1,1]);
 await pose('clinic_archive',8,7,'archive');await click('核对湿地水草样本 · 15分钟');
 await pose('clinic_ward',9,7,'clinic');await click('签收医舍葡萄汁运单 · 运单 ×1');await click('辨认药材并建立病历 · 15分钟');await click('配制草药包 ×2 · 芦苇样本与葡萄汁');await click('照护病人并记录复诊 · 草药包 ×1');
 await click('复诊并更新病历 · 10分钟');eq('医舍不能当日复诊',await v(()=>__MOSS__.professionalLifeState().clinic.recovered),false);
 await night();await pose('clinic_ward',9,7,'clinic');await click('复诊并更新病历 · 10分钟');
 eq('酒窖先行路线仍可实际完成医舍合同',await v(()=>__MOSS__.professionalLifeState().clinic.recovered),true);

 await reset();await v(()=>{__MOSS__.state.weather.today='rain';});
 await pose('vineyard',21,17,'vineyard');await click('接受计划：压汁供应医舍 · 20分钟');
 eq('雨天同时提供抢收和延期选择',await p.getByRole('button',{name:'雨天抢收葡萄 ×4',exact:true}).count(),1);
 await click('因雨延期一次 · 10分钟');await click('雨天抢收葡萄 ×4');
 eq('延期不能同日立即兑现',await v(()=>__MOSS__.professionalLifeState().vineyard.harvested),0);
 await night();await v(()=>{__MOSS__.state.weather.today='sun';});await pose('vineyard',21,17,'vineyard');await click('按计划采收葡萄 ×6');
 eq('延期跨夜后晴日收获完整批次',await v(()=>__MOSS__.state.inventory.grape),6);
 await reset();await v(()=>{__MOSS__.state.weather.today='rain';});await pose('vineyard',21,17,'vineyard');await click('接受计划：压汁供应医舍 · 20分钟');await click('雨天抢收葡萄 ×4');
 eq('雨天直接抢收取得较低产量',await v(()=>__MOSS__.state.inventory.grape),4);
 await pose('vineyard_press',8,7,'press');
 const resources=()=>v(()=>{const s=__MOSS__.state;return [s.inventory,s.coins,s.energy,s.timeMinutes,s.professionalLife];});
 await v(()=>{__MOSS__.state.energy=0;});let before=await resources();await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('体力不足不扣料钱时间或改变批次',await resources(),before);
 await v(()=>{__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=1315;});before=await resources();await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('日终不足完整耗时不扣资源',await resources(),before);
 await v(()=>{const m=__MOSS__;m.state.timeMinutes=450;const bag={};Object.keys(m.ITEMS).filter(k=>m.ITEMS[k].kind!=='tool'&&k!=='grape_juice'&&k!=='grape').slice(0,19).forEach(k=>bag[k]=99);bag.grape=5;m.state.inventory=bag;});
 eq('满包夹具真实20格',await v(()=>__MOSS__.countSlots()),20);before=await resources();await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('扣料后仍满包不会损失原料或周期',await resources(),before);
 await v(()=>{__MOSS__.state.inventory.grape=4;});await click('压榨葡萄汁 ×3 · 葡萄 ×4');
 eq('扣完原料腾出一格可以加工',await v(()=>__MOSS__.state.inventory.grape_juice),3);
 await reset();
 await pose('port_office',10,6,'port');await click('核验封签与装卸簿 · 20分钟');await v(()=>{__MOSS__.state.coins=5;});before=await resources();await click('补运两箱并维护合作 · 消耗10金');
 eq('补运金币不足时不改变资源和合同',await resources(),before);
 await pose('port_office',1,10,'port');before=await resources();await click('补运两箱并维护合作 · 消耗10金');
 eq('离开设施范围不能远程办理合同',await resources(),before);
 await reset();
 await pose('port_office',10,6,'port');await click('核验封签与装卸簿 · 20分钟');await v(()=>{__MOSS__.state.inventory.grape_juice=3;__MOSS__.openProfessionSite('port');});await click('装运葡萄汁至白鸢医舍 · 葡萄汁 ×2');await click('封存差额证据并追索 · 35金');
 eq('先装运再处理货差不会把未签收运单错误结清',await v(()=>[__MOSS__.professionalLifeState().port.shipment,__MOSS__.professionalLifeState().port.settled,__MOSS__.state.inventory.cargo_manifest]),['clinic',false,1]);
 await reset();

 await pose('quarry',18,17,'quarry');await click('测量裂隙 · 20分钟');await click('石灰层采区 · 石头 ×6');await click('支护采区 · 木材 ×4');await click('采掘石灰岩料 ×8 · 25分钟');await click('采掘石灰岩料 ×8 · 25分钟');
 eq('石灰层每天一批且防重复',await v(()=>__MOSS__.state.inventory.limestone),8);
 await pose('quarry_shed',8,7,'shed');await click('切割工程石料 ×3 · 石灰岩 ×4');await click('切割工程石料 ×3 · 石灰岩 ×4');
 eq('八份来源可加工两批',await v(()=>__MOSS__.state.inventory.stone_block),6);
 await night();await pose('quarry',18,17,'quarry');await click('采掘石灰岩料 ×8 · 25分钟');
 eq('采场第二天能继续生产',await v(()=>__MOSS__.professionalLifeState().quarry.extracted),16);

 // Isolated completed-waterworks fixture measures actual downstream effects, not just flags.
 for(const policy of ['irrigation','navigation']){
  await reset();await v(policy=>{const m=__MOSS__,w=m.professionalLifeState().waterworks;Object.assign(w,{repair:'pending',receivedStone:true,millOpinion:true,meadowOpinion:true,portOpinion:true,allocation:policy,certified:true});m.state.meadowLife.plots=[{seedDay:m.state.totalDay,waterDays:[]},null,null];m.state.weather.today='sun';},policy);
  await night();eq(policy+' 实际夜结算供水',await v(()=>__MOSS__.state.meadowLife.plots[0].waterDays.length),policy==='irrigation'?1:0);
  await pose('mill_workshop',9,7);await v(()=>__MOSS__.openMillLife('mill'));
  for(let i=0;i<3;i++)await click('磨粉 · 小麦2 → 面粉3');
  eq(policy+' 实际磨坊日额度',await v(()=>__MOSS__.state.inventory.flour),policy==='irrigation'?6:9);
  await pose('port_office',10,6,'port');await v(()=>{__MOSS__.professionalLifeState().port.manifestChecked=true;__MOSS__.state.inventory.grape_juice=3;__MOSS__.openProfessionSite('port');});
  await p.getByRole('button',{name:'装运葡萄汁至白鸢医舍 · 葡萄汁 ×2',exact:true}).evaluate(b=>{const t=__MOSS__.state.timeMinutes;b.click();window.__dDelta=__MOSS__.state.timeMinutes-t;});
  eq(policy+' 实际装运耗时',await v(()=>window.__dDelta),policy==='irrigation'?60:30);
  await v(()=>__MOSS__.saveNow());await p.reload();await click('继续游戏');
  eq(policy+' 读档保留水利选择与未签收运单',await v(()=>[__MOSS__.professionalLifeState().waterworks.allocation,__MOSS__.professionalLifeState().port.settled,__MOSS__.state.inventory.cargo_manifest]),[policy,false,1]);
 }

 // Real keyboard navigation through every D doorway, using an unlocked boundary fixture.
 await reset();await v(()=>{__MOSS__.professionalLifeState().vineyard.harvested=6;__MOSS__.professionalLifeState().quarry.surveyed=true;__MOSS__.professionalLifeState().port.manifestChecked=true;});
 const doors=[['vineyard','vineyard_press',12,9],['vineyard','vineyard_cellar',33,9],['clinic','clinic_ward',12,9],['clinic','clinic_archive',29,9],['port','port_office',23,9],['port','port_lockhouse',34,14],['quarry','quarry_shed',8,15],['waterworks','waterworks_control',9,9]];
 for(const [out,room,x,y] of doors){
   await pose(out,3,arrivalRow(out));
   eq(room+' 步行到门前',await walkTo(p,x,y+1,30000),true);await faceTowards(p,x,y);await p.keyboard.press('e');
   await p.waitForFunction(id=>__MOSS__.state.sceneId===id,room);eq(room+' 实际进入',await v(()=>__MOSS__.state.sceneId),room);
 }
 eq('D 复审无控制台错误',run.errors,[]);console.log(`阶段 D 复审 ${checks}/${checks} PASS`);
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){
  const mobile=await launch({viewport,touch:true});
  try{
   const q=mobile.page;await boot(q);await q.locator('#tutorialSkip').click();
   for(const [scene,x,y] of [['vineyard',21,18],['clinic_ward',9,7],['port_office',10,6],['quarry',18,18],['waterworks_control',8,6]]){
    await q.evaluate(a=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(a.scene,a.x,a.y+1);__MOSS__.state.player.face='up';}, {scene,x,y});
    await q.locator('#touchAct').tap();await q.waitForFunction(()=>__MOSS__.ui.window?.id==='professionlife');
    eq(viewport.width+' '+scene+' 触屏实际打开服务',await q.evaluate(()=>__MOSS__.ui.window.id),'professionlife');
    eq(viewport.width+' '+scene+' 窗口不横向溢出',await q.evaluate(()=>{const b=document.querySelector('.win-body');return b.scrollWidth<=b.clientWidth+1;}),true);
    const npc={vineyard:'vine_lucy',clinic_ward:'clinic_celine',port_office:'port_mia',quarry:'quarry_marl',waterworks_control:'water_engineer'}[scene];
    await q.evaluate(id=>{__MOSS__.closeWindow();__MOSS__.__talkToNpc(id);},npc);
    await q.getByRole('button',{name:'职业服务与合同',exact:true}).tap();
    eq(viewport.width+' '+npc+' 对话可进入对应职业服务',await q.evaluate(()=>__MOSS__.ui.window.id),'professionlife');
   }
   eq(viewport.width+' 手机无控制台错误',mobile.errors,[]);
  }finally{await mobile.browser.close();}
 }
 console.log(`阶段 D 完整复审 ${checks}/${checks} PASS`);
}finally{await run.browser.close();}
function arrivalRow(scene){return scene==='vineyard'?17:scene==='clinic'?16:scene==='port'?18:23;}
