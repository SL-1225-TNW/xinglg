/* 大学施工验收：许可及资源使用夹具；进出、研究和结算使用真实输入。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,walkTo,closeWin,clickWin,winText} from './harness.mjs';
let checks=0;
const eq=(a,b,name)=>{assert.deepEqual(a,b,name);checks++;console.log('PASS',name);};
const bundled=process.argv.includes('--single-file');
const run=await launch(bundled?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=run.page;
const stage=()=>p.evaluate(()=>__MOSS__.state.university.studyStage);
async function pose(id,x,y){await p.evaluate(([id,x,y])=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(id,x,y);},[id,x,y]);await p.waitForTimeout(200);}
async function settled(id){await p.waitForFunction(id=>__MOSS__.state.sceneId===id,id);await p.waitForTimeout(250);}
async function reload(){await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.state.sceneId.startsWith('city_'));}
async function enterFromCity(id){
 const d=await p.evaluate(id=>__MOSS__.INTERACTABLES.city.find(i=>i.id===id),id);
 eq(await walkTo(p,...d.stand[0],90000),true,'校园街道步行到'+id+'门旁');await p.keyboard.press('e');await settled(d.to);
}
async function leaveRoom(){const d=await p.evaluate(()=>__MOSS__.MAPS[__MOSS__.state.sceneId].doors[0]);eq(await walkTo(p,...d.stand[0]),true,'室内步行到原出口');await p.keyboard.press('e');await settled('city');}
try{
 await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>__MOSS__.state.exploration.city=true);
 const audit=await p.evaluate(()=>{
  const M=__MOSS__,bad=[],stairs=[],names=['city_library','city_library_upper','city_uni_main','city_university_main_upper','city_uni_lab','city_greenhouse'];
  for(const id of names){const m=M.MAPS[id],seen=new Set(),q=[[m.enter.x,m.enter.y]];
   while(q.length){const [x,y]=q.pop(),k=x+','+y;if(x<0||y<0||x>=m.w||y>=m.h||m.solid[x][y]||seen.has(k))continue;seen.add(k);q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
   for(let x=0;x<m.w;x++)for(let y=0;y<m.h;y++)if(!m.solid[x][y]&&!seen.has(x+','+y))bad.push(id+':isolated '+x+','+y);
   for(const it of M.INTERACTABLES[id])if(['universityStair','universityStudy'].includes(it.kind)){
    if(!it.stand.every(s=>seen.has(s.join(','))))bad.push(id+': blocked '+it.id);
    if(it.kind==='universityStair'){
     stairs.push(it);if(M.isSolid(it.to,it.tx,it.ty))bad.push(it.id+':blocked destination');
     const back=M.INTERACTABLES[it.to].find(s=>s.kind==='universityStair'&&s.to===id);
     if(!back||back.stand.some(s=>Math.abs(s[0]-it.tx)+Math.abs(s[1]-it.ty)<3))bad.push(it.id+':no safe reverse');
    }
   }
  }
  const sign=M.INTERACTABLES.city.find(i=>i.id==='university_court_guide');
  for(const s of sign.stand)if(M.isSolid('city',...s))bad.push('guide blocked');
  for(const id of ['uni_main','library','academy','greenhouse','uni_lab','uni_wing','uni_dorm']){
   const d=M.INTERACTABLES.city.find(i=>i.id===id);if(!M.findPath('city',...sign.stand[0],...d.stand[0]))bad.push('campus route '+id);
  }
  return{bad,stairs,upperDoors:[M.MAPS.city_library_upper.doors.length,M.MAPS.city_university_main_upper.doors.length]};
 });
 eq(audit.bad,[],'校园主要房间、楼梯站位和院落至七座建筑连通');eq(audit.upperDoors,[0,0],'楼上保留完整外墙，使用内部楼梯返回');
 eq(audit.stairs.length,4,'主楼与图书馆各有成对楼梯');
 for(const it of audit.stairs){await pose(it.sceneId,...it.stand[0]);await p.keyboard.press('e');await settled(it.to);await p.keyboard.press('e');eq(await p.evaluate(()=>__MOSS__.state.sceneId),it.to,it.id+'实际换层且不反弹');}
 await pose('city',500,108);eq(await walkTo(p,503,83),true,'马车落点实际走到校园院落');await p.keyboard.press('e');eq((await winText(p)).includes('首轮研究'),true,'院落导览说明首轮研究');await closeWin(p);
 fs.mkdirSync('output/playwright',{recursive:true});await p.screenshot({path:'output/playwright/university-court.png'});
 await enterFromCity('uni_main');eq(await walkTo(p,12,6),true,'主楼原入口可找到报名公告');await p.keyboard.press('e');await clickWin(p,'报名育苗观察');eq(await stage(),1,'免费报名启动研究');await closeWin(p);
 await leaveRoom();await enterFromCity('library');eq(await walkTo(p,17,11),true,'原图书馆入口走到上梯');await p.keyboard.press('e');await settled('city_library_upper');
 eq(await walkTo(p,25,5),true,'二层楼梯走到专题桌');await p.keyboard.press('e');await clickWin(p,'查阅并记录资料');eq(await stage(),2,'查阅记录保存');await closeWin(p);
 await reload();eq(await stage(),2,'资料阶段读档保留');await p.evaluate(()=>__MOSS__.state.totalDay++);
 await p.screenshot({path:'output/playwright/university-library-upper.png'});
 eq(await walkTo(p,14,4),true,'资料桌走回下梯');await p.keyboard.press('e');await settled('city_library');await leaveRoom();await enterFromCity('greenhouse');
 eq(await walkTo(p,5,9),true,'温室原入口走到观察床');await p.keyboard.press('e');await clickWin(p,'记录育苗观察');eq(await stage(),3,'跨日可继续温室观察');await closeWin(p);
 await leaveRoom();await enterFromCity('uni_lab');eq(await walkTo(p,14,11),true,'实验楼原入口走到核验台');await p.keyboard.press('e');await clickWin(p,'核验萝卜样本');eq(await stage(),3,'缺样本不推进');
 await p.evaluate(()=>{__MOSS__.invAdd('radish',1);__MOSS__.state.timeMinutes=__MOSS__.CFG.dayEnd-1;});await clickWin(p,'核验萝卜样本');eq(await stage(),3,'夜间时间不足不核验');eq(await p.evaluate(()=>__MOSS__.invCount('radish')),1,'时间不足保留样本');
 await p.evaluate(()=>{__MOSS__.state.timeMinutes=420;__MOSS__.state.energy=0;});await clickWin(p,'核验萝卜样本');eq(await stage(),3,'体力不足不核验');
 await p.evaluate(()=>__MOSS__.state.energy=100);await clickWin(p,'核验萝卜样本');eq(await stage(),4,'核验完成且消耗样本');eq(await p.evaluate(()=>__MOSS__.invCount('radish')),0,'样本实际扣一次');await closeWin(p);
 await leaveRoom();await enterFromCity('uni_main');eq(await walkTo(p,11,20),true,'讲堂入口步行找到二层梯');await p.keyboard.press('e');await settled('city_university_main_upper');
 eq(await walkTo(p,7,5),true,'二层研讨桌可找到');await reload();eq(await stage(),4,'待报告状态和二层位置可读档');
 await p.evaluate(()=>{__MOSS__.state.inventory={wood:__MOSS__.CFG.stack*__MOSS__.CFG.bagSlots};});await p.keyboard.press('e');await clickWin(p,'提交研究报告');eq(await stage(),4,'背包满不能丢失报告奖励');
 eq(await p.evaluate(()=>__MOSS__.state.char.expGrants['university.seedling-report']),undefined,'满包不提前发经验');
 await p.evaluate(()=>{__MOSS__.state.inventory={};});await clickWin(p,'提交研究报告');eq(await stage(),5,'报告最终完成');eq(await p.evaluate(()=>__MOSS__.invCount('field_note')),1,'考察笔记真实入包');
 eq(await p.evaluate(()=>Number.isFinite(__MOSS__.state.char.expGrants['university.seedling-report'])),true,'学习经验具有唯一来源');
 await closeWin(p);await p.keyboard.press('e');eq(await p.locator('.win button').filter({hasText:'提交研究报告'}).count(),0,'完成后不再显示重复领奖');eq(await p.evaluate(()=>__MOSS__.invCount('field_note')),1,'重复查看不多发笔记');await closeWin(p);
 await p.locator('#floorTag').click();eq((await winText(p)).includes('记录不宣称样本由玩家种植'),true,'研究记录保留证据边界与结论');await closeWin(p);
 await p.screenshot({path:'output/playwright/university-main-upper.png'});
 eq(await walkTo(p,8,13),true,'研讨桌返回下梯');await p.keyboard.press('e');await settled('city_uni_main');await leaveRoom();
 const saved=await p.evaluate(()=>{const M=__MOSS__,raw=M.serialize();const one=M.normalizeSaveForTest(raw),two=M.normalizeSaveForTest(one);const old={...raw};delete old.university;return{first:one.university,second:two.university,legacy:M.normalizeSaveForTest(old).university};});
 eq(saved.first,saved.second,'大学进度归一化幂等');eq(saved.legacy,{studyStage:0},'旧档安全补空研究');
 eq(run.errors,[],'大学完整流程无页面报错');
}finally{await run.browser.close();}
const mobile=await launch({viewport:{width:390,height:844},touch:true});
try{const p=mobile.page;await boot(p);await p.locator('#tutorialSkip').tap();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.devSwitchScene('city_library',17,11);});await p.waitForTimeout(200);
 await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_library_upper');eq(await p.locator('#floorTag').innerText(),'图书馆 · 二层','手机触屏上楼与楼层牌');await p.locator('#floorTag').tap();eq((await winText(p)).includes('温室'),true,'手机导览可查看温室方向');await closeWin(p);
 await p.evaluate(()=>__MOSS__.devSwitchScene('city_library_upper',14,4));await p.waitForTimeout(200);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_library');eq(await p.locator('#floorTag').innerText(),'图书馆 · 一层','手机可原路下楼');eq(mobile.errors,[],'手机大学通路无报错');
}finally{await mobile.browser.close();}
console.log(`大学 ${checks} 项通过${bundled?'（单文件）':''}`);
